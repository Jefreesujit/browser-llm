import { getCanonicalCuratedModel } from "./models";
import type {
  AppSettings,
  AudioTab,
  AudioView,
  ChatPersistenceStatus,
  ChatThread,
  LocalModelVerdictCache,
  LocalModelVerdictEntry,
  ModelDescriptor,
  PickerTab,
  StorageWriteResult,
  WorkspaceMode,
} from "./types";
import { DEFAULT_APP_SETTINGS } from "./types";

const LAST_MODEL_KEY = "webllm:last-model";
const LAST_STT_MODEL_KEY = "webllm:last-stt-model";
const LAST_TTS_MODEL_KEY = "webllm:last-tts-model";
const LAST_AUDIO_TAB_KEY = "webllm:last-audio-tab";
const LAST_AUDIO_VIEW_KEY = "webllm:last-audio-view";
const LAST_WORKSPACE_KEY = "webllm:last-workspace";
const RECENT_MODELS_KEY = "webllm:recent-models";
const PICKER_TAB_KEY = "webllm:picker-tab";
const SHOW_EXPERIMENTAL_KEY = "webllm:show-experimental";
const MODEL_VERDICT_CACHE_KEY = "webllm:model-verdict-cache";
const ACTIVE_CHAT_THREAD_KEY = "webllm:active-chat-thread";
const APP_SETTINGS_KEY = "webllm:app-settings";

const LEGACY_CHAT_THREADS_KEY = "webllm:chat-threads";

export type StorageFeedback = {
  status: ChatPersistenceStatus;
  warning: string | null;
};

export const readJson = <T>(key: string, fallback: T) => {
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

export const writeJson = (key: string, value: unknown): StorageWriteResult => {
  if (typeof window === "undefined") {
    return { ok: false, reason: "unavailable" };
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof DOMException && error.name === "QuotaExceededError"
          ? "quota"
          : "unavailable",
    };
  }
};

