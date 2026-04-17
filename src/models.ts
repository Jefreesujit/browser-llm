import type { CuratedCategoryKey, ModelDescriptor } from "./types";

export type CuratedCategory = {
  key: CuratedCategoryKey;
  label: string;
  description: string;
};

const createTextModel = (
  model: Omit<ModelDescriptor, "source" | "task">,
): ModelDescriptor => ({
  ...model,
  source: "curated",
  task: "text",
});

const createVisionModel = (
  model: Omit<ModelDescriptor, "source" | "task">,
): ModelDescriptor => ({
  ...model,
  source: "curated",
  task: "vision",
});

const createSttModel = (
  model: Omit<ModelDescriptor, "source" | "task">,
): ModelDescriptor => ({
  ...model,
  source: "curated",
  task: "stt",
});

const createTtsModel = (
  model: Omit<ModelDescriptor, "source" | "task">,
): ModelDescriptor => ({
  ...model,
  source: "curated",
  task: "tts",
});

export const CURATED_CATEGORIES: CuratedCategory[] = [
  {
    key: "mobile_safe",
    label: "Mobile-safe",
    description:
      "Smaller chat models that are the safest starting point on phones and tablets.",
  },
  {
    key: "balanced",
    label: "Balanced",
    description:
      "General-purpose chat models with stronger quality while staying browser-friendly.",
  },
  {
    key: "coding",
    label: "Coding",
    description: "Compact code-oriented models for browser-based coding help.",
  },
  {
    key: "reasoning",
    label: "Reasoning",
    description:
      "Reasoning-oriented models that still fit a browser-first experience.",
  },
  {
    key: "vision",
    label: "Vision",
    description: "Curated multimodal models with image input support.",
  },
  {
    key: "desktop_experimental",
    label: "Desktop experimental",
    description:
      "Larger models that may work on stronger desktops but are not the default path.",
  },
];

