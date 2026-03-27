import {
  AutoProcessor,
  Qwen3_5ForConditionalGeneration,
  RawImage,
  TextStreamer,
  pipeline,
} from "@huggingface/transformers";
import type { Tensor } from "@huggingface/transformers";

import { MODEL_DEFINITIONS } from "./models";
import type { ChatMessage, ModelMode, WorkerRequest, WorkerResponse } from "./types";

const GENERATION_CONFIG = {
  max_new_tokens: 2048,
  temperature: 0.7,
  top_p: 0.9,
  do_sample: true,
};

type ProcessorInstance = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
type VisionModelInstance = Awaited<
  ReturnType<typeof Qwen3_5ForConditionalGeneration.from_pretrained>
>;
type TextGeneratorInstance = {
  tokenizer: any;
  dispose?: () => Promise<unknown>;
  (
    messages: Array<{ role: ChatMessage["role"]; content: string }>,
    options: Record<string, unknown>,
  ): Promise<Array<{ generated_text: Array<{ role: string; content: string }> }>>;
};

let activeMode: ModelMode | null = null;
let textGenerator: TextGeneratorInstance | null = null;
let processor: ProcessorInstance | null = null;
let visionModel: VisionModelInstance | null = null;
let loadingPromise: Promise<void> | null = null;
let loadingMode: ModelMode | null = null;

const postMessageToUi = (message: WorkerResponse) => {
  self.postMessage(message);
};

const postError = (mode: ModelMode, error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Something went wrong while running the model.";
  postMessageToUi({ type: "ERROR", payload: { mode, message } });
};

const getProgressHandler = (mode: ModelMode) => {
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
        mode,
        file: event.file ?? event.name ?? "model file",
        progress: typeof event.progress === "number" ? event.progress : null,
        loaded: typeof event.loaded === "number" ? event.loaded : null,
        total: typeof event.total === "number" ? event.total : null,
      },
    });
  };
};

