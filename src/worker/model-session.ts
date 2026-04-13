import type { InterruptableStoppingCriteria } from "@huggingface/transformers";
import {
  AutoModelForImageTextToText,
  AutoProcessor,
  pipeline,
  Qwen3_5ForConditionalGeneration,
} from "@huggingface/transformers";

import type { ChatRole, ModelDescriptor, WorkerResponse } from "../types";

type ProgressEvent = {
  file?: string;
  name?: string;
  progress?: number;
  loaded?: number;
  total?: number;
  status?: string;
};

export type ProcessorInstance = Awaited<
  ReturnType<typeof AutoProcessor.from_pretrained>
>;
export type VisionModelInstance = Awaited<
  ReturnType<typeof Qwen3_5ForConditionalGeneration.from_pretrained>
>;
export type TextGeneratorInstance = {
  tokenizer: any;
  dispose?: () => Promise<unknown>;
  (
    messages: Array<{ role: ChatRole; content: string }>,
    options: Record<string, unknown>,
  ): Promise<
    Array<{ generated_text: Array<{ role: string; content: string }> }>
  >;
};

type LoadResources = {
  textGenerator: TextGeneratorInstance | null;
  processor: ProcessorInstance | null;
  visionModel: VisionModelInstance | null;
};

export type SummaryResult = {
  summary: string | null;
  summaryUpToSequence: number;
};

export type WorkerMessagePoster = (message: WorkerResponse) => void;

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

const isRecoverableTextLoadError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /(q4f16|fp16|shader-f16|dtype|precision|not found|404|missing)/i.test(
    message,
  );
};

const assertChatTemplate = (
  model: ModelDescriptor,
  generator: TextGeneratorInstance,
) => {
  if (generator.tokenizer?.chat_template) {
    return;
  }

  throw new Error(
    `${model.label} finished loading without a chat template. Reload the page or choose a different model.`,
  );
};

export const createModelSession = (postMessageToUi: WorkerMessagePoster) => {
  let activeModelId: string | null = null;
  let textGenerator: TextGeneratorInstance | null = null;
  let processor: ProcessorInstance | null = null;
  let visionModel: VisionModelInstance | null = null;
  let loadingPromise: Promise<void> | null = null;
  let loadingModelId: string | null = null;
  let latestLoadNonce = 0;
  let activeStoppingCriteria: InterruptableStoppingCriteria | null = null;

  const getProgressHandler = (modelId: string) => {
    return (event: ProgressEvent) => {
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
    await Promise.allSettled([
      resources.textGenerator?.dispose?.(),
      resources.visionModel?.dispose?.(),
    ]);
  };

  const disposeCurrentModel = async () => {
    await disposeResources({ textGenerator, processor, visionModel });
    textGenerator = null;
    processor = null;
    visionModel = null;
    activeModelId = null;
  };

  const loadVisionResources = async (model: ModelDescriptor) => {
    const progressHandler = getProgressHandler(model.id);

    if (model.runtime.visionLoaderKind === "qwen3_5") {
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
        visionModel: nextVisionModel as VisionModelInstance,
      } satisfies LoadResources;
    }

    if (model.runtime.visionLoaderKind === "lfm2_5_vl") {
      const [nextProcessor, nextVisionModel] = await Promise.all([
        AutoProcessor.from_pretrained(model.hf.modelId, {
          progress_callback: progressHandler,
        }),
        AutoModelForImageTextToText.from_pretrained(model.hf.modelId, {
          dtype: {
            embed_tokens: "fp16",
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
        visionModel: nextVisionModel as VisionModelInstance,
      } satisfies LoadResources;
    }

    throw new Error(
      "This vision loader is not supported in the browser worker yet.",
    );
  };

  const ensureModelReady = async (model: ModelDescriptor) => {
    if (
      activeModelId === model.id &&
      (textGenerator || (processor && visionModel))
    ) {
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

  return {
    ensureModelReady,
    getTextGenerator: () => textGenerator,
    getProcessor: () => processor,
    getVisionModel: () => visionModel,
    assertChatTemplate,
    setActiveStoppingCriteria: (
      criteria: InterruptableStoppingCriteria | null,
    ) => {
      activeStoppingCriteria = criteria;
    },
    clearActiveStoppingCriteria: () => {
      activeStoppingCriteria = null;
    },
    interruptGeneration: () => {
      activeStoppingCriteria?.interrupt();
    },
  };
};

export type ModelSession = ReturnType<typeof createModelSession>;
