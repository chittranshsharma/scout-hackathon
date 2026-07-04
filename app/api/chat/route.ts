import { NextRequest } from "next/server";
import { DEFAULT_MODEL, type ChatMessage, type Settings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Follow-up Q&A grounded on the research context. Streams answer tokens as SSE.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    question?: string;
    context?: string;
    company?: string;
    history?: ChatMessage[];
    settings?: Settings;
  };

  const openrouterKey = body.settings?.openrouterKey || process.env.OPENROUTER_API_KEY;
  const groqKey = body.settings?.groqKey || process.env.GROQ_API_KEY;
  const serperKey = body.settings?.serperKey || process.env.SERPER_API_KEY;
  const model = body.settings?.model || DEFAULT_MODEL;
  const question = (body.question || "").trim();

  const isGroq = model.startsWith("groq:");
  const actualModel = isGroq ? model.replace("groq:", "") : model;
  const url = isGroq ? "https://api.groq.com/openai/v1/chat/completions" : OPENROUTER_URL;

  const enc = new TextEncoder();
  const sse = (o: unknown) => enc.encode(`data: ${JSON.stringify(o)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (!question) throw new Error("Empty question.");

        const authKey = isGroq ? groqKey : openrouterKey;
        if (!authKey) {
          throw new Error(
            isGroq
              ? "Groq API key missing. Add it in Config settings."
              : "OpenRouter API key missing. Add it in Config settings."
          );
        }

        // Live web search for the specific question to ground it in real-time facts
        let extraContext = "";
        if (serperKey) {
          try {
            const searchQuery = body.company ? `${body.company} ${question}` : question;
            const sRes = await fetch("https://google.serper.dev/search", {
              method: "POST",
              headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
              body: JSON.stringify({ q: searchQuery, num: 6 }),
              signal: AbortSignal.timeout(8000),
            });
            if (sRes.ok) {
              const sData = await sRes.json();
              const snippets: string[] = [];
              if (sData.answerBox?.snippet) snippets.push(sData.answerBox.snippet);
              for (const r of sData.organic ?? []) {
                if (r.snippet) snippets.push(r.snippet);
              }
              if (snippets.length > 0) {
                extraContext = `\n\n=== LIVE WEB SEARCH SNIPPETS ===\n${snippets.join("\n")}`;
              }
            }
          } catch {
            // best-effort search
          }
        }

        const messages = [
          {
            role: "system",
            content: `You are a sharp company-research analyst. Answer questions about ${body.company || "the company"} using the research context below. Use the live web search snippets or your own pre-trained knowledge to fill in any gaps or provide helpful comparisons. Be concise, objective, and specific; use short paragraphs or bullet points.\n\n=== RESEARCH CONTEXT ===\n${body.context || "(no context available)"}${extraContext}`,
          },
          ...(body.history || []).slice(-6),
          { role: "user", content: question },
        ];

        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authKey}`,
            "Content-Type": "application/json",
            ...(isGroq ? {} : {
              "HTTP-Referer": "https://company-research-assistant.vercel.app",
              "X-Title": "AI Company Research Assistant",
            }),
          },
          body: JSON.stringify({ model: actualModel, messages, temperature: 0.5, max_tokens: 400, stream: true }),
          signal: AbortSignal.timeout(55000),
        });

        if (!res.ok || !res.body) {
          const t = await res.text().catch(() => "");
          throw new Error(`${isGroq ? "Groq" : "OpenRouter"} error: ${t.slice(0, 200) || res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            const l = line.trim();
            if (!l.startsWith("data:")) continue;
            const data = l.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(sse({ type: "delta", text: delta }));
            } catch {
              // partial JSON chunk; ignore
            }
          }
        }
        controller.enqueue(sse({ type: "done" }));
      } catch (err) {
        controller.enqueue(sse({ type: "error", message: err instanceof Error ? err.message : "Chat failed" }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
