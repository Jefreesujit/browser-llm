export type ChatRole = "system" | "user" | "assistant";

export type Screen = "landing" | "chat";
export type ModelLoadState = "loading" | "ready";

export type ChatAttachment = {
  name: string;
  mimeType: string;
  size: number;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  rawContent?: string;
  reasoning?: string;
  reasoningState?: "streaming" | "complete";
  attachment?: ChatAttachment;
};

export type ThreadMessageStatus = "complete" | "streaming" | "error";

export type ThreadMessage = ChatMessage & {
  threadId: string;
  sequence: number;
  createdAt: string;
  status: ThreadMessageStatus;
  requestId?: string;
};

export type ThreadUiState = {
  threadId: string;
  draftText: string;
  scrollTop: number;
  updatedAt: string;
};

export type DraftAttachment = {
  file: File;
  name: string;
  mimeType: string;
  size: number;
};

export type ChatThread = {
  id: string;
  title: string;
  model: ModelDescriptor;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview: string | null;
  messageCount: number;
  memorySummary: string | null;
  summaryUpToSequence: number;
};

export type ModelTask = "text" | "vision";
export type ModelSource = "curated" | "search" | "recent";
export type CompatibilityVerdict =
  | "verified"
  | "likely"
  | "experimental"
  | "too_large"
  | "unsupported";
export type DeviceTier = "mobile" | "desktop";
export type ParameterTier = "XS" | "S" | "M" | "L" | "XL" | "unknown";
export type PickerTab = "curated" | "search" | "recent";
export type LocalModelVerdict = "verified" | "failed_on_device";
export type CuratedCategoryKey =
  | "mobile_safe"
  | "balanced"
  | "coding"
  | "reasoning"
  | "vision"
  | "desktop_experimental";
export type Dtype = "q4f16" | "q4" | "q8" | "int8" | "uint8" | "fp16" | "fp32";
export type VisionLoaderKind = "qwen3_5";
export type ChatPersistenceStatus =
  | "ready"
  | "fallback_local_storage"
  | "quota_exceeded"
  | "unavailable";

export type DeviceCapabilities = {
  hasWebGpu: boolean;
  supportsFp16: boolean;
  tier: DeviceTier;
  browserLabel: string;
  userAgent: string;
};

export type CompatibilityReport = {
  verdict: CompatibilityVerdict;
  badgeLabel: string;
  secondaryLabel?: string;
  reason: string;
  canLoad: boolean;
};

export type HfModelMetadata = {
  modelId: string;
  pipelineTag: string;
  libraryName?: string;
  tags: string[];
  baseModel?: string;
  downloads?: number;
  likes?: number;
  usedStorage?: number;
  hasChatTemplate?: boolean;
};

export type ModelRuntimeConfig = {
  preferredDtype?: Dtype;
  fallbackDtype?: Dtype;
  contextWindowTokens: number;
  chatTemplateOptions?: Record<string, boolean | number | string>;
  visionLoaderKind?: VisionLoaderKind;
};

export type ModelDescriptor = {
  id: string;
  label: string;
  summary: string;
  source: ModelSource;
  task: ModelTask;
  publisher: string;
  paramsLabel: string;
  parameterTier: ParameterTier;
  estimatedDownloadLabel?: string | null;
  category?: CuratedCategoryKey;
  starter?: boolean;
  tested?: boolean;
  compatibility?: CompatibilityReport;
  hf: HfModelMetadata;
  runtime: ModelRuntimeConfig;
};

export type SearchFilters = {
  mobileSafe: boolean;
  verifiedOnly: boolean;
  showExperimental: boolean;
};

export type MaxTokenMode = "static" | "percentage";

export type AppSettings = {
  temperature: number;
  topP: number;
  maxTokenMode: MaxTokenMode;
  staticMaxTokens: number;
  percentageMaxTokens: number;
};

export type GenerationRequestState = {
  threadId: string;
  requestId: string;
  modelId: string;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  temperature: 0.7,
  topP: 0.9,
  maxTokenMode: "static",
  staticMaxTokens: 2048,
  percentageMaxTokens: 20,
};

export type GenerationOptions = {
  maxNewTokens: number;
  temperature: number;
  topP: number;
};

export type ModelLoadProgress = {
  modelId: string;
  file: string;
  progress: number | null;
  loaded: number | null;
  total: number | null;
} | null;

export type LocalModelVerdictEntry = {
  status: LocalModelVerdict;
  lastLoadedAt: string;
};

export type LocalModelVerdictCache = Record<string, LocalModelVerdictEntry>;

export type StorageWriteResult = {
  ok: boolean;
  reason?: "quota" | "unavailable" | "blocked";
};

export type ChatStoreSnapshot = {
  thread: ChatThread;
  messages: ThreadMessage[];
  uiState: ThreadUiState | null;
};

export type ChatStore = {
  kind: "indexeddb" | "localstorage";
  listThreads: () => Promise<ChatThread[]>;
  getSnapshot: (threadId: string) => Promise<ChatStoreSnapshot | null>;
  putThread: (thread: ChatThread) => Promise<StorageWriteResult>;
  putMessages: (
    threadId: string,
    messages: ThreadMessage[],
  ) => Promise<StorageWriteResult>;
  putUiState: (uiState: ThreadUiState) => Promise<StorageWriteResult>;
  deleteThread: (threadId: string) => Promise<StorageWriteResult>;
  clearAll: () => Promise<StorageWriteResult>;
};

export type WorkerRequest =
  | { type: "LOAD_MODEL"; payload: { model: ModelDescriptor } }
  | {
      type: "STOP_GENERATION";
      payload?: { threadId?: string; requestId?: string };
    }
  | {
      type: "GENERATE";
      payload: {
        threadId: string;
        requestId: string;
        model: ModelDescriptor;
        summary: string | null;
        summaryUpToSequence: number;
        messages: ThreadMessage[];
        image?: File | null;
        options: GenerationOptions;
      };
    };

export type WorkerResponse =
  | {
      type: "LOAD_PROGRESS";
      payload: {
        modelId: string;
        file: string;
        progress: number | null;
        loaded: number | null;
        total: number | null;
      };
    }
  | { type: "MODEL_READY"; payload: { modelId: string } }
  | {
      type: "MODEL_LOAD_RESULT";
      payload: {
        modelId: string;
        status: "verified" | "failed_on_device";
        message?: string;
      };
    }
  | {
      type: "STREAM_TOKEN";
      payload: {
        threadId: string;
        requestId: string;
        modelId: string;
        text: string;
      };
    }
  | {
      type: "GENERATION_DONE";
      payload: {
        threadId: string;
        requestId: string;
        modelId: string;
        text: string;
        summary: string | null;
        summaryUpToSequence: number;
      };
    }
  | {
      type: "ERROR";
      payload: {
        threadId?: string;
        requestId?: string;
        modelId: string;
        message: string;
      };
    };
