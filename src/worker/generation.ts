import type { Tensor } from "@huggingface/transformers";
import {
  InterruptableStoppingCriteria,
  RawImage,
  TextStreamer,
} from "@huggingface/transformers";

import type {
  GenerationOptions,
  ModelDescriptor,
  ThreadMessage,
} from "../types";
import type {
  ModelSession,
  SummaryResult,
  TextGeneratorInstance,
  WorkerMessagePoster,
} from "./model-session";
import {
  buildTextConversation,
  formatTranscript,
  getConversationTokenCount,
  shouldRefreshSummary,
  toConversationMessage,
} from "./text-conversation";

const SUMMARY_GENERATION_CONFIG = {
  max_new_tokens: 384,
  temperature: 0.2,
  top_p: 0.9,
  do_sample: true,
};

const summarizeOlderMessages = async (
  model: ModelDescriptor,
  generator: TextGeneratorInstance,
  currentSummary: string | null,
  messagesToSummarize: ThreadMessage[],
): Promise<string | null> => {
  if (messagesToSummarize.length === 0) {
    return currentSummary;
  }

  const prompt = [
    {
      role: "system" as const,
      content:
        "Maintain a concise running memory for a chat. Keep only durable facts: user preferences, goals, decisions, important constraints, unresolved follow-ups, and concrete facts needed later. Do not include filler. Write plain text, 8-12 short bullet points maximum.",
    },
    {
      role: "user" as const,
      content: [
        "Existing summary:",
        currentSummary?.trim() || "(none)",
        "",
        "Older conversation turns to compress:",
        formatTranscript(messagesToSummarize),
        "",
        "Return the updated conversation memory.",
      ].join("\n"),
    },
  ];

  const output = await generator(prompt, {
    ...SUMMARY_GENERATION_CONFIG,
    return_full_text: false,
    tokenizer_encode_kwargs: {
      max_length: Math.max(
        1024,
        Math.floor(model.runtime.contextWindowTokens * 0.6),
      ),
      truncation: true,
      ...model.runtime.chatTemplateOptions,
    },
  });

  const finalMessage = output[0]?.generated_text.at(-1);
  return typeof finalMessage?.content === "string"
    ? finalMessage.content.trim()
    : currentSummary;
};

const refreshConversationSummary = async (
  model: ModelDescriptor,
  generator: TextGeneratorInstance,
  currentSummary: string | null,
  summaryUpToSequence: number,
  olderMessages: ThreadMessage[],
  promptBudget: number,
): Promise<SummaryResult> => {
  if (olderMessages.length === 0) {
    return { summary: currentSummary, summaryUpToSequence };
  }

  const unsummarizedOlderMessages = olderMessages.filter(
    (message) => message.sequence > summaryUpToSequence,
  );

  if (unsummarizedOlderMessages.length === 0) {
    return { summary: currentSummary, summaryUpToSequence };
  }

  const unsummarizedTokenCount = getConversationTokenCount(
    generator.tokenizer,
    model,
    unsummarizedOlderMessages.map(toConversationMessage),
  );

  if (
    !shouldRefreshSummary(
      unsummarizedOlderMessages.length,
      unsummarizedTokenCount,
      promptBudget,
    )
  ) {
    return { summary: currentSummary, summaryUpToSequence };
  }

  try {
    const summary = await summarizeOlderMessages(
      model,
      generator,
      currentSummary,
      unsummarizedOlderMessages,
    );

    return {
      summary,
      summaryUpToSequence:
        olderMessages.at(-1)?.sequence ?? summaryUpToSequence,
    };
  } catch {
    return { summary: currentSummary, summaryUpToSequence };
  }
};

type GenerateTextReplyParams = {
  session: ModelSession;
  postMessageToUi: WorkerMessagePoster;
  model: ModelDescriptor;
  messages: ThreadMessage[];
  summary: string | null;
  summaryUpToSequence: number;
  options: GenerationOptions;
  threadId: string;
  requestId: string;
};

