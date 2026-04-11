import {
  FormEvent,
  KeyboardEvent,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { initializeChatStore } from "./chat-store";
import ChatScreen from "./components/ChatScreen";
import LandingScreen from "./components/LandingScreen";
import ModelPickerDialog from "./components/ModelPickerDialog";
import SettingsDialog from "./components/SettingsDialog";
import { getCompatibilityReport, shouldShowSearchModel } from "./compatibility";
import { detectDeviceCapabilities } from "./device";
import { enrichModelDescriptor, fetchHubModelDetails, searchHubModels } from "./hf";
import {
  CURATED_CATEGORIES,
  CURATED_MODELS,
  HOME_STARTER_MODELS,
  getCuratedModelsForCategory,
  searchCatalogModels,
} from "./models";
import {
  clearAppSettings,
  clearLightweightAppState,
  loadActiveChatThreadId,
  loadAppSettings,
  loadLastModel,
  loadModelVerdictCache,
  loadPickerTab,
  loadRecentModels,
  loadShowExperimental,
  pushRecentModel,
  saveActiveChatThreadId,
  saveAppSettings,
  saveLastModel,
  savePickerTab,
  saveRecentModels,
  saveShowExperimental,
  upsertModelVerdict,
} from "./storage";
import type {
  AppSettings,
  ChatAttachment,
  ChatMessage,
  ChatPersistenceStatus,
  ChatStore,
  ChatThread,
  DeviceCapabilities,
  GenerationOptions,
  LocalModelVerdictCache,
  ModelDescriptor,
  PickerTab,
  SearchFilters,
  StorageWriteResult,
  ThreadMessage,
  ThreadUiState,
  WorkerRequest,
  WorkerResponse,
} from "./types";
import { DEFAULT_APP_SETTINGS } from "./types";

type Screen = "landing" | "chat";
type AppState = "loading" | "ready";
type ProgressState = {
  modelId: string;
  file: string;
  progress: number | null;
  loaded: number | null;
  total: number | null;
} | null;
type DraftAttachment = {
  file: File;
  name: string;
  mimeType: string;
  size: number;
};
type GenerationRequestState = {
  threadId: string;
  requestId: string;
  modelId: string;
};

const DEFAULT_DEVICE_CAPABILITIES: DeviceCapabilities = {
  hasWebGpu: false,
  supportsFp16: false,
  tier: "desktop",
  browserLabel: "Your browser",
  userAgent: "",
};

const THINK_OPEN_TAG = "<think>";
const THINK_CLOSE_TAG = "</think>";
const THREAD_FLUSH_DEBOUNCE_MS = 800;
const UI_STATE_FLUSH_DEBOUNCE_MS = 250;
const AUTO_SCROLL_BOTTOM_THRESHOLD = 48;
const SCROLL_STATE_DEBOUNCE_MS = 120;

const computeGenerationOptions = (
  settings: AppSettings,
  contextWindowTokens: number,
): GenerationOptions => {
  const maxNewTokens =
    settings.maxTokenMode === "percentage"
      ? Math.max(64, Math.floor((contextWindowTokens * settings.percentageMaxTokens) / 100))
      : settings.staticMaxTokens;

  return {
    maxNewTokens: Math.min(Math.max(maxNewTokens, 64), contextWindowTokens),
    temperature: settings.temperature,
    topP: settings.topP,
  };
};

const parseAssistantResponse = (rawContent: string) => {
  const thinkStart = rawContent.indexOf(THINK_OPEN_TAG);

  if (thinkStart === -1) {
    return {
      content: rawContent,
      reasoning: undefined,
      reasoningState: undefined,
    };
  }

  const thinkContentStart = thinkStart + THINK_OPEN_TAG.length;
  const thinkEnd = rawContent.indexOf(THINK_CLOSE_TAG, thinkContentStart);

  if (thinkEnd === -1) {
    return {
      content: rawContent.slice(0, thinkStart).trim(),
      reasoning: rawContent.slice(thinkContentStart).trim(),
      reasoningState: "streaming" as const,
    };
  }

  const beforeThink = rawContent.slice(0, thinkStart);
  const afterThink = rawContent.slice(thinkEnd + THINK_CLOSE_TAG.length);

  return {
    content: `${beforeThink}${afterThink}`.trim(),
    reasoning: rawContent.slice(thinkContentStart, thinkEnd).trim(),
    reasoningState: "complete" as const,
  };
};

const applyAssistantContent = (message: ThreadMessage, rawContent: string): ThreadMessage => {
  const parsed = parseAssistantResponse(rawContent);

  return {
    ...message,
    rawContent,
    content: parsed.content,
    reasoning: parsed.reasoning,
    reasoningState: parsed.reasoningState,
  };
};

const uniqueModelsById = (models: ModelDescriptor[]) =>
  [...new Map(models.map((model) => [model.id, model])).values()];

const sortThreadsByUpdatedAt = (threads: ChatThread[]) =>
  [...threads].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));

const stripModelCompatibility = (model: ModelDescriptor): ModelDescriptor => {
  const { compatibility: _compatibility, ...rest } = model;
  return rest;
};

const buildThreadTitle = (messages: Array<ChatMessage | ThreadMessage>) => {
  const firstUserText = messages.find(
    (message) => message.role === "user" && message.content.trim().length > 0,
  )?.content;

  if (firstUserText) {
    const normalized = firstUserText.replace(/\s+/g, " ").trim();
    return normalized.length > 42 ? `${normalized.slice(0, 42).trimEnd()}…` : normalized;
  }

  const firstAttachment = messages.find((message) => message.attachment)?.attachment;
  if (firstAttachment) {
    return `Image chat · ${firstAttachment.name}`;
  }

  return "New chat";
};

const buildLastMessagePreview = (messages: ThreadMessage[]) => {
  const lastMessage = [...messages]
    .reverse()
    .find((message) => message.content.trim().length > 0 || message.attachment);

  if (!lastMessage) {
    return null;
  }

  if (lastMessage.content.trim().length > 0) {
    const normalized = lastMessage.content.replace(/\s+/g, " ").trim();
    return normalized.length > 72 ? `${normalized.slice(0, 72).trimEnd()}…` : normalized;
  }

  return lastMessage.attachment ? `Image · ${lastMessage.attachment.name}` : null;
};

