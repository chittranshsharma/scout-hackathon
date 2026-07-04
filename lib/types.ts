export type Competitor = { name: string; website: string };

export type Report = {
  company: {
    name: string;
    website: string;
    phone?: string;
    address?: string;
    products: string[];
    painPoints: string[];
    summary: string;
  };
  competitors: Competitor[];
  sources: string[];
  model: string;
};

export type Settings = {
  openrouterKey?: string;
  model?: string;
  serperKey?: string;
  discordBotToken?: string;
  discordChannelId?: string;
  applicantName?: string;
  applicantEmail?: string;
};

// Progress events streamed over SSE from /api/research
export type ProgressStage =
  | "resolving"
  | "crawling"
  | "searching"
  | "analyzing"
  | "done"
  | "error";

export type ProgressEvent = {
  type: "progress";
  stage: ProgressStage;
  message: string;
  detail?: string;
};

export type ReportEvent = { type: "report"; report: Report };
export type ErrorEvent = { type: "error"; message: string };
export type StreamEvent = ProgressEvent | ReportEvent | ErrorEvent;

// All slugs verified free (prompt+completion pricing $0) on OpenRouter — see
// https://openrouter.ai/api/v1/models. General-purpose instruct/chat models only.
export const DEFAULT_MODEL = "openai/gpt-oss-120b:free";

export const MODEL_OPTIONS = [
  { id: "openai/gpt-oss-120b:free", label: "GPT-OSS 120B (free)" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)" },
  { id: "qwen/qwen3-next-80b-a3b-instruct:free", label: "Qwen3 Next 80B (free)" },
  { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B (free)" },
  { id: "openai/gpt-oss-20b:free", label: "GPT-OSS 20B (free)" },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super 120B (free)" },
];