export const CURATED_MODELS: ModelDescriptor[] = [
  createTextModel({
    id: "HuggingFaceTB/SmolLM2-135M-Instruct",
    label: "SmolLM2 135M",
    summary: "Tiny and quick for lightweight chat.",
    publisher: "HuggingFaceTB",
    paramsLabel: "135M params",
    parameterTier: "XS",
    estimatedDownloadLabel: "Smallest browser download",
    category: "mobile_safe",
    starter: false,
    tested: true,
    hf: {
      modelId: "HuggingFaceTB/SmolLM2-135M-Instruct",
      pipelineTag: "text-generation",
      libraryName: "transformers",
      tags: ["transformers.js", "text-generation", "conversational"],
      baseModel: "HuggingFaceTB/SmolLM2-135M",
      hasChatTemplate: true,
    },
    runtime: {
      preferredDtype: "q4f16",
      fallbackDtype: "q4",
      contextWindowTokens: 8192,
    },
  }),
  createTextModel({
    id: "HuggingFaceTB/SmolLM2-360M-Instruct",
    label: "SmolLM2 360M",
    summary:
      "Fastest recommended starter with better quality than tiny models.",
    publisher: "HuggingFaceTB",
    paramsLabel: "360M params",
    parameterTier: "XS",
    estimatedDownloadLabel: "273 MB download",
    category: "mobile_safe",
    starter: true,
    tested: true,
    hf: {
      modelId: "HuggingFaceTB/SmolLM2-360M-Instruct",
      pipelineTag: "text-generation",
      libraryName: "transformers",
      tags: ["transformers.js", "text-generation", "conversational"],
      baseModel: "HuggingFaceTB/SmolLM2-360M",
      hasChatTemplate: true,
    },
    runtime: {
      preferredDtype: "q4f16",
      fallbackDtype: "q4",
      contextWindowTokens: 8192,
    },
  }),
  createTextModel({
    id: "onnx-community/gemma-3-270m-it-ONNX",
    label: "Gemma 3 270M",
    summary: "A tiny Gemma chat model with a browser-friendly footprint.",
    publisher: "onnx-community",
    paramsLabel: "270M params",
    parameterTier: "XS",
    estimatedDownloadLabel: "Compact browser download",
    category: "mobile_safe",
    starter: false,
    tested: true,
    hf: {
      modelId: "onnx-community/gemma-3-270m-it-ONNX",
      pipelineTag: "text-generation",
      libraryName: "transformers.js",
      tags: ["transformers.js", "text-generation", "conversational"],
      baseModel: "google/gemma-3-270m-it",
      hasChatTemplate: true,
    },
    runtime: {
      preferredDtype: "q4f16",
      fallbackDtype: "q4",
      contextWindowTokens: 32768,
    },
  }),
  createTextModel({
    id: "onnx-community/Qwen2.5-0.5B-Instruct",
    label: "Qwen2.5 0.5B",
    summary: "Small multilingual chat model that works well for quick prompts.",
    publisher: "onnx-community",
    paramsLabel: "0.5B params",
    parameterTier: "XS",
    estimatedDownloadLabel: "Small q4 browser download",
    category: "mobile_safe",
    starter: true,
    tested: true,
    hf: {
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
      pipelineTag: "text-generation",
      libraryName: "transformers.js",
      tags: ["transformers.js", "text-generation", "conversational"],
      baseModel: "Qwen/Qwen2.5-0.5B-Instruct",
      hasChatTemplate: true,
    },
    runtime: {
      preferredDtype: "q4f16",
      fallbackDtype: "q4",
      contextWindowTokens: 32768,
    },
  }),
  createTextModel({
    id: "onnx-community/gemma-3-1b-it-ONNX",
    label: "Gemma 3 1B",
    summary: "Balanced desktop default for everyday browser chat.",
    publisher: "onnx-community",
    paramsLabel: "1B params",
    parameterTier: "S",
    estimatedDownloadLabel: "Larger balanced download",
    category: "balanced",
    starter: true,
    tested: true,
    hf: {
      modelId: "onnx-community/gemma-3-1b-it-ONNX",
      pipelineTag: "text-generation",
      libraryName: "transformers.js",
      tags: ["transformers.js", "text-generation", "conversational"],
      baseModel: "google/gemma-3-1b-it",
      hasChatTemplate: true,
    },
    runtime: {
      preferredDtype: "q4f16",
      fallbackDtype: "q4",
      contextWindowTokens: 32768,
    },
  }),
  createTextModel({
    id: "onnx-community/Qwen2.5-1.5B-Instruct",
    label: "Qwen2.5 1.5B",
    summary: "A stronger multilingual chat model for more demanding prompts.",
    publisher: "onnx-community",
    paramsLabel: "1.5B params",
    parameterTier: "M",
    estimatedDownloadLabel: "Balanced q4 download",
    category: "balanced",
    starter: false,
    tested: true,
    hf: {
      modelId: "onnx-community/Qwen2.5-1.5B-Instruct",
      pipelineTag: "text-generation",
      libraryName: "transformers.js",
      tags: ["transformers.js", "text-generation", "conversational"],
      baseModel: "Qwen/Qwen2.5-1.5B-Instruct",
      hasChatTemplate: true,
    },
    runtime: {
      preferredDtype: "q4f16",
      fallbackDtype: "q4",
      contextWindowTokens: 32768,
    },
  }),
  createTextModel({
    id: "HuggingFaceTB/SmolLM2-1.7B-Instruct",
    label: "SmolLM2 1.7B",
    summary:
      "High-end browser chat model that still fits the default size budget.",
    publisher: "HuggingFaceTB",
    paramsLabel: "1.7B params",
    parameterTier: "M",
    estimatedDownloadLabel: "Largest default browser download",
    category: "balanced",
    starter: false,
    tested: true,
    hf: {
      modelId: "HuggingFaceTB/SmolLM2-1.7B-Instruct",
      pipelineTag: "text-generation",
      libraryName: "transformers",
      tags: ["transformers.js", "text-generation", "conversational"],
      baseModel: "HuggingFaceTB/SmolLM2-1.7B",
      hasChatTemplate: true,
    },
    runtime: {
      preferredDtype: "q4f16",
      fallbackDtype: "q4",
      contextWindowTokens: 8192,
    },
  }),
  createTextModel({
    id: "onnx-community/Qwen2.5-Coder-0.5B-Instruct",
    label: "Qwen2.5 Coder 0.5B",
    summary: "Small coding helper for quick edits and code explanations.",
    publisher: "onnx-community",
    paramsLabel: "0.5B params",
    parameterTier: "XS",
    estimatedDownloadLabel: "Compact coding model",
    category: "coding",
    starter: true,
    tested: true,
    hf: {
      modelId: "onnx-community/Qwen2.5-Coder-0.5B-Instruct",
      pipelineTag: "text-generation",
      libraryName: "transformers.js",
      tags: ["transformers.js", "text-generation", "conversational", "code"],
      baseModel: "Qwen/Qwen2.5-Coder-0.5B-Instruct",
      hasChatTemplate: true,
    },
    runtime: {
      preferredDtype: "q4f16",
      fallbackDtype: "q4",
      contextWindowTokens: 32768,
    },
  }),
  createTextModel({
    id: "onnx-community/Qwen2.5-Coder-1.5B-Instruct",
    label: "Qwen2.5 Coder 1.5B",
    summary:
      "Better coding quality while staying within the default browser budget.",
    publisher: "onnx-community",
    paramsLabel: "1.5B params",
    parameterTier: "M",
    estimatedDownloadLabel: "Balanced coding download",
    category: "coding",
    starter: false,
    tested: true,
    hf: {
      modelId: "onnx-community/Qwen2.5-Coder-1.5B-Instruct",
      pipelineTag: "text-generation",
      libraryName: "transformers.js",
      tags: ["transformers.js", "text-generation", "conversational", "code"],
      baseModel: "Qwen/Qwen2.5-Coder-1.5B-Instruct",
      hasChatTemplate: true,
    },
    runtime: {
      preferredDtype: "q4f16",
      fallbackDtype: "q4",
      contextWindowTokens: 32768,
    },
  }),
  createTextModel({
    id: "onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX",
    label: "DeepSeek R1 Distill 1.5B",
    summary: "A compact reasoning-oriented model for more deliberate answers.",
    publisher: "onnx-community",
    paramsLabel: "1.5B params",
    parameterTier: "M",
    estimatedDownloadLabel: "Reasoning-focused browser download",
    category: "reasoning",
    starter: false,
    tested: true,
    hf: {
      modelId: "onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX",
      pipelineTag: "text-generation",
      libraryName: "transformers.js",
      tags: [
        "transformers.js",
        "text-generation",
        "conversational",
        "reasoning",
      ],
      baseModel: "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",
      hasChatTemplate: true,
    },
    runtime: {
      preferredDtype: "q4f16",
      fallbackDtype: "q4",
      contextWindowTokens: 32768,
    },
  }),
  createVisionModel({
    id: "onnx-community/Qwen3.5-0.8B-ONNX",
    label: "Qwen3.5 Vision 0.8B",
    summary: "Curated image-aware chat with one attached image per turn.",
    publisher: "onnx-community",
    paramsLabel: "0.8B params",
    parameterTier: "S",
    estimatedDownloadLabel: "~850 MB download",
    category: "vision",
    starter: true,
    tested: true,
    hf: {
      modelId: "onnx-community/Qwen3.5-0.8B-ONNX",
      pipelineTag: "image-text-to-text",
      libraryName: "transformers",
      tags: ["onnx", "image-text-to-text", "conversational"],
      baseModel: "Qwen/Qwen3.5-0.8B",
      hasChatTemplate: true,
    },
    runtime: {
      contextWindowTokens: 262144,
      visionLoaderKind: "qwen3_5",
    },
  }),
  createVisionModel({
    id: "LiquidAI/LFM2.5-VL-450M-ONNX",
    label: "LFM2.5-VL 450M",
    summary:
      "Liquid AI's compact vision-language model with bounding box prediction and multilingual support.",
    publisher: "LiquidAI",
    paramsLabel: "450M params",
    parameterTier: "S",
    estimatedDownloadLabel: "~650 MB download (fp16+q4)",
    category: "vision",
    starter: false,
    tested: true,
    hf: {
      modelId: "LiquidAI/LFM2.5-VL-450M-ONNX",
      pipelineTag: "image-text-to-text",
      libraryName: "transformers.js",
      tags: ["onnx", "image-text-to-text", "conversational", "webgpu"],
      baseModel: "LiquidAI/LFM2.5-VL-450M",
      hasChatTemplate: true,
    },
    runtime: {
      contextWindowTokens: 32768,
      visionLoaderKind: "lfm2_5_vl",
    },
  }),
  createTextModel({
    id: "HuggingFaceTB/SmolLM3-3B-ONNX",
    label: "SmolLM3 3B",
    summary:
      "Larger desktop model for stronger quality when your browser can handle it.",
    publisher: "HuggingFaceTB",
    paramsLabel: "3B params",
    parameterTier: "L",
    estimatedDownloadLabel: "Desktop experimental download",
    category: "desktop_experimental",
    starter: false,
    tested: true,
    hf: {
      modelId: "HuggingFaceTB/SmolLM3-3B-ONNX",
      pipelineTag: "text-generation",
      libraryName: "transformers.js",
      tags: ["transformers.js", "text-generation", "conversational"],
      baseModel: "HuggingFaceTB/SmolLM3-3B",
      hasChatTemplate: true,
    },
    runtime: {
      preferredDtype: "q4",
      contextWindowTokens: 32768,
    },
  }),
  createTextModel({
    id: "onnx-community/Qwen2.5-Coder-3B-Instruct",
    label: "Qwen2.5 Coder 3B",
    summary: "Desktop-only coding model for stronger browser code assistance.",
    publisher: "onnx-community",
    paramsLabel: "3B params",
    parameterTier: "L",
    estimatedDownloadLabel: "Desktop experimental coding download",
    category: "desktop_experimental",
    starter: false,
    tested: true,
    hf: {
      modelId: "onnx-community/Qwen2.5-Coder-3B-Instruct",
      pipelineTag: "text-generation",
      libraryName: "transformers.js",
      tags: ["transformers.js", "text-generation", "conversational", "code"],
      baseModel: "Qwen/Qwen2.5-Coder-3B-Instruct",
      hasChatTemplate: true,
    },
    runtime: {
      preferredDtype: "q4",
      contextWindowTokens: 32768,
    },
  }),
  createTextModel({
    id: "onnx-community/gemma-4-E2B-it-ONNX",
    label: "Gemma 4 2B",
    summary: "Experimental new Gemma model with strong reasoning capabilities.",
    publisher: "onnx-community",
    paramsLabel: "2B params",
    parameterTier: "L",
    estimatedDownloadLabel: "Desktop experimental download",
    category: "desktop_experimental",
    starter: false,
    tested: false,
    hf: {
      modelId: "onnx-community/gemma-4-E2B-it-ONNX",
      pipelineTag: "text-generation",
      libraryName: "transformers.js",
      tags: ["transformers.js", "text-generation", "conversational"],
      baseModel: "google/gemma-4-E2B-it",
      hasChatTemplate: true,
    },
    runtime: {
      preferredDtype: "q4f16",
      fallbackDtype: "q4",
      contextWindowTokens: 32768,
    },
  }),
];

