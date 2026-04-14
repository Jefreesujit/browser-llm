import { getCompatibilityReport } from "../compatibility";
import type { CuratedCategory } from "../models";
import {
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

type ModelWithCompatibility = {
  model: ModelDescriptor;
  compatibility: NonNullable<ModelDescriptor["compatibility"]>;
};

export type CategorizedModelSection = {
  category: CuratedCategory;
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
  if (lastModel) {
    const decoratedLastModel = decorateModel(
      lastModel,
      deviceCapabilities,
      localVerdicts,
    );
    if (decoratedLastModel.compatibility?.canLoad) {
      return decoratedLastModel;
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

export const getFallbackThreadModel = (
  deviceCapabilities: DeviceCapabilities,
  localVerdicts: LocalModelVerdictCache,
) => {
  const fallback = CURATED_MODELS.find((model) =>
    deviceCapabilities.tier === "mobile"
      ? model.category === "mobile_safe" && model.task === "text"
      : model.category === "balanced" && model.task === "text",
  );

  return fallback
    ? decorateModel(fallback, deviceCapabilities, localVerdicts)
    : null;
};