export const removeValue = (key: string): StorageWriteResult => {
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

export const getDefaultStorageMessage = (status: ChatPersistenceStatus) => {
  switch (status) {
    case "fallback_local_storage":
      return "Chat history is using local storage fallback in this browser.";
    case "quota_exceeded":
      return "Browser storage is full. Delete some chats or downloaded models.";
    case "unavailable":
      return "Chat persistence is unavailable in this browser session.";
    default:
      return null;
  }
};

export const deriveStorageFeedback = (
  results: StorageWriteResult[],
  storeKind: "indexeddb" | "localstorage" | null | undefined,
): StorageFeedback => {
  const firstFailure = results.find((result) => !result.ok);

  if (!firstFailure) {
    const status: ChatPersistenceStatus =
      storeKind === "localstorage" ? "fallback_local_storage" : "ready";

    return {
      status,
      warning: getDefaultStorageMessage(status),
    };
  }

  if (firstFailure.reason === "quota") {
    return {
      status: "quota_exceeded",
      warning:
        "Browser storage is full. Delete some chats or downloaded models.",
    };
  }

  return {
    status: "unavailable",
    warning:
      firstFailure.reason === "blocked"
        ? "Browser storage is blocked in this session."
        : "Unable to save chat changes in this browser session.",
  };
};

const canonicalizeStoredModel = (
  model: ModelDescriptor | null,
): ModelDescriptor | null => {
  if (!model) {
    return null;
  }

  const canonicalModel = getCanonicalCuratedModel(model.id);
  if (!canonicalModel) {
    return model;
  }

  return {
    ...canonicalModel,
    source: model.source,
  };
};

export const loadLastModel = () =>
  canonicalizeStoredModel(
    readJson<ModelDescriptor | null>(LAST_MODEL_KEY, null),
  );
export const saveLastModel = (model: ModelDescriptor) =>
  writeJson(LAST_MODEL_KEY, model);
export const clearLastModel = () => removeValue(LAST_MODEL_KEY);

export const loadLastSttModel = () =>
  canonicalizeStoredModel(
    readJson<ModelDescriptor | null>(LAST_STT_MODEL_KEY, null),
  );
export const saveLastSttModel = (model: ModelDescriptor) =>
  writeJson(LAST_STT_MODEL_KEY, model);
export const clearLastSttModel = () => removeValue(LAST_STT_MODEL_KEY);

export const loadLastTtsModel = () =>
  canonicalizeStoredModel(
    readJson<ModelDescriptor | null>(LAST_TTS_MODEL_KEY, null),
  );
export const saveLastTtsModel = (model: ModelDescriptor) =>
  writeJson(LAST_TTS_MODEL_KEY, model);
export const clearLastTtsModel = () => removeValue(LAST_TTS_MODEL_KEY);

export const loadLastAudioTab = () =>
  readJson<AudioTab>(LAST_AUDIO_TAB_KEY, "transcribe");
export const saveLastAudioTab = (tab: AudioTab) =>
  writeJson(LAST_AUDIO_TAB_KEY, tab);
export const clearLastAudioTab = () => removeValue(LAST_AUDIO_TAB_KEY);

export const loadLastAudioView = () => {
  const stored = readJson<AudioView | null>(LAST_AUDIO_VIEW_KEY, null);
  if (stored === "overview" || stored === "transcribe" || stored === "speak") {
    return stored;
  }

  return loadLastAudioTab() === "speak" ? "speak" : "overview";
};
export const saveLastAudioView = (view: AudioView) =>
  writeJson(LAST_AUDIO_VIEW_KEY, view);
export const clearLastAudioView = () => removeValue(LAST_AUDIO_VIEW_KEY);

export const loadLastWorkspace = () => {
  const stored = readJson<WorkspaceMode | null>(LAST_WORKSPACE_KEY, null);
  return stored === "audio" ? "audio" : "chat";
};

export const saveLastWorkspace = (workspace: WorkspaceMode) =>
  writeJson(LAST_WORKSPACE_KEY, workspace);

export const clearLastWorkspace = () => removeValue(LAST_WORKSPACE_KEY);

export const loadRecentModels = () =>
  readJson<ModelDescriptor[]>(RECENT_MODELS_KEY, []).map((model) =>
    canonicalizeStoredModel(model),
  ) as ModelDescriptor[];
export const saveRecentModels = (models: ModelDescriptor[]) =>
  writeJson(RECENT_MODELS_KEY, models);
export const clearRecentModels = () => removeValue(RECENT_MODELS_KEY);

export const pushRecentModel = (model: ModelDescriptor) => {
  const next = [
    model,
    ...loadRecentModels().filter((entry) => entry.id !== model.id),
  ].slice(0, 12);
  saveRecentModels(next);
  return next;
};

export const loadPickerTab = () =>
  readJson<PickerTab>(PICKER_TAB_KEY, "curated");
export const savePickerTab = (tab: PickerTab) => writeJson(PICKER_TAB_KEY, tab);

export const loadShowExperimental = () =>
  readJson<boolean>(SHOW_EXPERIMENTAL_KEY, false);
export const saveShowExperimental = (value: boolean) =>
  writeJson(SHOW_EXPERIMENTAL_KEY, value);

export const loadModelVerdictCache = () =>
  readJson<LocalModelVerdictCache>(MODEL_VERDICT_CACHE_KEY, {});

export const saveModelVerdictCache = (cache: LocalModelVerdictCache) =>
  writeJson(MODEL_VERDICT_CACHE_KEY, cache);

export const clearModelVerdictCache = () =>
  removeValue(MODEL_VERDICT_CACHE_KEY);

export const upsertModelVerdict = (
  modelId: string,
  entry: LocalModelVerdictEntry,
) => {
  const next = {
    ...loadModelVerdictCache(),
    [modelId]: entry,
  };
  saveModelVerdictCache(next);
  return next;
};

export const loadActiveChatThreadId = () =>
  readJson<string | null>(ACTIVE_CHAT_THREAD_KEY, null);

export const saveActiveChatThreadId = (threadId: string | null) =>
  threadId
    ? writeJson(ACTIVE_CHAT_THREAD_KEY, threadId)
    : removeValue(ACTIVE_CHAT_THREAD_KEY);

export const loadAppSettings = (): AppSettings => {
  const stored = readJson<Partial<AppSettings>>(APP_SETTINGS_KEY, {});
  return { ...DEFAULT_APP_SETTINGS, ...stored };
};

export const saveAppSettings = (settings: AppSettings) =>
  writeJson(APP_SETTINGS_KEY, settings);
export const clearAppSettings = () => removeValue(APP_SETTINGS_KEY);

export const loadLegacyChatThreads = () =>
  readJson<ChatThread[]>(LEGACY_CHAT_THREADS_KEY, []);
export const clearLegacyChatThreads = () =>
  removeValue(LEGACY_CHAT_THREADS_KEY);

export const clearLightweightAppState = () => {
  const results = [
    clearLastModel(),
    clearLastSttModel(),
    clearLastTtsModel(),
    clearLastAudioTab(),
    clearLastAudioView(),
    clearLastWorkspace(),
    clearRecentModels(),
    clearModelVerdictCache(),
    removeValue(PICKER_TAB_KEY),
    removeValue(SHOW_EXPERIMENTAL_KEY),
    saveActiveChatThreadId(null),
    clearAppSettings(),
  ];

  return results.every((result) => result.ok);
};
