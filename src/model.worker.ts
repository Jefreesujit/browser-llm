import {
  AutoProcessor,
  InterruptableStoppingCriteria,
  Qwen3_5ForConditionalGeneration,
  RawImage,
  TextStreamer,
  pipeline,
} from "@huggingface/transformers";
import type { Tensor } from "@huggingface/transformers";

import type {
  ChatRole,
  GenerationOptions,
  ModelDescriptor,
  ThreadMessage,
  WorkerRequest,
  WorkerResponse,
} from "./types";

const SUMMARY_GENERATION_CONFIG = {
  max_new_tokens: 384,
  temperature: 0.2,
  top_p: 0.9,
  do_sample: true,
};

const PROMPT_SAFETY_MARGIN = 128;

type ProcessorInstance = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
type VisionModelInstance = Awaited<
  ReturnType<typeof Qwen3_5ForConditionalGeneration.from_pretrained>
>;
type TextGeneratorInstance = {
  tokenizer: any;
  dispose?: () => Promise<unknown>;
  (
    messages: Array<{ role: ChatRole; content: string }>,
    options: Record<string, unknown>,
  ): Promise<Array<{ generated_text: Array<{ role: string; content: string }> }>>;
};

type LoadResources = {
  textGenerator: TextGeneratorInstance | null;
  processor: ProcessorInstance | null;
  visionModel: VisionModelInstance | null;
};

type SummaryResult = {
  summary: string | null;
  summaryUpToSequence: number;
};

let activeModelId: string | null = null;
let textGenerator: TextGeneratorInstance | null = null;
let processor: ProcessorInstance | null = null;
let visionModel: VisionModelInstance | null = null;
let loadingPromise: Promise<void> | null = null;
let loadingModelId: string | null = null;
let latestLoadNonce = 0;
let activeStoppingCriteria: InterruptableStoppingCriteria | null = null;

const postMessageToUi = (message: WorkerResponse) => {
  self.postMessage(message);
};

const postError = (
  modelId: string,
  error: unknown,
  threadId?: string,
  requestId?: string,
) => {
  const message =
    error instanceof Error ? error.message : "Something went wrong while running the model.";
  postMessageToUi({ type: "ERROR", payload: { modelId, message, threadId, requestId } });

  if (!threadId || !requestId) {
    postMessageToUi({
      type: "MODEL_LOAD_RESULT",
      payload: { modelId, status: "failed_on_device", message },
    });
  }
};

const getProgressHandler = (modelId: string) => {
  return (event: {
    file?: string;
    name?: string;
    progress?: number;
    loaded?: number;
    total?: number;
    status?: string;
  }) => {
    if (event.status === "done") {
      return;
    }

    postMessageToUi({
      type: "LOAD_PROGRESS",
      payload: {
        modelId,
        file: event.file ?? event.name ?? "model file",
        progress: typeof event.progress === "number" ? event.progress : null,
        loaded: typeof event.loaded === "number" ? event.loaded : null,
        total: typeof event.total === "number" ? event.total : null,
      },
    });
  };
};

const postInitialLoadProgress = (modelId: string, label: string) => {
  postMessageToUi({
    type: "LOAD_PROGRESS",
    payload: {
      modelId,
      file: label,
      progress: 0,
      loaded: null,
      total: null,
    },
  });
};

const browserSupportsWebGpuFp16 = async () => {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    return false;
  }

  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    return Boolean(adapter?.features?.has("shader-f16"));
  } catch {
    return false;
  }
};

const assertChatTemplate = (model: ModelDescriptor, generator: TextGeneratorInstance) => {
  if (generator.tokenizer?.chat_template) {
    return;
  }

  throw new Error(
    `${model.label} finished loading without a chat template. Reload the page or choose a different model.`,
  );
};

const isRecoverableTextLoadError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /(q4f16|fp16|shader-f16|dtype|precision|not found|404|missing)/i.test(message);
};

const loadTextGenerator = async (model: ModelDescriptor) => {
  const preferredDtype = model.runtime.preferredDtype ?? "q4f16";
  const fallbackDtype = model.runtime.fallbackDtype ?? null;
  const supportsFp16 = await browserSupportsWebGpuFp16();
  const dtypeCandidates =
    preferredDtype === "q4f16" && !supportsFp16
      ? fallbackDtype
        ? [fallbackDtype]
        : []
      : [preferredDtype];

  let lastError: unknown = null;

  for (const dtype of dtypeCandidates) {
    try {
      return (await pipeline("text-generation", model.hf.modelId, {
        device: "webgpu",
        dtype,
        progress_callback: getProgressHandler(model.id),
      })) as TextGeneratorInstance;
    } catch (error) {
      lastError = error;
    }
  }

  if (
    preferredDtype === "q4f16" &&
    fallbackDtype &&
    supportsFp16 &&
    isRecoverableTextLoadError(lastError)
  ) {
    return (await pipeline("text-generation", model.hf.modelId, {
      device: "webgpu",
      dtype: fallbackDtype,
      progress_callback: getProgressHandler(model.id),
    })) as TextGeneratorInstance;
  }

  throw lastError;
};

