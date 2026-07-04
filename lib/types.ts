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

export const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

export const MODEL_OPTIONS = [
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)" },
  { id: "meta-llama/llama-3.1-8b-instruct:free", label: "Llama 3.1 8B (free)" },
  { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3 (free)" },
  { id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash (free)" },
  { id: "x-ai/grok-4-fast:free", label: "Grok 4 Fast (free)" },
];