const postInitialLoadProgress = (mode: ModelMode, label: string) => {
  postMessageToUi({
    type: "LOAD_PROGRESS",
    payload: {
      mode,
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
    const adapter = await navigator.gpu.requestAdapter();
    return Boolean(adapter?.features?.has("shader-f16"));
  } catch {
    return false;
  }
};

const assertChatTemplate = (mode: ModelMode, generator: TextGeneratorInstance) => {
  if (generator.tokenizer?.chat_template) {
    return;
  }

  throw new Error(
    `${MODEL_DEFINITIONS[mode].modelName} finished loading without a chat template. Reload the page or switch models.`,
  );
};

const isRecoverableTextLoadError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /(q4f16|fp16|shader-f16|dtype|precision|not found|404|missing)/i.test(message);
};

const toFriendlyTextLoadError = (mode: ModelMode, error: unknown) => {
  if (mode !== "thinking") {
    return error;
  }

  const originalMessage =
    error instanceof Error ? error.message : "Something went wrong while loading the model.";
  const model = MODEL_DEFINITIONS[mode];

  return new Error(
    `${model.modelName} ${model.paramsLabel} could not load in this browser. Try Chrome or Edge with WebGPU enabled, close other GPU-heavy tabs, or switch back to the Fast model. Original error: ${originalMessage}`,
  );
};

const loadTextGenerator = async (mode: ModelMode, definition: (typeof MODEL_DEFINITIONS)[ModelMode]) => {
  const preferredDtype = definition.preferredDtype ?? "q4f16";
  const fallbackDtype = definition.fallbackDtype ?? null;
  const supportsFp16 = await browserSupportsWebGpuFp16();

  const dtypeCandidates: Array<
    "q4f16" | "q4" | "q8" | "int8" | "uint8" | "fp16" | "fp32"
  > =
    preferredDtype === "q4f16" && !supportsFp16
      ? fallbackDtype
        ? [fallbackDtype]
        : []
      : [preferredDtype];

  let lastError: unknown = null;

  for (const dtype of dtypeCandidates) {
    try {
      return (await pipeline("text-generation", definition.modelId, {
        device: "webgpu",
        dtype,
        progress_callback: getProgressHandler(mode),
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
    return (await pipeline("text-generation", definition.modelId, {
      device: "webgpu",
      dtype: fallbackDtype,
      progress_callback: getProgressHandler(mode),
    })) as TextGeneratorInstance;
  }

  throw toFriendlyTextLoadError(mode, lastError);
};

const disposeCurrentModel = async () => {
  await Promise.allSettled([
    textGenerator?.dispose?.(),
    visionModel?.dispose?.(),
  ]);

  textGenerator = null;
  processor = null;
  visionModel = null;
  activeMode = null;
};

const ensureModelReady = async (mode: ModelMode) => {
  if (activeMode === mode && (textGenerator || (processor && visionModel))) {
    return;
  }

  if (loadingPromise && loadingMode === mode) {
    await loadingPromise;
    return;
  }

  const definition = MODEL_DEFINITIONS[mode];

  loadingMode = mode;
  loadingPromise = (async () => {
    await disposeCurrentModel();
    postInitialLoadProgress(mode, "Preparing model files");

    if (definition.kind === "text") {
      textGenerator = await loadTextGenerator(mode, definition);
      assertChatTemplate(mode, textGenerator);
    } else {
      const progressHandler = getProgressHandler(mode);
      const [nextProcessor, nextVisionModel] = await Promise.all([
        AutoProcessor.from_pretrained(definition.modelId, {
          progress_callback: progressHandler,
        }),
        Qwen3_5ForConditionalGeneration.from_pretrained(definition.modelId, {
          dtype: {
            embed_tokens: "q4",
            vision_encoder: "fp16",
            decoder_model_merged: "q4",
          },
          device: "webgpu",
          progress_callback: progressHandler,
        }),
      ]);

      processor = nextProcessor;
      visionModel = nextVisionModel;
    }

    activeMode = mode;
  })();

  try {
    await loadingPromise;
  } finally {
    loadingPromise = null;
    loadingMode = null;
  }
};

const toTextConversation = (messages: ChatMessage[]) =>
  messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

const toVisionConversation = (messages: ChatMessage[], hasImage: boolean) =>
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

const generateTextReply = async (mode: ModelMode, messages: ChatMessage[]) => {
  await ensureModelReady(mode);
  const definition = MODEL_DEFINITIONS[mode];

  if (!textGenerator) {
    throw new Error("The selected text model is not ready yet.");
  }

  assertChatTemplate(mode, textGenerator);

  let streamedText = "";
  const streamer = new TextStreamer(textGenerator.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text) => {
      streamedText += text;
      postMessageToUi({ type: "STREAM_TOKEN", payload: { mode, text } });
    },
  });

  const output = await textGenerator(toTextConversation(messages), {
    ...GENERATION_CONFIG,
    return_full_text: false,
    streamer,
    tokenizer_encode_kwargs: {
      max_length: definition.contextWindowTokens,
      truncation: true,
      ...definition.chatTemplateOptions,
    },
  });

  const finalMessage = output[0]?.generated_text.at(-1);
  return typeof finalMessage?.content === "string" ? finalMessage.content : streamedText;
};

const generateVisionReply = async (
  mode: ModelMode,
  messages: ChatMessage[],
  image?: File | null,
) => {
  await ensureModelReady(mode);

  if (!processor || !visionModel) {
    throw new Error("The selected vision model is not ready yet.");
  }

  const prompt = processor.apply_chat_template(toVisionConversation(messages, Boolean(image)), {
    add_generation_prompt: true,
  });
  const rawImage = image ? await RawImage.read(image) : null;
  const inputs = rawImage ? await processor(prompt, rawImage) : await processor(prompt);

  let streamedText = "";
  const streamer = new TextStreamer(processor.tokenizer!, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text) => {
      streamedText += text;
      postMessageToUi({ type: "STREAM_TOKEN", payload: { mode, text } });
    },
  });

  const output = await visionModel.generate({
    ...inputs,
    ...GENERATION_CONFIG,
    streamer,
  });

  const sequences = ("sequences" in output ? output.sequences : output) as Tensor;
  const inputLength = inputs.input_ids.dims.at(-1) ?? 0;
  const decoded = processor.batch_decode(sequences.slice(null, [inputLength, null]), {
    skip_special_tokens: true,
  });

  return decoded[0] ?? streamedText;
};

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  switch (event.data.type) {
    case "LOAD_MODEL": {
      const { mode } = event.data.payload;

      try {
        await ensureModelReady(mode);
        postMessageToUi({ type: "MODEL_READY", payload: { mode } });
      } catch (error) {
        postError(mode, error);
      }
      break;
    }
    case "GENERATE": {
      const { mode, messages, image } = event.data.payload;

      try {
        const text =
          MODEL_DEFINITIONS[mode].kind === "vision"
            ? await generateVisionReply(mode, messages, image)
            : await generateTextReply(mode, messages);

        postMessageToUi({ type: "GENERATION_DONE", payload: { mode, text } });
      } catch (error) {
        postError(mode, error);
      }
      break;
    }
    case "RESET_CHAT": {
      break;
    }
  }
});