export const generateTextReply = async ({
  session,
  postMessageToUi,
  model,
  messages,
  summary,
  summaryUpToSequence,
  options,
  threadId,
  requestId,
}: GenerateTextReplyParams) => {
  await session.ensureModelReady(model);

  const textGenerator = session.getTextGenerator();
  if (!textGenerator) {
    throw new Error("The selected text model is not ready yet.");
  }

  session.assertChatTemplate(model, textGenerator);

  const conversationPlan = await buildTextConversation({
    model,
    generator: textGenerator,
    messages,
    summary,
    summaryUpToSequence,
    options,
    refreshSummary: (olderMessages, promptBudget) =>
      refreshConversationSummary(
        model,
        textGenerator,
        summary,
        summaryUpToSequence,
        olderMessages,
        promptBudget,
      ),
  });

  let streamedText = "";
  const stoppingCriteria = new InterruptableStoppingCriteria();
  session.setActiveStoppingCriteria(stoppingCriteria);
  const streamer = new TextStreamer(textGenerator.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text) => {
      streamedText += text;
      postMessageToUi({
        type: "STREAM_TOKEN",
        payload: { threadId, requestId, modelId: model.id, text },
      });
    },
  });

  const output = await textGenerator(conversationPlan.conversation, {
    max_new_tokens: options.maxNewTokens,
    temperature: options.temperature,
    top_p: options.topP,
    do_sample: true,
    return_full_text: false,
    streamer,
    stopping_criteria: stoppingCriteria,
  });

  const finalMessage = output[0]?.generated_text.at(-1);
  session.clearActiveStoppingCriteria();

  return {
    text:
      typeof finalMessage?.content === "string"
        ? finalMessage.content
        : streamedText,
    summary: conversationPlan.summary,
    summaryUpToSequence: conversationPlan.summaryUpToSequence,
  };
};

const toVisionConversation = (messages: ThreadMessage[], hasImage: boolean) =>
  messages.map((message, index) => {
    const isLatest = index === messages.length - 1;
    const content = [];

    if (hasImage && isLatest && message.role === "user") {
      content.push({ type: "image" as const });
    }

    if (message.content.trim().length > 0 || content.length === 0) {
      content.push({ type: "text" as const, text: message.content });
    }

    return {
      role: message.role,
      content,
    };
  });

const buildVisionWindow = (messages: ThreadMessage[]) => messages.slice(-8);

type GenerateVisionReplyParams = {
  session: ModelSession;
  postMessageToUi: WorkerMessagePoster;
  model: ModelDescriptor;
  messages: ThreadMessage[];
  image: File | null | undefined;
  threadId: string;
  requestId: string;
};

export const generateVisionReply = async ({
  session,
  postMessageToUi,
  model,
  messages,
  image,
  threadId,
  requestId,
}: GenerateVisionReplyParams) => {
  await session.ensureModelReady(model);

  const processor = session.getProcessor();
  const visionModel = session.getVisionModel();
  if (!processor || !visionModel) {
    throw new Error("The selected vision model is not ready yet.");
  }

  const recentMessages = buildVisionWindow(messages);
  const prompt = processor.apply_chat_template(
    toVisionConversation(recentMessages, Boolean(image)),
    {
      add_generation_prompt: true,
    },
  );
  const rawImage = image ? await RawImage.read(image) : null;
  const inputs = rawImage
    ? await processor(prompt, rawImage)
    : await processor(prompt);

  let streamedText = "";
  const stoppingCriteria = new InterruptableStoppingCriteria();
  session.setActiveStoppingCriteria(stoppingCriteria);
  const streamer = new TextStreamer(processor.tokenizer!, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text) => {
      streamedText += text;
      postMessageToUi({
        type: "STREAM_TOKEN",
        payload: { threadId, requestId, modelId: model.id, text },
      });
    },
  });

  const output = await visionModel.generate({
    ...inputs,
    max_new_tokens: 1024,
    temperature: 0.7,
    top_p: 0.9,
    do_sample: true,
    streamer,
    stopping_criteria: stoppingCriteria,
  });

  const sequences = (
    "sequences" in output ? output.sequences : output
  ) as Tensor;
  const inputLength = inputs.input_ids.dims.at(-1) ?? 0;
  const decoded = processor.batch_decode(
    sequences.slice(null, [inputLength, null]),
    {
      skip_special_tokens: true,
    },
  );
  session.clearActiveStoppingCriteria();

  return {
    text: decoded[0] ?? streamedText,
    summary: null,
    summaryUpToSequence: 0,
  };
};
