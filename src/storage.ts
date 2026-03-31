import type {
  LocalModelVerdictCache,
  LocalModelVerdictEntry,
  ModelDescriptor,
  PickerTab,
} from "./types";

const LAST_MODEL_KEY = "webllm:last-model";
const RECENT_MODELS_KEY = "webllm:recent-models";
const PICKER_TAB_KEY = "webllm:picker-tab";
const SHOW_EXPERIMENTAL_KEY = "webllm:show-experimental";
const MODEL_VERDICT_CACHE_KEY = "webllm:model-verdict-cache";

const readJson = <T>(key: string, fallback: T) => {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota and privacy-mode write failures.
  }
};

export const loadLastModel = () => readJson<ModelDescriptor | null>(LAST_MODEL_KEY, null);
export const saveLastModel = (model: ModelDescriptor) => writeJson(LAST_MODEL_KEY, model);

export const loadRecentModels = () => readJson<ModelDescriptor[]>(RECENT_MODELS_KEY, []);
export const saveRecentModels = (models: ModelDescriptor[]) => writeJson(RECENT_MODELS_KEY, models);

export const pushRecentModel = (model: ModelDescriptor) => {
  const next = [
    model,
    ...loadRecentModels().filter((entry) => entry.id !== model.id),
  ].slice(0, 12);
  saveRecentModels(next);
  return next;
};

export const loadPickerTab = () => readJson<PickerTab>(PICKER_TAB_KEY, "curated");
export const savePickerTab = (tab: PickerTab) => writeJson(PICKER_TAB_KEY, tab);

export const loadShowExperimental = () => readJson<boolean>(SHOW_EXPERIMENTAL_KEY, false);
export const saveShowExperimental = (value: boolean) => writeJson(SHOW_EXPERIMENTAL_KEY, value);

export const loadModelVerdictCache = () =>
  readJson<LocalModelVerdictCache>(MODEL_VERDICT_CACHE_KEY, {});

export const saveModelVerdictCache = (cache: LocalModelVerdictCache) =>
  writeJson(MODEL_VERDICT_CACHE_KEY, cache);

export const upsertModelVerdict = (modelId: string, entry: LocalModelVerdictEntry) => {
  const next = {
    ...loadModelVerdictCache(),
    [modelId]: entry,
  };
  saveModelVerdictCache(next);
  return next;
};
