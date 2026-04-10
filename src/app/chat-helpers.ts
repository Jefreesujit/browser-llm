import type {
  AppSettings,
  ChatAttachment,
  ChatMessage,
  ChatThread,
  GenerationOptions,
  ModelDescriptor,
  ThreadMessage,
  ThreadUiState,
} from "../types";

const THINK_OPEN_TAG = "<think>";
const THINK_CLOSE_TAG = "</think>";

export const computeGenerationOptions = (
  settings: AppSettings,
  contextWindowTokens: number,
): GenerationOptions => {
  const maxNewTokens =
    settings.maxTokenMode === "percentage"
      ? Math.max(
          64,
          Math.floor(
            (contextWindowTokens * settings.percentageMaxTokens) / 100,
          ),
        )
      : settings.staticMaxTokens;

  return {
    maxNewTokens: Math.min(Math.max(maxNewTokens, 64), contextWindowTokens),
    temperature: settings.temperature,
    topP: settings.topP,
  };
};

export const parseAssistantResponse = (rawContent: string) => {
  const thinkStart = rawContent.indexOf(THINK_OPEN_TAG);

  if (thinkStart === -1) {
    return {
      content: rawContent,
      reasoning: undefined,
      reasoningState: undefined,
    };
  }

  const thinkContentStart = thinkStart + THINK_OPEN_TAG.length;
  const thinkEnd = rawContent.indexOf(THINK_CLOSE_TAG, thinkContentStart);

  if (thinkEnd === -1) {
    return {
      content: rawContent.slice(0, thinkStart).trim(),
      reasoning: rawContent.slice(thinkContentStart).trim(),
      reasoningState: "streaming" as const,
    };
  }

  const beforeThink = rawContent.slice(0, thinkStart);
  const afterThink = rawContent.slice(thinkEnd + THINK_CLOSE_TAG.length);

  return {
    content: `${beforeThink}${afterThink}`.trim(),
    reasoning: rawContent.slice(thinkContentStart, thinkEnd).trim(),
    reasoningState: "complete" as const,
  };
};

export const applyAssistantContent = (
  message: ThreadMessage,
  rawContent: string,
): ThreadMessage => {
  const parsed = parseAssistantResponse(rawContent);

  return {
    ...message,
    rawContent,
    content: parsed.content,
    reasoning: parsed.reasoning,
    reasoningState: parsed.reasoningState,
  };
};

export const uniqueModelsById = (models: ModelDescriptor[]) => [
  ...new Map(models.map((model) => [model.id, model])).values(),
];

export const sortThreadsByUpdatedAt = (threads: ChatThread[]) =>
  [...threads].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );

export const stripModelCompatibility = (
  model: ModelDescriptor,
): ModelDescriptor => {
  const { compatibility: _compatibility, ...rest } = model;
  return rest;
};

export const buildThreadTitle = (
  messages: Array<ChatMessage | ThreadMessage>,
) => {
  const firstUserText = messages.find(
    (message) => message.role === "user" && message.content.trim().length > 0,
  )?.content;

  if (firstUserText) {
    const normalized = firstUserText.replace(/\s+/g, " ").trim();
    return normalized.length > 42
      ? `${normalized.slice(0, 42).trimEnd()}…`
      : normalized;
  }

  const firstAttachment = messages.find(
    (message) => message.attachment,
  )?.attachment;
  if (firstAttachment) {
    return `Image chat · ${firstAttachment.name}`;
  }

  return "New chat";
};

export const buildLastMessagePreview = (messages: ThreadMessage[]) => {
  const lastMessage = [...messages]
    .reverse()
    .find((message) => message.content.trim().length > 0 || message.attachment);

  if (!lastMessage) {
    return null;
  }

  if (lastMessage.content.trim().length > 0) {
    const normalized = lastMessage.content.replace(/\s+/g, " ").trim();
    return normalized.length > 72
      ? `${normalized.slice(0, 72).trimEnd()}…`
      : normalized;
  }

  return lastMessage.attachment
    ? `Image · ${lastMessage.attachment.name}`
    : null;
};

export const createThreadRecord = (model: ModelDescriptor): ChatThread => {
  const timestamp = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: "New chat",
    model: stripModelCompatibility(model),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastMessagePreview: null,
    messageCount: 0,
    memorySummary: null,
    summaryUpToSequence: 0,
  };
};

export const updateThreadFromMessages = (
  thread: ChatThread,
  messages: ThreadMessage[],
  overrides: Partial<ChatThread> = {},
): ChatThread => ({
  ...thread,
  ...overrides,
  title: buildThreadTitle(messages),
  lastMessagePreview: buildLastMessagePreview(messages),
  messageCount: messages.length,
  updatedAt: overrides.updatedAt ?? new Date().toISOString(),
});

export const createThreadMessage = (
  threadId: string,
  sequence: number,
  role: ThreadMessage["role"],
  content: string,
  options?: {
    attachment?: ChatAttachment;
    status?: ThreadMessage["status"];
    requestId?: string;
  },
): ThreadMessage => ({
  id: crypto.randomUUID(),
  threadId,
  sequence,
  role,
  content,
  attachment: options?.attachment,
  createdAt: new Date().toISOString(),
  status: options?.status ?? "complete",
  requestId: options?.requestId,
});

export const createDefaultThreadUiState = (
  threadId: string,
): ThreadUiState => ({
  threadId,
  draftText: "",
  scrollTop: 0,
  updatedAt: new Date().toISOString(),
});