export const CURATED_MODELS_BY_ID = Object.fromEntries(
  CURATED_MODELS.map((model) => [model.id, model]),
) as Record<string, ModelDescriptor>;

export const STARTER_MODELS = CURATED_MODELS.filter((model) => model.starter);

export const HOME_STARTER_MODELS = [
  CURATED_MODELS_BY_ID["HuggingFaceTB/SmolLM2-360M-Instruct"],
  CURATED_MODELS_BY_ID["onnx-community/gemma-3-1b-it-ONNX"],
  CURATED_MODELS_BY_ID["onnx-community/Qwen2.5-Coder-0.5B-Instruct"],
  CURATED_MODELS_BY_ID["onnx-community/Qwen2.5-1.5B-Instruct"],
  CURATED_MODELS_BY_ID["onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX"],
  CURATED_MODELS_BY_ID["onnx-community/Qwen3.5-0.8B-ONNX"],
].filter(Boolean);

export const CURATED_AUDIO_MODELS: ModelDescriptor[] = [
  createSttModel({
    id: "onnx-community/moonshine-base-ONNX",
    label: "Moonshine Base",
    summary:
      "English-first transcription with the best quality-size tradeoff for browsers.",
    publisher: "onnx-community",
    paramsLabel: "61M params",
    parameterTier: "XS",
    estimatedDownloadLabel: "~67 MB download",
    category: "audio_recommended",
    tested: true,
    hf: {
      modelId: "onnx-community/moonshine-base-ONNX",
      pipelineTag: "automatic-speech-recognition",
      libraryName: "transformers.js",
      tags: ["transformers.js", "automatic-speech-recognition", "moonshine"],
      baseModel: "UsefulSensors/moonshine-base",
    },
    runtime: {
      contextWindowTokens: 0,
      preferredDtype: "int8",
      audioLoaderKind: "pipeline_asr",
      audioSampleRate: 16000,
      defaultLanguage: "English",
      supportsTimestamps: false,
    },
  }),
  createSttModel({
    id: "onnx-community/moonshine-tiny-ONNX",
    label: "Moonshine Tiny",
    summary:
      "Smaller English transcription model for the lightest browser path.",
    publisher: "onnx-community",
    paramsLabel: "27M params",
    parameterTier: "XS",
    estimatedDownloadLabel: "~32 MB download",
    category: "audio_smaller",
    tested: true,
    hf: {
      modelId: "onnx-community/moonshine-tiny-ONNX",
      pipelineTag: "automatic-speech-recognition",
      libraryName: "transformers.js",
      tags: ["transformers.js", "automatic-speech-recognition", "moonshine"],
      baseModel: "UsefulSensors/moonshine-tiny",
    },
    runtime: {
      contextWindowTokens: 0,
      preferredDtype: "int8",
      audioLoaderKind: "pipeline_asr",
      audioSampleRate: 16000,
      defaultLanguage: "English",
      supportsTimestamps: false,
    },
  }),
  createSttModel({
    id: "onnx-community/lite-whisper-large-v3-turbo-acc-ONNX",
    label: "Lite-Whisper Large v3 Turbo",
    summary: "Desktop-class multilingual transcription with timestamp support.",
    publisher: "onnx-community",
    paramsLabel: "1.55B params",
    parameterTier: "M",
    estimatedDownloadLabel: "~450 MB download",
    category: "audio_desktop_experimental",
    tested: true,
    hf: {
      modelId: "onnx-community/lite-whisper-large-v3-turbo-acc-ONNX",
      pipelineTag: "automatic-speech-recognition",
      libraryName: "transformers.js",
      tags: ["transformers.js", "automatic-speech-recognition", "lite-whisper"],
      baseModel: "efficient-speech/lite-whisper-large-v3-turbo-acc",
    },
    runtime: {
      contextWindowTokens: 0,
      preferredDtype: "q4f16",
      fallbackDtype: "q4",
      audioLoaderKind: "pipeline_asr",
      audioSampleRate: 16000,
      defaultLanguage: "Auto-detect",
      supportsTimestamps: true,
    },
  }),
  createTtsModel({
    id: "Xenova/speecht5_tts",
    label: "SpeechT5",
    summary:
      "Alternative English speech model with a separate speaker embedding profile, kept as a non-default option.",
    publisher: "Xenova",
    paramsLabel: "144M params",
    parameterTier: "S",
    estimatedDownloadLabel: "~132 MB download",
    category: "audio_desktop_experimental",
    tested: true,
    hf: {
      modelId: "Xenova/speecht5_tts",
      pipelineTag: "text-to-speech",
      libraryName: "transformers.js",
      tags: ["transformers.js", "text-to-speech", "speecht5"],
      baseModel: "microsoft/speecht5_tts",
    },
    runtime: {
      contextWindowTokens: 0,
      preferredDtype: "q4",
      audioLoaderKind: "speecht5_tts",
      audioSampleRate: 16000,
      defaultVoice: "default",
      voices: [{ id: "default", label: "Default" }],
      speakerEmbeddingsUrl:
        "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin",
    },
  }),
  createTtsModel({
    id: "onnx-community/Supertonic-TTS-ONNX",
    label: "Supertonic TTS",
    summary:
      "Best first-run English voice in the current browser pipeline set, with strong clarity and smooth playback.",
    publisher: "onnx-community",
    paramsLabel: "66M params",
    parameterTier: "S",
    estimatedDownloadLabel: "~263 MB download",
    category: "audio_recommended",
    tested: true,
    hf: {
      modelId: "onnx-community/Supertonic-TTS-ONNX",
      pipelineTag: "text-to-speech",
      libraryName: "transformers.js",
      tags: ["transformers.js", "text-to-speech", "supertonic"],
      baseModel: "Supertone/supertonic",
    },
    runtime: {
      contextWindowTokens: 0,
      audioLoaderKind: "supertonic_tts",
      audioSampleRate: 44100,
      defaultVoice: "F1",
      voices: [{ id: "F1", label: "F1" }],
      speakerEmbeddingsUrl:
        "https://huggingface.co/onnx-community/Supertonic-TTS-ONNX/resolve/main/voices/F1.bin",
    },
  }),
  createTtsModel({
    id: "Xenova/mms-tts-eng",
    label: "MMS TTS English",
    summary:
      "Smallest direct-pipeline English speech fallback, but with a lower-quality voice than the recommended path.",
    publisher: "Xenova",
    paramsLabel: "36.3M params",
    parameterTier: "XS",
    estimatedDownloadLabel: "~38 MB download",
    category: "audio_smaller",
    tested: true,
    hf: {
      modelId: "Xenova/mms-tts-eng",
      pipelineTag: "text-to-speech",
      libraryName: "transformers.js",
      tags: ["transformers.js", "text-to-speech", "vits"],
      baseModel: "facebook/mms-tts-eng",
    },
    runtime: {
      contextWindowTokens: 0,
      preferredDtype: "q4",
      audioLoaderKind: "pipeline_tts",
      audioSampleRate: 16000,
      defaultVoice: "default",
      voices: [{ id: "default", label: "Default" }],
    },
  }),
];