const disposeResources = async (resources: LoadResources) => {
  await Promise.allSettled([resources.textGenerator?.dispose?.(), resources.visionModel?.dispose?.()]);
};

const disposeCurrentModel = async () => {
  await disposeResources({ textGenerator, processor, visionModel });
  textGenerator = null;
  processor = null;
  visionModel = null;
  activeModelId = null;
};

const loadVisionResources = async (model: ModelDescriptor) => {
  if (model.runtime.visionLoaderKind !== "qwen3_5") {
    throw new Error("This vision loader is not supported in the browser worker yet.");
  }

  const progressHandler = getProgressHandler(model.id);
  const [nextProcessor, nextVisionModel] = await Promise.all([
    AutoProcessor.from_pretrained(model.hf.modelId, {
      progress_callback: progressHandler,
    }),
    Qwen3_5ForConditionalGeneration.from_pretrained(model.hf.modelId, {
      dtype: {
        embed_tokens: "q4",
        vision_encoder: "fp16",
        decoder_model_merged: "q4",
      },
      device: "webgpu",
      progress_callback: progressHandler,
    }),
  ]);

  return {
    textGenerator: null,
    processor: nextProcessor,
    visionModel: nextVisionModel,
  } satisfies LoadResources;
};

const ensureModelReady = async (model: ModelDescriptor) => {
  if (activeModelId === model.id && (textGenerator || (processor && visionModel))) {
    return;
  }

  if (loadingPromise && loadingModelId === model.id) {
    await loadingPromise;
    if (activeModelId !== model.id) {
      throw new Error("Model loading was interrupted.");
    }
    return;
  }

  const loadNonce = ++latestLoadNonce;
  loadingModelId = model.id;
  loadingPromise = (async () => {
    postInitialLoadProgress(model.id, "Preparing model files");

    const resources =
      model.task === "text"
        ? ({
            textGenerator: await loadTextGenerator(model),
            processor: null,
            visionModel: null,
          } satisfies LoadResources)
        : await loadVisionResources(model);

    if (resources.textGenerator) {
      assertChatTemplate(model, resources.textGenerator);
    }

    if (loadNonce !== latestLoadNonce) {
      await disposeResources(resources);
      return;
    }

    await disposeCurrentModel();
    textGenerator = resources.textGenerator;
    processor = resources.processor;
    visionModel = resources.visionModel;
    activeModelId = model.id;
  })();

  try {
    await loadingPromise;
  } finally {
    if (loadNonce === latestLoadNonce) {
      loadingPromise = null;
      loadingModelId = null;
    }
  }

  if (activeModelId !== model.id) {
    throw new Error("Model loading was superseded by another request.");
  }
};

const toConversationMessage = (message: ThreadMessage) => ({
  role: message.role,
  content: message.content,
});

const normalizeConversationTurns = (messages: Array<{ role: ChatRole; content: string }>) => {
  const systemMessages = messages.filter(
    (message) => message.role === "system" && message.content.trim().length > 0,
  );
  const nonSystemMessages = messages.filter(
    (message) => message.role !== "system" && message.content.trim().length > 0,
  );

  const firstUserIndex = nonSystemMessages.findIndex((message) => message.role === "user");
  const candidateTurns = firstUserIndex === -1 ? [] : nonSystemMessages.slice(firstUserIndex);

  const normalizedTurns: Array<{ role: ChatRole; content: string }> = [];
  for (const message of candidateTurns) {
    const trimmedContent = message.content.trim();
    if (trimmedContent.length === 0) {
      continue;
    }

    const previousMessage = normalizedTurns.at(-1);
    if (previousMessage?.role === message.role) {
      previousMessage.content = `${previousMessage.content}\n\n${trimmedContent}`.trim();
      continue;
    }

    normalizedTurns.push({
      role: message.role,
      content: trimmedContent,
    });
  }

  return [...systemMessages, ...normalizedTurns];
};

const getConversationTokenCount = (
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

const computePromptBudget = (model: ModelDescriptor, options: GenerationOptions) => {
  const reservedOutputTokens = Math.min(
    model.runtime.contextWindowTokens,
    Math.max(options.maxNewTokens, Math.min(1024, Math.max(256, Math.floor(model.runtime.contextWindowTokens * 0.2)))),
  );

  return Math.max(256, model.runtime.contextWindowTokens - reservedOutputTokens - PROMPT_SAFETY_MARGIN);
};

const formatTranscript = (messages: ThreadMessage[]) =>
  messages
    .map((message) => {
      const role = message.role === "assistant" ? "Assistant" : "User";
      const attachmentNote = message.attachment ? ` [attachment: ${message.attachment.name}]` : "";
      return `${role}:${attachmentNote}\n${message.content || "(empty)"}`;
    })
    .join("\n\n");

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
      max_length: Math.max(1024, Math.floor(model.runtime.contextWindowTokens * 0.6)),
      truncation: true,
      ...model.runtime.chatTemplateOptions,
    },
  });

  const finalMessage = output[0]?.generated_text.at(-1);
  return typeof finalMessage?.content === "string" ? finalMessage.content.trim() : currentSummary;
};

