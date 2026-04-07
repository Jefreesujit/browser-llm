import type {
  AppSettings,
  ChatThread,
  LocalModelVerdictCache,
  LocalModelVerdictEntry,
  ModelDescriptor,
  PickerTab,
  StorageWriteResult,
} from "./types";
import { DEFAULT_APP_SETTINGS } from "./types";

const LAST_MODEL_KEY = "webllm:last-model";
const RECENT_MODELS_KEY = "webllm:recent-models";
const PICKER_TAB_KEY = "webllm:picker-tab";
const SHOW_EXPERIMENTAL_KEY = "webllm:show-experimental";
const MODEL_VERDICT_CACHE_KEY = "webllm:model-verdict-cache";
const ACTIVE_CHAT_THREAD_KEY = "webllm:active-chat-thread";
const APP_SETTINGS_KEY = "webllm:app-settings";

const LEGACY_CHAT_THREADS_KEY = "webllm:chat-threads";

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

const writeJson = (key: string, value: unknown): StorageWriteResult => {
  if (typeof window === "undefined") {
    return { ok: false, reason: "unavailable" };
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch {
    return { ok: false, reason: "quota" };
  }
};

const removeValue = (key: string): StorageWriteResult => {
  if (typeof window === "undefined") {
    return { ok: false, reason: "unavailable" };
  }

  try {
    window.localStorage.removeItem(key);
    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
};

export const loadLastModel = () => readJson<ModelDescriptor | null>(LAST_MODEL_KEY, null);
export const saveLastModel = (model: ModelDescriptor) => writeJson(LAST_MODEL_KEY, model);
export const clearLastModel = () => removeValue(LAST_MODEL_KEY);

export const loadRecentModels = () => readJson<ModelDescriptor[]>(RECENT_MODELS_KEY, []);
export const saveRecentModels = (models: ModelDescriptor[]) => writeJson(RECENT_MODELS_KEY, models);
export const clearRecentModels = () => removeValue(RECENT_MODELS_KEY);

export const pushRecentModel = (model: ModelDescriptor) => {
  const next = [model, ...loadRecentModels().filter((entry) => entry.id !== model.id)].slice(0, 12);
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

export const clearModelVerdictCache = () => removeValue(MODEL_VERDICT_CACHE_KEY);

export const upsertModelVerdict = (modelId: string, entry: LocalModelVerdictEntry) => {
  const next = {
    ...loadModelVerdictCache(),
    [modelId]: entry,
  };
  saveModelVerdictCache(next);
  return next;
};

export const loadActiveChatThreadId = () => readJson<string | null>(ACTIVE_CHAT_THREAD_KEY, null);

export const saveActiveChatThreadId = (threadId: string | null) =>
  threadId ? writeJson(ACTIVE_CHAT_THREAD_KEY, threadId) : removeValue(ACTIVE_CHAT_THREAD_KEY);

export const loadAppSettings = (): AppSettings => {
  const stored = readJson<Partial<AppSettings>>(APP_SETTINGS_KEY, {});
  return { ...DEFAULT_APP_SETTINGS, ...stored };
};

export const saveAppSettings = (settings: AppSettings) => writeJson(APP_SETTINGS_KEY, settings);
export const clearAppSettings = () => removeValue(APP_SETTINGS_KEY);

export const loadLegacyChatThreads = () => readJson<ChatThread[]>(LEGACY_CHAT_THREADS_KEY, []);
export const clearLegacyChatThreads = () => removeValue(LEGACY_CHAT_THREADS_KEY);

export const clearLightweightAppState = () => {
  const results = [
    clearLastModel(),
    clearRecentModels(),
    clearModelVerdictCache(),
    removeValue(PICKER_TAB_KEY),
    removeValue(SHOW_EXPERIMENTAL_KEY),
    saveActiveChatThreadId(null),
    clearAppSettings(),
  ];

  return results.every((result) => result.ok);
};
