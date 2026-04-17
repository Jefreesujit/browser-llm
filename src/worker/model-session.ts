import type { InterruptableStoppingCriteria } from "@huggingface/transformers";
import {
  AutoModel,
  AutoModelForImageTextToText,
  AutoModelForTextToSpectrogram,
  AutoProcessor,
  AutoTokenizer,
  pipeline,
  Qwen3_5ForConditionalGeneration,
  Tensor,
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
export type SpeechRecognizerInstance = {
  dispose?: () => Promise<unknown>;
  (
    audio: Float32Array,
    options?: Record<string, unknown>,
  ): Promise<{
    text: string;
    chunks?: Array<{ text: string; timestamp: [number, number] }>;
  }>;
};
export type SpeechSynthesizerInstance = {
  dispose?: () => Promise<unknown>;
  (
    text: string,
    options?: Record<string, unknown>,
  ): Promise<{ audio: Float32Array; sampling_rate: number }>;
};

type SpeechT5ModelInstance = {
  dispose?: () => Promise<unknown>;
  generate_speech: (
    inputIds: unknown,
    speakerEmbeddings: Tensor,
    options: { vocoder: unknown },
  ) => Promise<{ waveform: { data: Float32Array | ArrayLike<number> } }>;
};

type LoadResources = {
  textGenerator: TextGeneratorInstance | null;
  processor: ProcessorInstance | null;
  visionModel: VisionModelInstance | null;
  speechRecognizer: SpeechRecognizerInstance | null;
  speechSynthesizer: SpeechSynthesizerInstance | null;
};

export type SummaryResult = {
  summary: string | null;
  summaryUpToSequence: number;
};

export type WorkerMessagePoster = (message: WorkerResponse) => void;

const DEFAULT_SPEECHT5_VOCODER_ID = "Xenova/speecht5_hifigan";

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

const isRecoverableLoadError = (error: unknown) => {
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
  let speechRecognizer: SpeechRecognizerInstance | null = null;
  let speechSynthesizer: SpeechSynthesizerInstance | null = null;
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

  const loadPipelineTask = async <
    TInstance extends
      | TextGeneratorInstance
      | SpeechRecognizerInstance
      | SpeechSynthesizerInstance,
  >(
    task: "text-generation" | "automatic-speech-recognition" | "text-to-speech",
    model: ModelDescriptor,
  ) => {
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
        return (await pipeline(task, model.hf.modelId, {
          device: "webgpu",
          dtype,
          progress_callback: getProgressHandler(model.id),
        })) as unknown as TInstance;
      } catch (error) {
        lastError = error;
      }
    }

    if (
      preferredDtype === "q4f16" &&
      fallbackDtype &&
      supportsFp16 &&
      isRecoverableLoadError(lastError)
    ) {
      return (await pipeline(task, model.hf.modelId, {
        device: "webgpu",
        dtype: fallbackDtype,
        progress_callback: getProgressHandler(model.id),
      })) as unknown as TInstance;
    }

    throw lastError;
  };

  const loadTextGenerator = async (model: ModelDescriptor) =>
    loadPipelineTask<TextGeneratorInstance>("text-generation", model);

  const loadSpeechRecognizer = async (model: ModelDescriptor) =>
    loadPipelineTask<SpeechRecognizerInstance>(
      "automatic-speech-recognition",
      model,
    );

  const loadSpeechSynthesizer = async (model: ModelDescriptor) =>
    loadPipelineTask<SpeechSynthesizerInstance>("text-to-speech", model);

  const loadSupertonicSynthesizer = async (model: ModelDescriptor) =>
    (await pipeline("text-to-speech", model.hf.modelId, {
      device: "webgpu",
      progress_callback: getProgressHandler(model.id),
    })) as unknown as SpeechSynthesizerInstance;

  const loadSpeechT5Synthesizer = async (model: ModelDescriptor) => {
    const progressHandler = getProgressHandler(model.id);
    const preferredDtype = model.runtime.preferredDtype ?? "q4";
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
        const [tokenizer, processor, spectrogramModel, vocoder] =
          await Promise.all([
            AutoTokenizer.from_pretrained(model.hf.modelId, {
              progress_callback: progressHandler,
            }),
            AutoProcessor.from_pretrained(model.hf.modelId, {
              progress_callback: progressHandler,
            }),
            AutoModelForTextToSpectrogram.from_pretrained(model.hf.modelId, {
              device: "webgpu",
              dtype,
              progress_callback: progressHandler,
            }),
            AutoModel.from_pretrained(DEFAULT_SPEECHT5_VOCODER_ID, {
              dtype: "fp32",
              progress_callback: progressHandler,
            }),
          ]);
        const speechT5Model =
          spectrogramModel as unknown as SpeechT5ModelInstance;

        const synthesizer = (async (
          text: string,
          options?: Record<string, unknown>,
        ) => {
          const rawSpeakerEmbeddings =
            options?.speaker_embeddings ?? model.runtime.speakerEmbeddingsUrl;

          if (
            typeof rawSpeakerEmbeddings !== "string" &&
            !(rawSpeakerEmbeddings instanceof URL) &&
            !(rawSpeakerEmbeddings instanceof Float32Array)
          ) {
            throw new Error(
              "SpeechT5 requires speaker embeddings before it can generate audio.",
            );
          }

          const speakerEmbeddingsData =
            typeof rawSpeakerEmbeddings === "string" ||
            rawSpeakerEmbeddings instanceof URL
              ? new Float32Array(
                  await (
                    await fetch(String(rawSpeakerEmbeddings))
                  ).arrayBuffer(),
                )
              : rawSpeakerEmbeddings;

          const { input_ids } = tokenizer(text, {
            padding: true,
            truncation: true,
          });
          const speakerEmbeddings = new Tensor(
            "float32",
            speakerEmbeddingsData,
            [speakerEmbeddingsData.length],
          ).view(1, -1);

          const { waveform } = await speechT5Model.generate_speech(
            input_ids,
            speakerEmbeddings,
            { vocoder },
          );
          const samplingRate =
            processor.feature_extractor?.config?.sampling_rate ??
            model.runtime.audioSampleRate ??
            16000;

          return {
            audio:
              waveform.data instanceof Float32Array
                ? waveform.data
                : new Float32Array(waveform.data),
            sampling_rate: samplingRate,
          };
        }) as SpeechSynthesizerInstance;

        synthesizer.dispose = async () => {
          await Promise.allSettled([
            spectrogramModel.dispose?.(),
            vocoder.dispose?.(),
          ]);
        };

        return synthesizer;
      } catch (error) {
        lastError = error;
      }
    }

    if (
      preferredDtype === "q4f16" &&
      fallbackDtype &&
      supportsFp16 &&
      isRecoverableLoadError(lastError)
    ) {
      const fallbackModel = {
        ...model,
        runtime: {
          ...model.runtime,
          preferredDtype: fallbackDtype,
          fallbackDtype: undefined,
        },
      };
      return loadSpeechT5Synthesizer(fallbackModel);
    }

    throw lastError;
  };

  const disposeResources = async (resources: LoadResources) => {
    await Promise.allSettled([
      resources.textGenerator?.dispose?.(),
      resources.visionModel?.dispose?.(),
      resources.speechRecognizer?.dispose?.(),
      resources.speechSynthesizer?.dispose?.(),
    ]);
  };

  const disposeCurrentModel = async () => {
    await disposeResources({
      textGenerator,
      processor,
      visionModel,
      speechRecognizer,
      speechSynthesizer,
    });
    textGenerator = null;
    processor = null;
    visionModel = null;
    speechRecognizer = null;
    speechSynthesizer = null;
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
        speechRecognizer: null,
        speechSynthesizer: null,
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
        speechRecognizer: null,
        speechSynthesizer: null,
      } satisfies LoadResources;
    }

    throw new Error(
      "This vision loader is not supported in the browser worker yet.",
    );
  };

  const loadAudioResources = async (model: ModelDescriptor) => {
    if (model.task === "stt") {
      return {
        textGenerator: null,
        processor: null,
        visionModel: null,
        speechRecognizer: await loadSpeechRecognizer(model),
        speechSynthesizer: null,
      } satisfies LoadResources;
    }

    return {
      textGenerator: null,
      processor: null,
      visionModel: null,
      speechRecognizer: null,
      speechSynthesizer:
        model.runtime.audioLoaderKind === "speecht5_tts"
          ? await loadSpeechT5Synthesizer(model)
          : model.runtime.audioLoaderKind === "supertonic_tts"
            ? await loadSupertonicSynthesizer(model)
          : await loadSpeechSynthesizer(model),
    } satisfies LoadResources;
  };

  const ensureModelReady = async (model: ModelDescriptor) => {
    if (
      activeModelId === model.id &&
      (textGenerator ||
        (processor && visionModel) ||
        speechRecognizer ||
        speechSynthesizer)
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
              speechRecognizer: null,
              speechSynthesizer: null,
            } satisfies LoadResources)
          : model.task === "vision"
            ? await loadVisionResources(model)
            : await loadAudioResources(model);

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
      speechRecognizer = resources.speechRecognizer;
      speechSynthesizer = resources.speechSynthesizer;
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
    getSpeechRecognizer: () => speechRecognizer,
    getSpeechSynthesizer: () => speechSynthesizer,
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
