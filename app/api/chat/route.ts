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

  const key = body.settings?.openrouterKey || process.env.OPENROUTER_API_KEY;
  const model = body.settings?.model || DEFAULT_MODEL;
  const question = (body.question || "").trim();

  const enc = new TextEncoder();
  const sse = (o: unknown) => enc.encode(`data: ${JSON.stringify(o)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (!question) throw new Error("Empty question.");
        if (!key) throw new Error("OpenRouter API key missing. Add it in Config settings.");

        const messages = [
          {
            role: "system",
            content: `You are a sharp company-research analyst. Answer questions about ${body.company || "the company"} using ONLY the research context below. Be concise and specific; use short paragraphs or bullet points. If the answer isn't in the context, say what's known and note the gap — don't invent facts.\n\n=== RESEARCH CONTEXT ===\n${body.context || "(no context available)"}`,
          },
          ...(body.history || []).slice(-6),
          { role: "user", content: question },
        ];

        const res = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://company-research-assistant.vercel.app",
            "X-Title": "AI Company Research Assistant",
          },
          body: JSON.stringify({ model, messages, temperature: 0.5, max_tokens: 900, stream: true }),
          signal: AbortSignal.timeout(55000),
        });

        if (!res.ok || !res.body) {
          const t = await res.text().catch(() => "");
          throw new Error(`OpenRouter error: ${t.slice(0, 200) || res.status}`);
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
