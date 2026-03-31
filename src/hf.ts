import { inferParameterInfo } from "./compatibility";
import { formatBytes } from "./format";
import type { DeviceCapabilities, Dtype, ModelDescriptor, SearchFilters } from "./types";

const HF_API_URL = "https://huggingface.co/api/models";
const searchCache = new Map<string, ModelDescriptor[]>();
const TRUSTED_PUBLISHERS = new Set(["onnx-community", "HuggingFaceTB", "Xenova"]);
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
const FAMILY_ALIASES: Record<string, string> = {
  gemma3: "gemma",
  qwen2: "qwen",
  "qwen2.5": "qwen",
  qwen3: "qwen",
  "qwen3.5": "qwen",
  smol: "smollm",
  smollm2: "smollm",
  smollm3: "smollm",
};
const REPO_ID_PATTERN = /^[\w.-]+\/[\w.-]+$/;
const SEARCH_RESULT_LIMIT = 24;
const DETAIL_ENRICH_LIMIT = 10;

type SearchResponseModel = {
  id: string;
  author?: string;
  pipeline_tag?: string;
  library_name?: string;
  tags?: string[];
  downloads?: number;
  likes?: number;
  createdAt?: string;
  cardData?: {
    base_model?: string | string[];
    library_name?: string;
  };
};

type ModelDetailsResponse = {
  id: string;
  author?: string;
  pipeline_tag?: string;
  library_name?: string;
  tags?: string[];
  downloads?: number;
  likes?: number;
  createdAt?: string;
  usedStorage?: number;
  config?: {
    max_position_embeddings?: number;
    tokenizer_config?: {
      model_max_length?: number;
      chat_template?: string;
      chat_template_jinja?: string;
    };
  };
  cardData?: {
    base_model?: string | string[];
  };
  siblings?: Array<{ rfilename: string }>;
};

const toArray = (value?: string | string[]) => {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
};

const toTitle = (value: string) =>
  value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const createSearchCacheKey = (query: string, filters: SearchFilters, device: DeviceCapabilities) =>
  JSON.stringify({
    query: query.trim().toLowerCase(),
    mobileSafe: filters.mobileSafe,
    showExperimental: filters.showExperimental,
    verifiedOnly: filters.verifiedOnly,
    deviceTier: device.tier,
  });

const normalizeSearchQuery = (query: string) =>
  query
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/[^\w\s./]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenizeSearchQuery = (query: string) =>
  normalizeSearchQuery(query)
    .split(" ")
    .filter((token) => token && !SEARCH_STOP_WORDS.has(token))
    .map((token) => FAMILY_ALIASES[token] ?? token);

const buildSearchTerms = (query: string) => {
  const trimmedQuery = query.trim();
  const tokens = tokenizeSearchQuery(trimmedQuery);
  const terms = new Set<string>();

  if (REPO_ID_PATTERN.test(trimmedQuery)) {
    terms.add(trimmedQuery);
  }

  if (tokens.length > 0) {
    terms.add(tokens.slice(0, 3).join(" "));

    tokens.slice(0, 3).forEach((token) => {
      if (token.length >= 2) {
        terms.add(token);
      }
    });
  }

  if (terms.size === 0 && trimmedQuery) {
    terms.add(trimmedQuery);
  }

  return [...terms].slice(0, 4);
};

const summarizeSearchModel = (repoName: string, tags: string[]) => {
  const lowerRepoName = repoName.toLowerCase();

  if (tags.includes("code") || /coder|code/i.test(lowerRepoName)) {
    return "Coding-oriented model for in-browser assistance.";
  }

  if (tags.includes("reasoning") || /reason/i.test(lowerRepoName)) {
    return "Reasoning-oriented model for local browser chat.";
  }

  return "Chat-ready model candidate for browser inference.";
};

const uniqueModelsById = (models: ModelDescriptor[]) =>
  [...new Map(models.map((model) => [model.id, model])).values()];