const createThreadRecord = (model: ModelDescriptor): ChatThread => {
  const timestamp = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: "New chat",
    model: stripModelCompatibility(model),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastMessagePreview: null,
    messageCount: 0,
    memorySummary: null,
    summaryUpToSequence: 0,
  };
};

const updateThreadFromMessages = (
  thread: ChatThread,
  messages: ThreadMessage[],
  overrides: Partial<ChatThread> = {},
): ChatThread => ({
  ...thread,
  ...overrides,
  title: buildThreadTitle(messages),
  lastMessagePreview: buildLastMessagePreview(messages),
  messageCount: messages.length,
  updatedAt: overrides.updatedAt ?? new Date().toISOString(),
});

const createThreadMessage = (
  threadId: string,
  sequence: number,
  role: ThreadMessage["role"],
  content: string,
  options?: {
    attachment?: ChatAttachment;
    status?: ThreadMessage["status"];
    requestId?: string;
  },
): ThreadMessage => ({
  id: crypto.randomUUID(),
  threadId,
  sequence,
  role,
  content,
  attachment: options?.attachment,
  createdAt: new Date().toISOString(),
  status: options?.status ?? "complete",
  requestId: options?.requestId,
});

const createDefaultThreadUiState = (threadId: string): ThreadUiState => ({
  threadId,
  draftText: "",
  scrollTop: 0,
  updatedAt: new Date().toISOString(),
});

