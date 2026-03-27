export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  rawContent?: string;
  reasoning?: string;
  reasoningState?: "streaming" | "complete";
  attachment?: {
    name: string;
    mimeType: string;
    size: number;
  };
};

export type ModelMode = "fast" | "thinking" | "vision";

export type WorkerRequest =
  | { type: "LOAD_MODEL"; payload: { mode: ModelMode } }
  | {
      type: "GENERATE";
      payload: { mode: ModelMode; messages: ChatMessage[]; image?: File | null };
    }
  | { type: "RESET_CHAT" };

export type WorkerResponse =
  | {
      type: "LOAD_PROGRESS";
      payload: {
        mode: ModelMode;
        file: string;
        progress: number | null;
        loaded: number | null;
        total: number | null;
      };
    }
  | { type: "MODEL_READY"; payload: { mode: ModelMode } }
  | { type: "STREAM_TOKEN"; payload: { mode: ModelMode; text: string } }
  | { type: "GENERATION_DONE"; payload: { mode: ModelMode; text: string } }
  | { type: "ERROR"; payload: { mode: ModelMode; message: string } };
