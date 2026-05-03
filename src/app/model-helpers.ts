import { getCompatibilityReport } from "../compatibility";
import {
  AUDIO_STT_MODELS,
  AUDIO_TTS_MODELS,
  CURATED_CATEGORIES,
  CURATED_MODELS,
  getCuratedModelsForCategory,
  HOME_STARTER_MODELS,
} from "../models";
import { loadLastModel } from "../storage";
import type {
  DeviceCapabilities,
  LocalModelVerdictCache,
  ModelDescriptor,
} from "../types";

const DEFAULT_CHAT_MODEL_ID = "onnx-community/gemma-3-270m-it-ONNX";

type ModelWithCompatibility = {
  model: ModelDescriptor;
  compatibility: NonNullable<ModelDescriptor["compatibility"]>;
};

export type CategorizedModelSection = {
  category: {
    key: string;
    label: string;
    description: string;
  };
  models: ModelWithCompatibility[];
};

export const decorateModel = (
  model: ModelDescriptor,
  deviceCapabilities: DeviceCapabilities,
  localVerdicts: LocalModelVerdictCache,
): ModelDescriptor => ({
  ...model,
  compatibility: getCompatibilityReport(
    model,
    deviceCapabilities,
    localVerdicts,
  ),
});

const attachCompatibility = (
  model: ModelDescriptor,
  deviceCapabilities: DeviceCapabilities,
  localVerdicts: LocalModelVerdictCache,
): ModelWithCompatibility => {
  const decoratedModel = decorateModel(
    model,
    deviceCapabilities,
    localVerdicts,
  );

  return {
    model: decoratedModel,
    compatibility: decoratedModel.compatibility!,
  };
};

export const sortRecentModelsByLocalVerdict = (
  recentModels: ModelDescriptor[],
  localVerdicts: LocalModelVerdictCache,
) =>
  [...recentModels].sort((left, right) => {
    const leftVerdict = localVerdicts[left.id];
    const rightVerdict = localVerdicts[right.id];
    const leftWeight = leftVerdict?.status === "verified" ? 0 : 1;
    const rightWeight = rightVerdict?.status === "verified" ? 0 : 1;

    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight;
    }

    const leftTime = leftVerdict ? Date.parse(leftVerdict.lastLoadedAt) : 0;
    const rightTime = rightVerdict ? Date.parse(rightVerdict.lastLoadedAt) : 0;
    return rightTime - leftTime;
  });

export const buildCuratedSections = (
  deviceCapabilities: DeviceCapabilities,
  localVerdicts: LocalModelVerdictCache,
): CategorizedModelSection[] =>
  CURATED_CATEGORIES.map((category) => ({
    category,
    models: getCuratedModelsForCategory(category.key).map((model) =>
      attachCompatibility(model, deviceCapabilities, localVerdicts),
    ),
  }));

export const buildStarterModels = (
  deviceCapabilities: DeviceCapabilities,
  localVerdicts: LocalModelVerdictCache,
) =>
  HOME_STARTER_MODELS.map((model) =>
    attachCompatibility(model, deviceCapabilities, localVerdicts),
  );

export const buildRecentModels = (
  recentModels: ModelDescriptor[],
  deviceCapabilities: DeviceCapabilities,
  localVerdicts: LocalModelVerdictCache,
) =>
  sortRecentModelsByLocalVerdict(recentModels, localVerdicts).map((model) =>
    attachCompatibility(model, deviceCapabilities, localVerdicts),
  );

export const getRecommendedModel = (
  deviceCapabilities: DeviceCapabilities,
  localVerdicts: LocalModelVerdictCache,
) => {
  const lastModel = loadLastModel();
  if (lastModel && (lastModel.task === "text" || lastModel.task === "vision")) {
    const decoratedLastModel = decorateModel(
      lastModel,
      deviceCapabilities,
      localVerdicts,
    );
    if (decoratedLastModel.compatibility?.canLoad) {
      return decoratedLastModel;
    }
  }

  const defaultModel = CURATED_MODELS.find(
    (model) => model.id === DEFAULT_CHAT_MODEL_ID,
  );
  if (defaultModel) {
    const decoratedDefaultModel = decorateModel(
      defaultModel,
      deviceCapabilities,
      localVerdicts,
    );
    if (decoratedDefaultModel.compatibility?.canLoad) {
      return decoratedDefaultModel;
    }
  }

  const preferredCategory =
    deviceCapabilities.tier === "mobile" ? "mobile_safe" : "balanced";
  const fallback = CURATED_MODELS.find(
    (model) => model.category === preferredCategory && model.task === "text",
  );

  return fallback
    ? decorateModel(fallback, deviceCapabilities, localVerdicts)
    : null;
};

const AUDIO_SECTION_COPY = {
  audio_recommended: {
    key: "audio_recommended",
    label: "Recommended",
    description:
      "Best first-run quality for this audio task in a browser-first experience.",
  },
  audio_smaller: {
    key: "audio_smaller",
    label: "Fallbacks",
    description:
      "Alternative browser-friendly options with different quality, size, and runtime tradeoffs.",
  },
  audio_desktop_experimental: {
    key: "audio_desktop_experimental",
    label: "Desktop Experimental",
    description:
      "Larger models with stronger output quality when your desktop can handle them.",
  },
} as const;

export const buildAudioSections = (
  task: "transcribe" | "speak",
  deviceCapabilities: DeviceCapabilities,
  localVerdicts: LocalModelVerdictCache,
): CategorizedModelSection[] => {
  const sourceModels =
    task === "transcribe" ? AUDIO_STT_MODELS : AUDIO_TTS_MODELS;

  return Object.values(AUDIO_SECTION_COPY).map((category) => ({
    category,
    models: sourceModels
      .filter((model) => model.category === category.key)
      .map((model) =>
        attachCompatibility(model, deviceCapabilities, localVerdicts),
      ),
  }));
};

export const buildRecentAudioModels = (
  task: "transcribe" | "speak",
  recentModels: ModelDescriptor[],
  deviceCapabilities: DeviceCapabilities,
  localVerdicts: LocalModelVerdictCache,
) =>
  buildRecentModels(recentModels, deviceCapabilities, localVerdicts).filter(
    ({ model }) =>
      task === "transcribe" ? model.task === "stt" : model.task === "tts",
  );

export const getFallbackAudioModel = (task: "transcribe" | "speak") => {
  const models = task === "transcribe" ? AUDIO_STT_MODELS : AUDIO_TTS_MODELS;
  return (
    models.find((model) => model.category === "audio_recommended") ??
    models[0] ??
    null
  );
};

export const getFallbackThreadModel = (
  deviceCapabilities: DeviceCapabilities,
  localVerdicts: LocalModelVerdictCache,
) => {
  const defaultModel = CURATED_MODELS.find(
    (model) => model.id === DEFAULT_CHAT_MODEL_ID,
  );
  if (defaultModel) {
    return decorateModel(defaultModel, deviceCapabilities, localVerdicts);
  }

  const fallback = CURATED_MODELS.find((model) =>
    deviceCapabilities.tier === "mobile"
      ? model.category === "mobile_safe" && model.task === "text"
      : model.category === "balanced" && model.task === "text",
  );

  return fallback
    ? decorateModel(fallback, deviceCapabilities, localVerdicts)
    : null;
};