export const CURATED_AUDIO_MODELS_BY_ID = Object.fromEntries(
  CURATED_AUDIO_MODELS.map((model) => [model.id, model]),
) as Record<string, ModelDescriptor>;

export const getCanonicalCuratedModel = (modelId: string) =>
  CURATED_MODELS_BY_ID[modelId] ?? CURATED_AUDIO_MODELS_BY_ID[modelId] ?? null;

export const AUDIO_STT_MODELS = CURATED_AUDIO_MODELS.filter(
  (model) => model.task === "stt",
);

export const AUDIO_TTS_MODELS = CURATED_AUDIO_MODELS.filter(
  (model) => model.task === "tts",
);

export const VERIFIED_MODEL_IDS = new Set(
  CURATED_MODELS.filter((model) => model.tested).map((model) => model.id),
);

export const SEARCH_ALLOWLIST = new Set<string>([
  ...CURATED_MODELS.filter((model) => model.task === "text").map(
    (model) => model.id,
  ),
]);

export const BLOCKED_MODEL_IDS = new Set<string>([]);

export const getCuratedModelsForCategory = (category: CuratedCategoryKey) =>
  CURATED_MODELS.filter((model) => model.category === category);

const SEARCH_STOP_WORDS = new Set([
  "a",
  "and",
  "any",
  "browser",
  "chat",
  "compatible",
  "find",
  "for",
  "in",
  "llm",
  "load",
  "loaded",
  "loading",
  "model",
  "models",
  "new",
  "of",
  "or",
  "the",
  "to",
  "try",
  "use",
  "with",
]);

const normalizeSearchValue = (value: string) =>
  value
    .toLowerCase()
    .replace(/[-_/]/g, " ")
    .replace(/[^\w\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenizeSearchValue = (value: string) =>
  normalizeSearchValue(value)
    .split(" ")
    .filter((token) => token && !SEARCH_STOP_WORDS.has(token));

export const searchCatalogModels = (query: string) => {
  const tokens = tokenizeSearchValue(query);

  if (tokens.length === 0) {
    return [];
  }

  return CURATED_MODELS.filter((model) => {
    const haystack = normalizeSearchValue(
      [
        model.id,
        model.label,
        model.publisher,
        model.summary,
        model.hf.baseModel,
      ]
        .filter(Boolean)
        .join(" "),
    );

    return tokens.every((token) => haystack.includes(token));
  });
};