const scoreSearchModel = (model: ModelDescriptor, rawQuery: string) => {
  const normalizedQuery = normalizeSearchQuery(rawQuery);
  const tokens = tokenizeSearchQuery(rawQuery);
  const haystack = normalizeSearchQuery(
    [model.id, model.label, model.publisher, model.hf.baseModel].filter(Boolean).join(" "),
  );

  let score = 0;

  if (model.id.toLowerCase() === rawQuery.trim().toLowerCase()) {
    score += 220;
  }

  if (normalizedQuery && haystack.includes(normalizedQuery)) {
    score += 60;
  }

  if (tokens.every((token) => haystack.includes(token))) {
    score += 40;
  }

  if (model.hf.libraryName === "transformers.js" || model.hf.tags.includes("transformers.js")) {
    score += 35;
  }

  if (TRUSTED_PUBLISHERS.has(model.publisher)) {
    score += 24;
  }

  if (model.hf.hasChatTemplate || model.hf.tags.includes("conversational")) {
    score += 10;
  }

  if (model.tested) {
    score += 16;
  }

  score += Math.log10((model.hf.downloads ?? 0) + 1) * 3;

  return score;
};

const fetchSearchPage = async (term: string) => {
  const params = new URLSearchParams({
    search: term,
    pipeline_tag: "text-generation",
    limit: "12",
    sort: "downloads",
    direction: "-1",
  });

  const response = await fetch(`${HF_API_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Unable to search compatible Hugging Face models right now.");
  }

  return (await response.json()) as SearchResponseModel[];
};

const inferTextRuntime = (siblings?: Array<{ rfilename: string }>) => {
  const siblingFiles = new Set((siblings ?? []).map((entry) => entry.rfilename));
  const hasFile = (file: string) => siblingFiles.has(file);
  const dtypeCandidates: Dtype[] = ["q4f16", "q4", "int8", "uint8", "fp16", "fp32"];
  const dtypeToFile: Record<Dtype, string[]> = {
    q4f16: ["onnx/model_q4f16.onnx"],
    q4: ["onnx/model_q4.onnx", "onnx/model_bnb4.onnx", "onnx/model_quantized.onnx"],
    q8: [],
    int8: ["onnx/model_int8.onnx"],
    uint8: ["onnx/model_uint8.onnx"],
    fp16: ["onnx/model_fp16.onnx"],
    fp32: ["onnx/model.onnx"],
  };

  const available = dtypeCandidates.filter((dtype) =>
    dtypeToFile[dtype].some((file) => hasFile(file)),
  );

  return {
    preferredDtype: available[0] ?? "q4",
    fallbackDtype: available[1],
  };
};

const extractContextWindow = (details: ModelDetailsResponse) => {
  const tokenizerMaxLength = details.config?.tokenizer_config?.model_max_length;

  if (
    typeof tokenizerMaxLength === "number" &&
    Number.isFinite(tokenizerMaxLength) &&
    tokenizerMaxLength > 0 &&
    tokenizerMaxLength < 1_000_000
  ) {
    return tokenizerMaxLength;
  }

  if (
    typeof details.config?.max_position_embeddings === "number" &&
    Number.isFinite(details.config.max_position_embeddings) &&
    details.config.max_position_embeddings > 0
  ) {
    return details.config.max_position_embeddings;
  }

  return 8192;
};

const normalizeSearchModel = (item: SearchResponseModel): ModelDescriptor => {
  const baseModel = toArray(item.cardData?.base_model)[0];
  const repoName = item.id.split("/").at(-1) ?? item.id;
  const parameterInfo = inferParameterInfo(item.id, baseModel, repoName);
  const tags = item.tags ?? [];

  return {
    id: item.id,
    label: toTitle(repoName),
    summary: summarizeSearchModel(repoName, tags),
    source: "search",
    task: "text",
    publisher: item.author ?? item.id.split("/")[0] ?? "Unknown",
    paramsLabel: parameterInfo.paramsLabel,
    parameterTier: parameterInfo.parameterTier,
    estimatedDownloadLabel: null,
    tested: false,
    hf: {
      modelId: item.id,
      pipelineTag: item.pipeline_tag ?? "text-generation",
      libraryName: item.library_name ?? item.cardData?.library_name,
      tags,
      baseModel,
      downloads: item.downloads,
      likes: item.likes,
      hasChatTemplate: tags.includes("conversational"),
    },
    runtime: {
      preferredDtype: "q4f16",
      fallbackDtype: "q4",
      contextWindowTokens: 8192,
    },
  };
};

const normalizeDetailsModel = (details: ModelDetailsResponse): ModelDescriptor =>
  normalizeSearchModel({
    id: details.id,
    author: details.author,
    pipeline_tag: details.pipeline_tag,
    library_name: details.library_name,
    tags: details.tags,
    downloads: details.downloads,
    likes: details.likes,
    createdAt: details.createdAt,
    cardData: details.cardData,
  });

export const searchHubModels = async (
  query: string,
  filters: SearchFilters,
  device: DeviceCapabilities,
) => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const cacheKey = createSearchCacheKey(trimmedQuery, filters, device);
  const cached = searchCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const searchTerms = buildSearchTerms(trimmedQuery);
  if (searchTerms.length === 0) {
    return [];
  }

  const pages = await Promise.all(searchTerms.map((term) => fetchSearchPage(term)));
  const remoteModels = uniqueModelsById(pages.flat().map(normalizeSearchModel));
  const rankedCandidates = [...remoteModels].sort(
    (left, right) => scoreSearchModel(right, trimmedQuery) - scoreSearchModel(left, trimmedQuery),
  );

  const detailIds = new Set(rankedCandidates.slice(0, DETAIL_ENRICH_LIMIT).map((model) => model.id));

  if (REPO_ID_PATTERN.test(trimmedQuery)) {
    detailIds.add(trimmedQuery);
  }

  const detailEntries = await Promise.all(
    [...detailIds].map(async (modelId) => {
      try {
        return [modelId, await fetchHubModelDetails(modelId)] as const;
      } catch {
        return null;
      }
    }),
  );

  const detailsMap = new Map<string, ModelDetailsResponse>(
    detailEntries.filter(Boolean) as Array<readonly [string, ModelDetailsResponse]>,
  );

  const exactRepoMatch = REPO_ID_PATTERN.test(trimmedQuery) ? trimmedQuery : null;
  const exactRepoDetails = exactRepoMatch ? detailsMap.get(exactRepoMatch) : undefined;
  const exactRepoCandidate =
    exactRepoMatch && exactRepoDetails && !rankedCandidates.some((model) => model.id === exactRepoMatch)
      ? [enrichModelDescriptor(normalizeDetailsModel(exactRepoDetails), exactRepoDetails)]
      : [];

  const models = uniqueModelsById(
    [...exactRepoCandidate, ...rankedCandidates].map((model) => {
      const details = detailsMap.get(model.id);
      return details ? enrichModelDescriptor(model, details) : model;
    }),
  )
    .sort((left, right) => scoreSearchModel(right, trimmedQuery) - scoreSearchModel(left, trimmedQuery))
    .slice(0, SEARCH_RESULT_LIMIT);

  searchCache.set(cacheKey, models);
  return models;
};

export const fetchHubModelDetails = async (modelId: string) => {
  const response = await fetch(`${HF_API_URL}/${modelId}`);
  if (!response.ok) {
    throw new Error("Unable to load model details from Hugging Face.");
  }

  return (await response.json()) as ModelDetailsResponse;
};

export const enrichModelDescriptor = (
  model: ModelDescriptor,
  details: ModelDetailsResponse,
): ModelDescriptor => {
  const baseModel = toArray(details.cardData?.base_model)[0] ?? model.hf.baseModel;
  const parameterInfo = inferParameterInfo(model.id, baseModel, model.label);
  const runtimeInfo = inferTextRuntime(details.siblings);
  const usedStorageLabel = formatBytes(details.usedStorage);

  return {
    ...model,
    paramsLabel: model.paramsLabel === "Unknown size" ? parameterInfo.paramsLabel : model.paramsLabel,
    parameterTier:
      model.parameterTier === "unknown" ? parameterInfo.parameterTier : model.parameterTier,
    estimatedDownloadLabel:
      usedStorageLabel && details.usedStorage
        ? `Repo storage ${usedStorageLabel}`
        : model.estimatedDownloadLabel,
    hf: {
      ...model.hf,
      libraryName: details.library_name ?? model.hf.libraryName,
      tags: details.tags ?? model.hf.tags,
      baseModel,
      downloads: details.downloads ?? model.hf.downloads,
      likes: details.likes ?? model.hf.likes,
      usedStorage: details.usedStorage,
      hasChatTemplate:
        Boolean(details.config?.tokenizer_config?.chat_template) ||
        Boolean(details.config?.tokenizer_config?.chat_template_jinja) ||
        model.hf.hasChatTemplate,
    },
    runtime: {
      ...model.runtime,
      preferredDtype: runtimeInfo.preferredDtype,
      fallbackDtype: runtimeInfo.fallbackDtype,
      contextWindowTokens: extractContextWindow(details),
    },
  };
};
