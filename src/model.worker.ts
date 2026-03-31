import {
  AutoProcessor,
  Qwen3_5ForConditionalGeneration,
  RawImage,
  TextStreamer,
  pipeline,
} from "@huggingface/transformers";
import type { Tensor } from "@huggingface/transformers";

import type { ChatMessage, ModelDescriptor, WorkerRequest, WorkerResponse } from "./types";

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

let activeModelId: string | null = null;
let textGenerator: TextGeneratorInstance | null = null;
let processor: ProcessorInstance | null = null;
let visionModel: VisionModelInstance | null = null;
let loadingPromise: Promise<void> | null = null;
let loadingModelId: string | null = null;

const postMessageToUi = (message: WorkerResponse) => {
  self.postMessage(message);
};

const postError = (modelId: string, error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Something went wrong while running the model.";
  postMessageToUi({ type: "ERROR", payload: { modelId, message } });
  postMessageToUi({
    type: "MODEL_LOAD_RESULT",
    payload: { modelId, status: "failed_on_device", message },
  });
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
    const adapter = await navigator.gpu.requestAdapter();
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

const disposeCurrentModel = async () => {
  await Promise.allSettled([textGenerator?.dispose?.(), visionModel?.dispose?.()]);

  textGenerator = null;
  processor = null;
  visionModel = null;
  activeModelId = null;
};

const loadVisionModel = async (model: ModelDescriptor) => {
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

  processor = nextProcessor;
  visionModel = nextVisionModel;
};

const ensureModelReady = async (model: ModelDescriptor) => {
  if (activeModelId === model.id && (textGenerator || (processor && visionModel))) {
    return;
  }

  if (loadingPromise && loadingModelId === model.id) {
    await loadingPromise;
    return;
  }

  loadingModelId = model.id;
  loadingPromise = (async () => {
    await disposeCurrentModel();
    postInitialLoadProgress(model.id, "Preparing model files");

    if (model.task === "text") {
      textGenerator = await loadTextGenerator(model);
      assertChatTemplate(model, textGenerator);
    } else {
      await loadVisionModel(model);
    }

    activeModelId = model.id;
  })();

  try {
    await loadingPromise;
  } finally {
    loadingPromise = null;
    loadingModelId = null;
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

const generateTextReply = async (model: ModelDescriptor, messages: ChatMessage[]) => {
  await ensureModelReady(model);

  if (!textGenerator) {
    throw new Error("The selected text model is not ready yet.");
  }

  assertChatTemplate(model, textGenerator);

  let streamedText = "";
  const streamer = new TextStreamer(textGenerator.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text) => {
      streamedText += text;
      postMessageToUi({ type: "STREAM_TOKEN", payload: { modelId: model.id, text } });
    },
  });

  const output = await textGenerator(toTextConversation(messages), {
    ...GENERATION_CONFIG,
    return_full_text: false,
    streamer,
    tokenizer_encode_kwargs: {
      max_length: model.runtime.contextWindowTokens,
      truncation: true,
      ...model.runtime.chatTemplateOptions,
    },
  });

  const finalMessage = output[0]?.generated_text.at(-1);
  return typeof finalMessage?.content === "string" ? finalMessage.content : streamedText;
};

const generateVisionReply = async (
  model: ModelDescriptor,
  messages: ChatMessage[],
  image?: File | null,
) => {
  await ensureModelReady(model);

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
      postMessageToUi({ type: "STREAM_TOKEN", payload: { modelId: model.id, text } });
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
      const { model, messages, image } = event.data.payload;

      try {
        const text =
          model.task === "vision"
            ? await generateVisionReply(model, messages, image)
            : await generateTextReply(model, messages);

        postMessageToUi({ type: "GENERATION_DONE", payload: { modelId: model.id, text } });
      } catch (error) {
        postError(model.id, error);
      }
      break;
    }
    case "RESET_CHAT": {
      break;
    }
  }
});