const maybeRefreshSummary = async (
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

  const oversizedByCount = unsummarizedOlderMessages.length >= 8;
  const oversizedByTokens =
    getConversationTokenCount(
      generator.tokenizer,
      model,
      unsummarizedOlderMessages.map(toConversationMessage),
    ) > Math.floor(promptBudget * 0.35);

  if (!oversizedByCount && !oversizedByTokens) {
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
      summaryUpToSequence: olderMessages.at(-1)?.sequence ?? summaryUpToSequence,
    };
  } catch {
    return { summary: currentSummary, summaryUpToSequence };
  }
};

const buildTextConversation = async (
  model: ModelDescriptor,
  generator: TextGeneratorInstance,
  messages: ThreadMessage[],
  summary: string | null,
  summaryUpToSequence: number,
  options: GenerationOptions,
) => {
  const promptBudget = computePromptBudget(model, options);
  const completeMessages = messages.filter((message) => message.status !== "error");

  let conversationPrefix = summary
    ? ([{ role: "system", content: `Conversation memory:\n${summary}` }] satisfies Array<{
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
  const refreshedSummary = await maybeRefreshSummary(
    model,
    generator,
    summary,
    summaryUpToSequence,
    olderMessages,
    promptBudget,
  );

  conversationPrefix = refreshedSummary.summary
    ? [{ role: "system", content: `Conversation memory:\n${refreshedSummary.summary}` }]
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
    summaryUpToSequence: refreshedSummary.summaryUpToSequence,
  };
};

const generateTextReply = async (
  model: ModelDescriptor,
  messages: ThreadMessage[],
  summary: string | null,
  summaryUpToSequence: number,
  options: GenerationOptions,
  threadId: string,
  requestId: string,
) => {
  await ensureModelReady(model);

  if (!textGenerator) {
    throw new Error("The selected text model is not ready yet.");
  }

  assertChatTemplate(model, textGenerator);

  const conversationPlan = await buildTextConversation(
    model,
    textGenerator,
    messages,
    summary,
    summaryUpToSequence,
    options,
  );

  let streamedText = "";
  const stoppingCriteria = new InterruptableStoppingCriteria();
  activeStoppingCriteria = stoppingCriteria;
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
  activeStoppingCriteria = null;

  return {
    text: typeof finalMessage?.content === "string" ? finalMessage.content : streamedText,
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

const generateVisionReply = async (
  model: ModelDescriptor,
  messages: ThreadMessage[],
  image: File | null | undefined,
  threadId: string,
  requestId: string,
) => {
  await ensureModelReady(model);

  if (!processor || !visionModel) {
    throw new Error("The selected vision model is not ready yet.");
  }

  const recentMessages = buildVisionWindow(messages);
  const prompt = processor.apply_chat_template(toVisionConversation(recentMessages, Boolean(image)), {
    add_generation_prompt: true,
  });
  const rawImage = image ? await RawImage.read(image) : null;
  const inputs = rawImage ? await processor(prompt, rawImage) : await processor(prompt);

  let streamedText = "";
  const stoppingCriteria = new InterruptableStoppingCriteria();
  activeStoppingCriteria = stoppingCriteria;
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

  const sequences = ("sequences" in output ? output.sequences : output) as Tensor;
  const inputLength = inputs.input_ids.dims.at(-1) ?? 0;
  const decoded = processor.batch_decode(sequences.slice(null, [inputLength, null]), {
    skip_special_tokens: true,
  });
  activeStoppingCriteria = null;

  return {
    text: decoded[0] ?? streamedText,
    summary: null,
    summaryUpToSequence: 0,
  };
};

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  switch (event.data.type) {
    case "LOAD_MODEL": {
      const { model } = event.data.payload;

      try {
        await ensureModelReady(model);
        postMessageToUi({ type: "MODEL_READY", payload: { modelId: model.id } });
        postMessageToUi({
          type: "MODEL_LOAD_RESULT",
          payload: { modelId: model.id, status: "verified" },
        });
      } catch (error) {
        postError(model.id, error);
      }
      break;
    }
    case "GENERATE": {
      const { threadId, requestId, model, messages, summary, summaryUpToSequence, image, options } =
        event.data.payload;

      try {
        const result =
          model.task === "vision"
            ? await generateVisionReply(model, messages, image, threadId, requestId)
            : await generateTextReply(
                model,
                messages,
                summary,
                summaryUpToSequence,
                options,
                threadId,
                requestId,
              );

        postMessageToUi({
          type: "GENERATION_DONE",
          payload: {
            threadId,
            requestId,
            modelId: model.id,
            text: result.text,
            summary: result.summary,
            summaryUpToSequence: result.summaryUpToSequence,
          },
        });
      } catch (error) {
        postError(model.id, error, threadId, requestId);
      } finally {
        activeStoppingCriteria = null;
      }
      break;
    }
    case "STOP_GENERATION": {
      activeStoppingCriteria?.interrupt();
      break;
    }
  }
});
