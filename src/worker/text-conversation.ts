import type {
  ChatRole,
  GenerationOptions,
  ModelDescriptor,
  ThreadMessage,
} from "../types";
import type { SummaryResult, TextGeneratorInstance } from "./model-session";

const PROMPT_SAFETY_MARGIN = 128;

export const toConversationMessage = (message: ThreadMessage) => ({
  role: message.role,
  content: message.content,
});

export const normalizeConversationTurns = (
  messages: Array<{ role: ChatRole; content: string }>,
) => {
  const systemMessages = messages.filter(
    (message) => message.role === "system" && message.content.trim().length > 0,
  );
  const nonSystemMessages = messages.filter(
    (message) => message.role !== "system" && message.content.trim().length > 0,
  );

  const firstUserIndex = nonSystemMessages.findIndex(
    (message) => message.role === "user",
  );
  const candidateTurns =
    firstUserIndex === -1 ? [] : nonSystemMessages.slice(firstUserIndex);

  const normalizedTurns: Array<{ role: ChatRole; content: string }> = [];
  for (const message of candidateTurns) {
    const trimmedContent = message.content.trim();
    if (trimmedContent.length === 0) {
      continue;
    }

    const previousMessage = normalizedTurns.at(-1);
    if (previousMessage?.role === message.role) {
      previousMessage.content =
        `${previousMessage.content}\n\n${trimmedContent}`.trim();
      continue;
    }

    normalizedTurns.push({
      role: message.role,
      content: trimmedContent,
    });
  }

  return [...systemMessages, ...normalizedTurns];
};

export const getConversationTokenCount = (
  tokenizer: any,
  model: ModelDescriptor,
  messages: Array<{ role: ChatRole; content: string }>,
) => {
  const encoded = tokenizer.apply_chat_template(messages, {
    tokenize: true,
    add_generation_prompt: true,
    return_tensor: false,
    return_dict: false,
    ...model.runtime.chatTemplateOptions,
  });

  if (Array.isArray(encoded)) {
    return encoded.length;
  }

  if (encoded?.input_ids && Array.isArray(encoded.input_ids)) {
    return encoded.input_ids.length;
  }

  return 0;
};

export const computePromptBudget = (
  model: ModelDescriptor,
  options: GenerationOptions,
) => {
  const reservedOutputTokens = Math.min(
    model.runtime.contextWindowTokens,
    Math.max(
      options.maxNewTokens,
      Math.min(
        1024,
        Math.max(256, Math.floor(model.runtime.contextWindowTokens * 0.2)),
      ),
    ),
  );

  return Math.max(
    256,
    model.runtime.contextWindowTokens -
      reservedOutputTokens -
      PROMPT_SAFETY_MARGIN,
  );
};

export const shouldRefreshSummary = (
  unsummarizedMessageCount: number,
  unsummarizedTokenCount: number,
  promptBudget: number,
) =>
  unsummarizedMessageCount >= 8 ||
  unsummarizedTokenCount > Math.floor(promptBudget * 0.35);

export const formatTranscript = (messages: ThreadMessage[]) =>
  messages
    .map((message) => {
      const role = message.role === "assistant" ? "Assistant" : "User";
      const attachmentNote = message.attachment
        ? ` [attachment: ${message.attachment.name}]`
        : "";
      return `${role}:${attachmentNote}\n${message.content || "(empty)"}`;
    })
    .join("\n\n");

type BuildTextConversationParams = {
  model: ModelDescriptor;
  generator: TextGeneratorInstance;
  messages: ThreadMessage[];
  summary: string | null;
  summaryUpToSequence: number;
  options: GenerationOptions;
  refreshSummary: (
    olderMessages: ThreadMessage[],
    promptBudget: number,
  ) => Promise<SummaryResult>;
};

export const buildTextConversation = async ({
  model,
  generator,
  messages,
  summary,
  summaryUpToSequence,
  options,
  refreshSummary,
}: BuildTextConversationParams) => {
  const promptBudget = computePromptBudget(model, options);
  const completeMessages = messages.filter(
    (message) => message.status !== "error",
  );

  let conversationPrefix = summary
    ? ([
        { role: "system", content: `Conversation memory:\n${summary}` },
      ] satisfies Array<{
        role: ChatRole;
        content: string;
      }>)
    : [];

  let retainedMessages: ThreadMessage[] = [];
  let retainedStartIndex = completeMessages.length;

  for (let index = completeMessages.length - 1; index >= 0; index -= 1) {
    const candidate = [completeMessages[index], ...retainedMessages];
    const normalizedCandidate = normalizeConversationTurns([
      ...conversationPrefix,
      ...candidate.map(toConversationMessage),
    ]);
    const tokenCount = getConversationTokenCount(
      generator.tokenizer,
      model,
      normalizedCandidate,
    );

    if (tokenCount <= promptBudget || retainedMessages.length === 0) {
      retainedMessages = candidate;
      retainedStartIndex = index;
      continue;
    }

    break;
  }

  const olderMessages = completeMessages.slice(0, retainedStartIndex);
  const refreshedSummary = await refreshSummary(olderMessages, promptBudget);

  conversationPrefix = refreshedSummary.summary
    ? [
        {
          role: "system",
          content: `Conversation memory:\n${refreshedSummary.summary}`,
        },
      ]
    : [];

  retainedMessages = [];
  retainedStartIndex = completeMessages.length;

  for (let index = completeMessages.length - 1; index >= 0; index -= 1) {
    const candidate = [completeMessages[index], ...retainedMessages];
    const normalizedCandidate = normalizeConversationTurns([
      ...conversationPrefix,
      ...candidate.map(toConversationMessage),
    ]);
    const tokenCount = getConversationTokenCount(
      generator.tokenizer,
      model,
      normalizedCandidate,
    );

    if (tokenCount <= promptBudget || retainedMessages.length === 0) {
      retainedMessages = candidate;
      retainedStartIndex = index;
      continue;
    }

    break;
  }

  return {
    conversation: normalizeConversationTurns([
      ...conversationPrefix,
      ...retainedMessages.map(toConversationMessage),
    ]),
    summary: refreshedSummary.summary,
    summaryUpToSequence:
      refreshedSummary.summaryUpToSequence ?? summaryUpToSequence,
  };
};