const getDefaultStorageMessage = (status: ChatPersistenceStatus) => {
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

function App() {
  const workerRef = useRef<Worker | null>(null);
  const selectedModelRef = useRef<ModelDescriptor | null>(null);
  const generationRequestRef = useRef<GenerationRequestState | null>(null);
  const chatThreadsRef = useRef<ChatThread[]>([]);
  const threadMessagesRef = useRef<Record<string, ThreadMessage[]>>({});
  const activeThreadIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatLogRef = useRef<HTMLElement | null>(null);
  const chatStoreRef = useRef<ChatStore | null>(null);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const pendingScrollStateRef = useRef<{ threadId: string; scrollTop: number } | null>(null);
  const scrollStateFlushTimerRef = useRef<number | null>(null);
  const threadFlushTimersRef = useRef<Record<string, number>>({});
  const pendingThreadFlushRef = useRef<Record<string, { thread: ChatThread; messages: ThreadMessage[] }>>({});
  const uiStateFlushTimerRef = useRef<number | null>(null);
  const threadOpenNonceRef = useRef(0);

  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState<Screen>("landing");
  const [appState, setAppState] = useState<AppState>("loading");
  const [deviceCapabilities, setDeviceCapabilities] = useState<DeviceCapabilities>(
    DEFAULT_DEVICE_CAPABILITIES,
  );
  const [workerReady, setWorkerReady] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelDescriptor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<PickerTab>(loadPickerTab());
  const [pendingModel, setPendingModel] = useState<ModelDescriptor | null>(null);
  const [loadingModelId, setLoadingModelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ModelDescriptor[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [recentModels, setRecentModels] = useState<ModelDescriptor[]>(loadRecentModels());
  const [localVerdicts, setLocalVerdicts] = useState<LocalModelVerdictCache>(loadModelVerdictCache());
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [threadMessages, setThreadMessages] = useState<Record<string, ThreadMessage[]>>({});
  const [threadUiStates, setThreadUiStates] = useState<Record<string, ThreadUiState>>({});
  const [activeThreadId, setActiveThreadId] = useState<string | null>(loadActiveChatThreadId());
  const [draftAttachment, setDraftAttachment] = useState<DraftAttachment | null>(null);
  const [generationRequest, setGenerationRequest] = useState<GenerationRequestState | null>(null);
  const [stopRequested, setStopRequested] = useState(false);
  const [chatStorageWarning, setChatStorageWarning] = useState<string | null>(null);
  const [chatPersistenceStatus, setChatPersistenceStatus] =
    useState<ChatPersistenceStatus>("ready");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(loadAppSettings());
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    mobileSafe: deviceCapabilities.tier === "mobile",
    verifiedOnly: false,
    showExperimental: loadShowExperimental(),
  });

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const isGenerating = generationRequest !== null;
  const activeThread = useMemo(
    () => chatThreads.find((thread) => thread.id === activeThreadId) ?? null,
    [activeThreadId, chatThreads],
  );
  const activeMessages = activeThreadId ? threadMessages[activeThreadId] ?? [] : [];
  const activeInput = activeThreadId ? threadUiStates[activeThreadId]?.draftText ?? "" : "";

  const handleStorageWriteResults = (...results: StorageWriteResult[]) => {
    const firstFailure = results.find((result) => !result.ok);
    if (!firstFailure) {
      const nextStatus: ChatPersistenceStatus =
        chatStoreRef.current?.kind === "localstorage" ? "fallback_local_storage" : "ready";
      setChatPersistenceStatus(nextStatus);
      setChatStorageWarning(getDefaultStorageMessage(nextStatus));
      return;
    }

    if (firstFailure.reason === "quota") {
      setChatPersistenceStatus("quota_exceeded");
      setChatStorageWarning("Browser storage is full. Delete some chats or downloaded models.");
      return;
    }

    setChatPersistenceStatus("unavailable");
    setChatStorageWarning(
      firstFailure.reason === "blocked"
        ? "Browser storage is blocked in this session."
        : "Unable to save chat changes in this browser session.",
    );
  };

  const flushThreadSnapshot = async (threadId: string) => {
    const store = chatStoreRef.current;
    const pending = pendingThreadFlushRef.current[threadId];
    if (!store || !pending) {
      return;
    }

    delete pendingThreadFlushRef.current[threadId];
    delete threadFlushTimersRef.current[threadId];
    const threadResult = await store.putThread(pending.thread);
    const messagesResult = await store.putMessages(threadId, pending.messages);
    handleStorageWriteResults(threadResult, messagesResult);
  };

  const scheduleThreadSnapshotPersist = (thread: ChatThread, messages: ThreadMessage[]) => {
    pendingThreadFlushRef.current[thread.id] = { thread, messages };

    if (threadFlushTimersRef.current[thread.id]) {
      return;
    }

    threadFlushTimersRef.current[thread.id] = window.setTimeout(() => {
      void flushThreadSnapshot(thread.id);
    }, THREAD_FLUSH_DEBOUNCE_MS);
  };

  const flushActiveUiState = async () => {
    const store = chatStoreRef.current;
    if (!store || !activeThreadId) {
      return;
    }

    const currentUiState = threadUiStates[activeThreadId];
    if (!currentUiState) {
      return;
    }

    const result = await store.putUiState(currentUiState);
    handleStorageWriteResults(result);
  };

  const persistThreadSnapshotNow = async (thread: ChatThread, messages: ThreadMessage[]) => {
    const store = chatStoreRef.current;
    if (!store) {
      return;
    }

    const threadResult = await store.putThread(thread);
    const messagesResult = await store.putMessages(thread.id, messages);
    handleStorageWriteResults(threadResult, messagesResult);
  };

  const persistThreadUiStateNow = async (uiState: ThreadUiState) => {
    const store = chatStoreRef.current;
    if (!store) {
      return;
    }

    const result = await store.putUiState(uiState);
    handleStorageWriteResults(result);
  };

  const upsertThreadInState = (thread: ChatThread) => {
    setChatThreads((current) => {
      const next = sortThreadsByUpdatedAt([thread, ...current.filter((entry) => entry.id !== thread.id)]);
      chatThreadsRef.current = next;
      return next;
    });
  };

  const replaceThreadMessages = (threadId: string, messages: ThreadMessage[]) => {
    setThreadMessages((current) => {
      const next = {
        ...current,
        [threadId]: messages,
      };
      threadMessagesRef.current = next;
      return next;
    });
  };

  const setThreadUiState = (threadId: string, patch: Partial<ThreadUiState>) => {
    setThreadUiStates((current) => {
      const next = {
        ...(current[threadId] ?? createDefaultThreadUiState(threadId)),
        ...patch,
        threadId,
        updatedAt: new Date().toISOString(),
      };

      return {
        ...current,
        [threadId]: next,
      };
    });
  };

  const clearDraftAttachment = () => {
    setDraftAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const flushPendingScrollState = () => {
    const pending = pendingScrollStateRef.current;
    if (!pending) {
      return;
    }

    pendingScrollStateRef.current = null;
    if (scrollStateFlushTimerRef.current) {
      window.clearTimeout(scrollStateFlushTimerRef.current);
      scrollStateFlushTimerRef.current = null;
    }

    setThreadUiState(pending.threadId, { scrollTop: pending.scrollTop });
  };

  const loadThreadSnapshot = async (threadId: string) => {
    const store = chatStoreRef.current;
    if (!store) {
      return null;
    }

    return store.getSnapshot(threadId);
  };

  const openThread = async (threadId: string) => {
    const thread = chatThreads.find((entry) => entry.id === threadId);
    if (!thread) {
      return;
    }

    const openNonce = ++threadOpenNonceRef.current;
    const snapshot = await loadThreadSnapshot(threadId);
    if (!snapshot || openNonce !== threadOpenNonceRef.current) {
      return;
    }

    upsertThreadInState(snapshot.thread);
    replaceThreadMessages(threadId, snapshot.messages);
    setThreadUiStates((current) => ({
      ...current,
      [threadId]: snapshot.uiState ?? createDefaultThreadUiState(threadId),
    }));
    pendingScrollRestoreRef.current = snapshot.uiState?.scrollTop ?? 0;
    shouldStickToBottomRef.current = (snapshot.uiState?.scrollTop ?? 0) <= 0;

    setActiveThreadId(threadId);
    activeThreadIdRef.current = threadId;
    saveActiveChatThreadId(threadId);
    setScreen("chat");
    setPickerOpen(false);
    setPendingModel(null);
    clearDraftAttachment();
    setError(null);

    if (!isGenerating && selectedModel?.id !== snapshot.thread.model.id) {
      setSelectedModel(snapshot.thread.model);
    }
  };

  useEffect(() => {
    detectDeviceCapabilities()
      .then((capabilities) => {
        setDeviceCapabilities(capabilities);
        setSearchFilters((current) => ({
          ...current,
          mobileSafe: current.mobileSafe || capabilities.tier === "mobile",
        }));
      })
      .catch(() => {
        setDeviceCapabilities(DEFAULT_DEVICE_CAPABILITIES);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const { store, status } = await initializeChatStore();
      if (cancelled) {
        return;
      }

      chatStoreRef.current = store;
      setChatPersistenceStatus(status);
      setChatStorageWarning(getDefaultStorageMessage(status));

      const threads = sortThreadsByUpdatedAt(await store.listThreads());
      if (cancelled) {
        return;
      }

      setChatThreads(threads);
      chatThreadsRef.current = threads;

      const savedActiveThreadId = loadActiveChatThreadId();
      const nextActiveThread =
        threads.find((thread) => thread.id === savedActiveThreadId) ?? threads[0] ?? null;

      if (!nextActiveThread) {
        setScreen("landing");
        setSelectedModel(null);
        setBooting(false);
        return;
      }

      const snapshot = await store.getSnapshot(nextActiveThread.id);
      if (cancelled || !snapshot) {
        return;
      }

      setThreadMessages({ [snapshot.thread.id]: snapshot.messages });
      threadMessagesRef.current = { [snapshot.thread.id]: snapshot.messages };
      setThreadUiStates({
        [snapshot.thread.id]: snapshot.uiState ?? createDefaultThreadUiState(snapshot.thread.id),
      });
      pendingScrollRestoreRef.current = snapshot.uiState?.scrollTop ?? 0;
      shouldStickToBottomRef.current = (snapshot.uiState?.scrollTop ?? 0) <= 0;
      setActiveThreadId(snapshot.thread.id);
      activeThreadIdRef.current = snapshot.thread.id;
      saveActiveChatThreadId(snapshot.thread.id);
      setSelectedModel(snapshot.thread.model);
      setScreen("chat");
      setBooting(false);
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!deviceCapabilities.hasWebGpu) {
      return;
    }

    const worker = new Worker(new URL("./model.worker.ts", import.meta.url), { type: "module" });

    const handleWorkerMessage = (event: MessageEvent<WorkerResponse>) => {
      const currentSelectedModel = selectedModelRef.current;
      const currentGeneration = generationRequestRef.current;

      switch (event.data.type) {
        case "LOAD_PROGRESS": {
          if (event.data.payload.modelId !== currentSelectedModel?.id) {
            return;
          }

          setProgress(event.data.payload);
          break;
        }
        case "MODEL_READY": {
          if (event.data.payload.modelId !== currentSelectedModel?.id) {
            return;
          }

          setAppState("ready");
          setLoadedModelId(event.data.payload.modelId);
          setError(null);
          setProgress(null);
          setLoadingModelId(null);
          break;
        }
        case "MODEL_LOAD_RESULT": {
          if (event.data.payload.modelId !== currentSelectedModel?.id) {
            return;
          }

          if (event.data.payload.status === "verified") {
            const storedModel = stripModelCompatibility(currentSelectedModel);
            const nextCache = upsertModelVerdict(currentSelectedModel.id, {
              status: "verified",
              lastLoadedAt: new Date().toISOString(),
            });
            setLocalVerdicts(nextCache);
            setRecentModels(pushRecentModel(storedModel));
            saveLastModel(storedModel);
          } else {
            setLocalVerdicts(
              upsertModelVerdict(currentSelectedModel.id, {
                status: "failed_on_device",
                lastLoadedAt: new Date().toISOString(),
              }),
            );
          }
          break;
        }
        case "STREAM_TOKEN": {
          const payload = event.data.payload;
          if (
            !currentGeneration ||
            currentGeneration.threadId !== payload.threadId ||
            currentGeneration.requestId !== payload.requestId
          ) {
            return;
          }

          setThreadMessages((current) => {
            const existingMessages = current[payload.threadId] ?? [];
            const nextMessages = [...existingMessages];
            const last = nextMessages.at(-1);
            if (!last || last.role !== "assistant" || last.requestId !== payload.requestId) {
              return current;
            }

            const nextRawContent = `${last.rawContent ?? last.content}${payload.text}`;
            nextMessages[nextMessages.length - 1] = applyAssistantContent(last, nextRawContent);
            const nextState = {
              ...current,
              [payload.threadId]: nextMessages,
            };
            threadMessagesRef.current = nextState;

            const thread = chatThreadsRef.current.find((entry) => entry.id === payload.threadId);
            if (thread) {
              scheduleThreadSnapshotPersist(thread, nextMessages);
            }

            return nextState;
          });
          break;
        }
        case "GENERATION_DONE": {
          const payload = event.data.payload;
          if (
            !currentGeneration ||
            currentGeneration.threadId !== payload.threadId ||
            currentGeneration.requestId !== payload.requestId
          ) {
            return;
          }

          const thread = chatThreadsRef.current.find((entry) => entry.id === payload.threadId);
          if (!thread) {
            setGenerationRequest(null);
            return;
          }

          const existingMessages = threadMessagesRef.current[payload.threadId] ?? [];
          const nextMessages = [...existingMessages];
          const last = nextMessages.at(-1);

          if (last?.role === "assistant" && last.requestId === payload.requestId) {
            nextMessages[nextMessages.length - 1] = {
              ...applyAssistantContent(last, payload.text),
              status: "complete",
            };
          }

          const nextThread = updateThreadFromMessages(thread, nextMessages, {
            memorySummary: payload.summary,
            summaryUpToSequence: payload.summaryUpToSequence,
          });

          replaceThreadMessages(payload.threadId, nextMessages);
          upsertThreadInState(nextThread);
          void persistThreadSnapshotNow(nextThread, nextMessages);
          setGenerationRequest(null);
          setStopRequested(false);
          setError(null);
          break;
        }
        case "ERROR": {
          const payload = event.data.payload;
          if (payload.threadId && payload.requestId) {
            if (
              !currentGeneration ||
              currentGeneration.threadId !== payload.threadId ||
              currentGeneration.requestId !== payload.requestId
            ) {
              return;
            }

            const thread = chatThreadsRef.current.find((entry) => entry.id === payload.threadId);
            const existingMessages = threadMessagesRef.current[payload.threadId] ?? [];
            const nextMessages =
              existingMessages.at(-1)?.role === "assistant" &&
              existingMessages.at(-1)?.requestId === payload.requestId &&
              existingMessages.at(-1)?.content.length === 0
                ? existingMessages.slice(0, -1)
                : existingMessages;

            if (thread) {
              const nextThread = updateThreadFromMessages(thread, nextMessages);
              replaceThreadMessages(payload.threadId, nextMessages);
              upsertThreadInState(nextThread);
              void persistThreadSnapshotNow(nextThread, nextMessages);
            }

            setGenerationRequest(null);
            setStopRequested(false);
            if (activeThreadIdRef.current === payload.threadId) {
              setError(payload.message);
            }
            return;
          }

          if (payload.modelId === currentSelectedModel?.id) {
            setLocalVerdicts(
              upsertModelVerdict(currentSelectedModel.id, {
                status: "failed_on_device",
                lastLoadedAt: new Date().toISOString(),
              }),
            );
            setLoadedModelId(null);
            setError(payload.message);
            setAppState("loading");
            setLoadingModelId(null);
          }
          break;
        }
      }
    };

    worker.addEventListener("message", handleWorkerMessage);
    workerRef.current = worker;
    setWorkerReady(true);

    return () => {
      worker.removeEventListener("message", handleWorkerMessage);
      worker.terminate();
      workerRef.current = null;
      setWorkerReady(false);
    };
  }, [deviceCapabilities.hasWebGpu]);

  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  useEffect(() => {
    generationRequestRef.current = generationRequest;
  }, [generationRequest]);

  useEffect(() => {
    chatThreadsRef.current = chatThreads;
  }, [chatThreads]);

  useEffect(() => {
    threadMessagesRef.current = threadMessages;
  }, [threadMessages]);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    if (!workerReady || !selectedModel || isGenerating) {
      return;
    }

    if (loadedModelId === selectedModel.id && appState === "ready") {
      return;
    }

    if (loadingModelId === selectedModel.id) {
      return;
    }

    setAppState("loading");
    setError(null);
    setProgress(null);
    setLoadingModelId(selectedModel.id);

    workerRef.current?.postMessage({
      type: "LOAD_MODEL",
      payload: { model: selectedModel },
    } satisfies WorkerRequest);
  }, [appState, isGenerating, loadedModelId, loadingModelId, selectedModel, workerReady]);

  useEffect(() => {
    if (!activeThread || !workerReady || isGenerating) {
      return;
    }

    if (selectedModel?.id === activeThread.model.id) {
      return;
    }

    setSelectedModel(activeThread.model);
  }, [activeThread, isGenerating, selectedModel, workerReady]);

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }

    const currentUiState = threadUiStates[activeThreadId];
    if (!currentUiState) {
      return;
    }

    if (uiStateFlushTimerRef.current) {
      window.clearTimeout(uiStateFlushTimerRef.current);
    }

    uiStateFlushTimerRef.current = window.setTimeout(() => {
      void flushActiveUiState();
    }, UI_STATE_FLUSH_DEBOUNCE_MS);

    return () => {
      if (uiStateFlushTimerRef.current) {
        window.clearTimeout(uiStateFlushTimerRef.current);
        uiStateFlushTimerRef.current = null;
      }
    };
  }, [activeThreadId, threadUiStates]);

  useEffect(() => {
    const chatLog = chatLogRef.current;
    if (!chatLog) {
      return;
    }

    if (pendingScrollRestoreRef.current !== null) {
      const restoredScrollTop = pendingScrollRestoreRef.current;
      chatLog.scrollTop = restoredScrollTop;
      const distanceFromBottom =
        chatLog.scrollHeight - chatLog.clientHeight - restoredScrollTop;
      shouldStickToBottomRef.current = distanceFromBottom <= AUTO_SCROLL_BOTTOM_THRESHOLD;
      pendingScrollRestoreRef.current = null;
      return;
    }

    if (generationRequest?.threadId === activeThreadId && shouldStickToBottomRef.current) {
      chatLog.scrollTop = chatLog.scrollHeight;
    }
  }, [activeMessages, activeThreadId, generationRequest]);

  useEffect(() => {
    const flushAll = () => {
      flushPendingScrollState();

      Object.keys(threadFlushTimersRef.current).forEach((threadId) => {
        if (threadFlushTimersRef.current[threadId]) {
          window.clearTimeout(threadFlushTimersRef.current[threadId]);
        }
        void flushThreadSnapshot(threadId);
      });

      if (activeThreadId) {
        const currentUiState = threadUiStates[activeThreadId];
        if (currentUiState) {
          void persistThreadUiStateNow(currentUiState);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushAll();
      }
    };

    window.addEventListener("pagehide", flushAll);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", flushAll);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeThreadId, threadUiStates]);

  useEffect(() => {
    return () => {
      if (scrollStateFlushTimerRef.current) {
        window.clearTimeout(scrollStateFlushTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!pickerOpen || pickerTab !== "search" || !deferredSearchQuery.trim()) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const catalogMatches = searchCatalogModels(deferredSearchQuery);

    setSearchLoading(true);
    setSearchError(null);

    searchHubModels(deferredSearchQuery, searchFilters, deviceCapabilities)
      .then((models) => {
        if (cancelled) {
          return;
        }

        const compatibleModels = uniqueModelsById([...catalogMatches, ...models])
          .map((model) => ({
            ...model,
            compatibility: getCompatibilityReport(model, deviceCapabilities, localVerdicts),
          }))
          .filter((model) =>
            shouldShowSearchModel(model, searchFilters, deviceCapabilities, localVerdicts),
          );

        startTransition(() => setSearchResults(compatibleModels));
      })
      .catch((searchIssue) => {
        if (cancelled) {
          return;
        }

        const fallbackMatches = catalogMatches
          .map((model) => ({
            ...model,
            compatibility: getCompatibilityReport(model, deviceCapabilities, localVerdicts),
          }))
          .filter((model) =>
            shouldShowSearchModel(model, searchFilters, deviceCapabilities, localVerdicts),
          );

        if (fallbackMatches.length > 0) {
          startTransition(() => setSearchResults(fallbackMatches));
          setSearchError(null);
          return;
        }

        setSearchError(
          searchIssue instanceof Error
            ? searchIssue.message
            : "Unable to search compatible models right now.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setSearchLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    deferredSearchQuery,
    deviceCapabilities,
    localVerdicts,
    pickerOpen,
    pickerTab,
    searchFilters,
  ]);

  useEffect(() => {
    saveRecentModels(recentModels);
  }, [recentModels]);

  useEffect(() => {
    savePickerTab(pickerTab);
  }, [pickerTab]);

  const decorateModel = (model: ModelDescriptor) => ({
    ...model,
    compatibility: getCompatibilityReport(model, deviceCapabilities, localVerdicts),
  });

  const sortedRecentModels = useMemo(() => {
    return [...recentModels].sort((left, right) => {
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
  }, [localVerdicts, recentModels]);

  const curatedSections = useMemo(
    () =>
      CURATED_CATEGORIES.map((category) => ({
        category,
        models: getCuratedModelsForCategory(category.key).map((model) => ({
          model: decorateModel(model),
          compatibility: getCompatibilityReport(model, deviceCapabilities, localVerdicts),
        })),
      })),
    [deviceCapabilities, localVerdicts],
  );

  const starterModels = useMemo(
    () =>
      HOME_STARTER_MODELS.map((model) => ({
        model: decorateModel(model),
        compatibility: getCompatibilityReport(model, deviceCapabilities, localVerdicts),
      })),
    [deviceCapabilities, localVerdicts],
  );

  const recentModelsWithCompatibility = useMemo(
    () =>
      sortedRecentModels.map((model) => ({
        model: decorateModel(model),
        compatibility: getCompatibilityReport(model, deviceCapabilities, localVerdicts),
      })),
    [deviceCapabilities, localVerdicts, sortedRecentModels],
  );

  const recommendedModel = useMemo(() => {
    const lastModel = loadLastModel();
    if (lastModel) {
      const decoratedLastModel = decorateModel(lastModel);
      if (decoratedLastModel.compatibility?.canLoad) {
        return decoratedLastModel;
      }
    }

    const preferredCategory = deviceCapabilities.tier === "mobile" ? "mobile_safe" : "balanced";
    const fallback = CURATED_MODELS.find(
      (model) => model.category === preferredCategory && model.task === "text",
    );

    return fallback ? decorateModel(fallback) : null;
  }, [deviceCapabilities, localVerdicts]);

  const selectedModelWithCompatibility = useMemo(
    () => (selectedModel ? decorateModel(selectedModel) : null),
    [deviceCapabilities, localVerdicts, selectedModel],
  );

  const activeThreadModelWithCompatibility = useMemo(
    () => (activeThread ? decorateModel(activeThread.model) : null),
    [activeThread, deviceCapabilities, localVerdicts],
  );

  const progressWidth =
    appState === "ready" ? "100%" : `${Math.max(progress?.progress ?? 6, 6)}%`;
  const progressClassName = error
    ? "panel-progress panel-progress-error"
    : appState === "ready"
      ? "panel-progress panel-progress-ready"
      : "panel-progress panel-progress-loading";

  const defaultThreadModel = useMemo(() => {
    if (recommendedModel) {
      return recommendedModel;
    }

    if (activeThreadModelWithCompatibility) {
      return activeThreadModelWithCompatibility;
    }

    const fallback = CURATED_MODELS.find((model) =>
      deviceCapabilities.tier === "mobile"
        ? model.category === "mobile_safe" && model.task === "text"
        : model.category === "balanced" && model.task === "text",
    );

    return fallback ? decorateModel(fallback) : null;
  }, [activeThreadModelWithCompatibility, deviceCapabilities.tier, recommendedModel]);

  const openPicker = (tab: PickerTab) => {
    setPickerTab(tab);
    savePickerTab(tab);
    setPickerOpen(true);
  };

  const closePicker = () => setPickerOpen(false);

  const toggleSearchFilter = (filter: keyof SearchFilters) => {
    setSearchFilters((current) => {
      const next = {
        ...current,
        [filter]: !current[filter],
      };
      saveShowExperimental(next.showExperimental);
      return next;
    });
  };

  const changePickerTab = (tab: PickerTab) => {
    setPickerTab(tab);
    savePickerTab(tab);
  };

  const resolveSelectedModel = async (model: ModelDescriptor) => {
    const baseModel =
      model.source === "search"
        ? enrichModelDescriptor(model, await fetchHubModelDetails(model.id))
        : model;
    const resolvedModel = decorateModel(baseModel);

    if (!resolvedModel.compatibility?.canLoad) {
      throw new Error(resolvedModel.compatibility?.reason ?? "This model is not loadable here.");
    }

    return resolvedModel;
  };

  const createNewThread = async (preferredModel?: ModelDescriptor) => {
    if (isGenerating) {
      return;
    }

    const baseModel = preferredModel ?? defaultThreadModel;
    if (!baseModel || !chatStoreRef.current) {
      return;
    }

    const thread = createThreadRecord(stripModelCompatibility(baseModel));
    const uiState = createDefaultThreadUiState(thread.id);
    shouldStickToBottomRef.current = true;
    upsertThreadInState(thread);
    replaceThreadMessages(thread.id, []);
    setThreadUiStates((current) => ({ ...current, [thread.id]: uiState }));
    setActiveThreadId(thread.id);
    activeThreadIdRef.current = thread.id;
    saveActiveChatThreadId(thread.id);
    setScreen("chat");
    setPendingModel(null);
    clearDraftAttachment();
    setError(null);
    pendingScrollRestoreRef.current = 0;

    const threadResult = await chatStoreRef.current.putThread(thread);
    const uiResult = await chatStoreRef.current.putUiState(uiState);
    handleStorageWriteResults(threadResult, uiResult);

    if (selectedModel?.id !== thread.model.id) {
      setSelectedModel(thread.model);
    }
  };

  const deleteThread = async (threadId: string) => {
    if (isGenerating || !chatStoreRef.current) {
      return;
    }

    const result = await chatStoreRef.current.deleteThread(threadId);
    handleStorageWriteResults(result);

    const remainingThreads = chatThreads.filter((thread) => thread.id !== threadId);
    setChatThreads(remainingThreads);
    chatThreadsRef.current = remainingThreads;
    setThreadMessages((current) => {
      const next = { ...current };
      delete next[threadId];
      threadMessagesRef.current = next;
      return next;
    });
    setThreadUiStates((current) => {
      const next = { ...current };
      delete next[threadId];
      return next;
    });

    if (remainingThreads.length === 0) {
      setActiveThreadId(null);
      activeThreadIdRef.current = null;
      saveActiveChatThreadId(null);
      setSelectedModel(null);
      setGenerationRequest(null);
      clearDraftAttachment();
      setError(null);
      setScreen("landing");
      return;
    }

    if (threadId === activeThreadId) {
      await openThread(remainingThreads[0].id);
    }
  };

  const activateModel = async (model: ModelDescriptor) => {
    setLoadingModelId(model.id);
    setError(null);

    try {
      const resolvedModel = await resolveSelectedModel(model);
      const shouldReuseActiveThread =
        screen === "chat" && activeThread && activeMessages.length === 0 && !isGenerating;
      const nextThread = shouldReuseActiveThread
        ? {
            ...activeThread,
            ...createThreadRecord(stripModelCompatibility(resolvedModel)),
            id: activeThread.id,
            createdAt: activeThread.createdAt,
          }
        : createThreadRecord(stripModelCompatibility(resolvedModel));

      const uiState =
        threadUiStates[nextThread.id] ??
        (shouldReuseActiveThread ? createDefaultThreadUiState(nextThread.id) : createDefaultThreadUiState(nextThread.id));

      shouldStickToBottomRef.current = true;
      upsertThreadInState(nextThread);
      replaceThreadMessages(nextThread.id, []);
      setThreadUiStates((current) => ({ ...current, [nextThread.id]: uiState }));
      setActiveThreadId(nextThread.id);
      activeThreadIdRef.current = nextThread.id;
      saveActiveChatThreadId(nextThread.id);
      setSelectedModel(nextThread.model);
      setScreen("chat");
      setPickerOpen(false);
      setPendingModel(null);
      clearDraftAttachment();
      setError(null);
      pendingScrollRestoreRef.current = 0;

      if (chatStoreRef.current) {
        const threadResult = await chatStoreRef.current.putThread(nextThread);
        const messagesResult = await chatStoreRef.current.putMessages(nextThread.id, []);
        const uiResult = await chatStoreRef.current.putUiState(uiState);
        handleStorageWriteResults(threadResult, messagesResult, uiResult);
      }
    } catch (selectionIssue) {
      setLoadingModelId(null);
      setError(
        selectionIssue instanceof Error
          ? selectionIssue.message
          : "Unable to prepare this model for loading.",
      );
    }
  };

  const requestModelLoad = async (model: ModelDescriptor) => {
    if (isGenerating) {
      return;
    }

    if (
      screen === "chat" &&
      activeThread &&
      activeThread.model.id !== model.id &&
      activeMessages.length > 0
    ) {
      setPendingModel(model);
      return;
    }

    await activateModel(model);
  };

  const handleGetStarted = async () => {
    if (!recommendedModel?.compatibility?.canLoad) {
      return;
    }

    await activateModel(recommendedModel);
  };

  const handleInputChange = (value: string) => {
    if (!activeThreadId) {
      return;
    }

    setThreadUiState(activeThreadId, { draftText: value });
  };

  const handleChatScroll = (scrollTop: number) => {
    if (!activeThreadId) {
      return;
    }

    const chatLog = chatLogRef.current;
    if (chatLog) {
      const distanceFromBottom = chatLog.scrollHeight - chatLog.clientHeight - scrollTop;
      shouldStickToBottomRef.current = distanceFromBottom <= AUTO_SCROLL_BOTTOM_THRESHOLD;
    }

    pendingScrollStateRef.current = { threadId: activeThreadId, scrollTop };
    if (scrollStateFlushTimerRef.current) {
      return;
    }

    scrollStateFlushTimerRef.current = window.setTimeout(() => {
      flushPendingScrollState();
    }, SCROLL_STATE_DEBOUNCE_MS);
  };

  const handleStopGeneration = () => {
    if (!generationRequest) {
      return;
    }

    setStopRequested(true);
    workerRef.current?.postMessage({
      type: "STOP_GENERATION",
      payload: {
        threadId: generationRequest.threadId,
        requestId: generationRequest.requestId,
      },
    } satisfies WorkerRequest);
  };

  const submitMessage = async () => {
    if (!activeThread || !activeThreadModelWithCompatibility || !selectedModelWithCompatibility) {
      return;
    }

    if (selectedModelWithCompatibility.id !== activeThreadModelWithCompatibility.id) {
      return;
    }

    const trimmed = activeInput.trim();
    const canSendImageOnly = activeThreadModelWithCompatibility.task === "vision" && draftAttachment;

    if ((!trimmed && !canSendImageOnly) || appState !== "ready" || isGenerating) {
      return;
    }

    const nextSequence = (activeMessages.at(-1)?.sequence ?? 0) + 1;
    const attachment = draftAttachment
      ? {
          name: draftAttachment.name,
          mimeType: draftAttachment.mimeType,
          size: draftAttachment.size,
        }
      : undefined;
    const requestId = crypto.randomUUID();
    const userMessage = createThreadMessage(
      activeThread.id,
      nextSequence,
      "user",
      trimmed,
      attachment ? { attachment } : undefined,
    );
    const assistantDraft = createThreadMessage(activeThread.id, nextSequence + 1, "assistant", "", {
      status: "streaming",
      requestId,
    });
    const promptMessages = [...activeMessages, userMessage];
    const nextMessages = [...promptMessages, assistantDraft];
    const nextThread = updateThreadFromMessages(activeThread, nextMessages);

    replaceThreadMessages(activeThread.id, nextMessages);
    upsertThreadInState(nextThread);
    setThreadUiState(activeThread.id, { draftText: "" });
    setGenerationRequest({
      threadId: activeThread.id,
      requestId,
      modelId: selectedModelWithCompatibility.id,
    });
    setStopRequested(false);
    setError(null);
    clearDraftAttachment();

    await persistThreadSnapshotNow(nextThread, nextMessages);

    workerRef.current?.postMessage({
      type: "GENERATE",
      payload: {
        threadId: activeThread.id,
        requestId,
        model: selectedModelWithCompatibility,
        summary: activeThread.memorySummary,
        summaryUpToSequence: activeThread.summaryUpToSequence,
        messages: promptMessages,
        image: draftAttachment?.file ?? null,
        options: computeGenerationOptions(
          appSettings,
          activeThreadModelWithCompatibility.runtime.contextWindowTokens,
        ),
      },
    } satisfies WorkerRequest);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitMessage();
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  };

  const handleFileChange = () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      clearDraftAttachment();
      return;
    }

    setDraftAttachment({
      file,
      name: file.name,
      mimeType: file.type,
      size: file.size,
    });
  };

  const removeAttachment = () => {
    clearDraftAttachment();
  };

  const openSettings = () => setSettingsOpen(true);
  const closeSettings = () => setSettingsOpen(false);

  const saveSettings = (next: AppSettings) => {
    setAppSettings(next);
    const result = saveAppSettings(next);
    if (!result.ok) {
      setChatStorageWarning("Settings could not be saved locally in this browser.");
      return;
    }

    setChatStorageWarning(getDefaultStorageMessage(chatPersistenceStatus));
  };

  const clearAllChats = async () => {
    if (!chatStoreRef.current) {
      return;
    }

    const result = await chatStoreRef.current.clearAll();
    handleStorageWriteResults(result);
    setChatThreads([]);
    chatThreadsRef.current = [];
    setThreadMessages({});
    threadMessagesRef.current = {};
    setThreadUiStates({});
    setActiveThreadId(null);
    activeThreadIdRef.current = null;
    saveActiveChatThreadId(null);
    setSelectedModel(null);
    setGenerationRequest(null);
    clearDraftAttachment();
    setError(null);
    setScreen("landing");
  };

  const clearAllData = async () => {
    await clearAllChats();
    setLocalVerdicts({});
    setRecentModels([]);
    setAppSettings(DEFAULT_APP_SETTINGS);
    setPickerTab("curated");
    setSearchFilters({
      mobileSafe: deviceCapabilities.tier === "mobile",
      verifiedOnly: false,
      showExperimental: false,
    });
    clearLightweightAppState();
  };

  if (booting) {
    return (
      <main className="shell">
        <section className="panel app-panel chat-workspace-panel">
          <div className="panel-progress panel-progress-loading" aria-hidden="true">
            <div className="panel-progress-fill" style={{ width: "24%" }} />
          </div>
        </section>
      </main>
    );
  }

  if (screen === "landing" || !activeThreadModelWithCompatibility) {
    return (
      <>
        <LandingScreen
          recommendedModel={recommendedModel}
          starterModels={starterModels}
          loadingModelId={loadingModelId}
          getStartedDisabled={!recommendedModel?.compatibility?.canLoad}
          globalMessage={error ?? chatStorageWarning}
          onGetStarted={handleGetStarted}
          onOpenPicker={openPicker}
          onSelectModel={requestModelLoad}
        />

        <ModelPickerDialog
          open={pickerOpen}
          activeTab={pickerTab}
          curatedSections={curatedSections}
          recentModels={recentModelsWithCompatibility}
          searchQuery={searchQuery}
          searchFilters={searchFilters}
          searchResults={searchResults.map((model) => ({
            model,
            compatibility: model.compatibility!,
          }))}
          searchLoading={searchLoading}
          searchError={searchError}
          loadingModelId={loadingModelId}
          onClose={closePicker}
          onTabChange={changePickerTab}
          onSearchQueryChange={setSearchQuery}
          onToggleFilter={toggleSearchFilter}
          onLoadModel={requestModelLoad}
        />
      </>
    );
  }

  const chatAppState =
    selectedModelWithCompatibility?.id === activeThreadModelWithCompatibility.id
      ? appState
      : "loading";

  return (
    <>
      <ChatScreen
        threads={chatThreads}
        activeThreadId={activeThreadId}
        selectedModel={activeThreadModelWithCompatibility}
        appState={chatAppState}
        messages={activeMessages}
        input={activeInput}
        progress={progress}
        progressWidth={progressWidth}
        progressClassName={progressClassName}
        error={error}
        isGenerating={isGenerating}
        draftAttachment={draftAttachment}
        storageWarning={chatStorageWarning}
        chatLogRef={chatLogRef}
        fileInputRef={fileInputRef}
        onCreateThread={() => {
          void createNewThread();
        }}
        onSelectThread={(threadId) => {
          void openThread(threadId);
        }}
        onDeleteThread={(threadId) => {
          void deleteThread(threadId);
        }}
        onChangeModel={() => openPicker("curated")}
        onOpenSettings={openSettings}
        onInputChange={handleInputChange}
        onSubmit={handleSubmit}
        onComposerKeyDown={handleComposerKeyDown}
        onFileChange={handleFileChange}
        onRemoveAttachment={removeAttachment}
        onChatScroll={handleChatScroll}
        onStopGeneration={handleStopGeneration}
        stopRequested={stopRequested}
      />

      <ModelPickerDialog
        open={pickerOpen}
        activeTab={pickerTab}
        curatedSections={curatedSections}
        recentModels={recentModelsWithCompatibility}
        searchQuery={searchQuery}
        searchFilters={searchFilters}
        searchResults={searchResults.map((model) => ({
          model,
          compatibility: model.compatibility!,
        }))}
        searchLoading={searchLoading}
        searchError={searchError}
        loadingModelId={loadingModelId}
        onClose={closePicker}
        onTabChange={changePickerTab}
        onSearchQueryChange={setSearchQuery}
        onToggleFilter={toggleSearchFilter}
        onLoadModel={requestModelLoad}
      />

      <SettingsDialog
        open={settingsOpen}
        settings={appSettings}
        contextWindowTokens={activeThreadModelWithCompatibility.runtime.contextWindowTokens ?? null}
        storageStatus={chatPersistenceStatus}
        storageWarning={chatStorageWarning}
        onClose={closeSettings}
        onSave={saveSettings}
        onClearChatHistory={() => {
          void clearAllChats();
        }}
        onClearAllData={() => {
          void clearAllData();
        }}
        onClearAllDownloadedModels={() => {
          setChatStorageWarning(getDefaultStorageMessage(chatPersistenceStatus));
        }}
      />

      {pendingModel && (
        <div className="dialog-backdrop" role="presentation">
          <section className="confirm-shell" role="dialog" aria-modal="true" aria-label="Change model">
            <p className="section-label">Change Model</p>
            <h2>Start a new chat with this model?</h2>
            <p className="confirm-copy">
              Switching models starts a new conversation with <strong>{pendingModel.label}</strong>.
            </p>
            <div className="confirm-actions">
              <button className="secondary-button" type="button" onClick={() => setPendingModel(null)}>
                Cancel
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  void activateModel(pendingModel);
                }}
              >
                Start New Chat
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default App;
