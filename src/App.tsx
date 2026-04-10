import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef } from "react";

import {
  applyAssistantContent,
  computeGenerationOptions,
  createDefaultThreadUiState,
  createThreadMessage,
  createThreadRecord,
  sortThreadsByUpdatedAt,
  stripModelCompatibility,
  updateThreadFromMessages,
} from "./app/chat-helpers";
import {
  AUTO_SCROLL_BOTTOM_THRESHOLD,
  DEFAULT_DEVICE_CAPABILITIES,
  SCROLL_STATE_DEBOUNCE_MS,
  THREAD_FLUSH_DEBOUNCE_MS,
  UI_STATE_FLUSH_DEBOUNCE_MS,
} from "./app/constants";
import {
  buildCuratedSections,
  buildRecentModels,
  buildStarterModels,
  decorateModel,
  getFallbackThreadModel,
  getRecommendedModel,
} from "./app/model-helpers";
import { initializeChatStore } from "./chat-store";
import ChatScreen from "./components/ChatScreen";
import LandingScreen from "./components/LandingScreen";
import ModelPickerDialog from "./components/ModelPickerDialog";
import SettingsDialog from "./components/SettingsDialog";
import { detectDeviceCapabilities } from "./device";
import { enrichModelDescriptor, fetchHubModelDetails } from "./hf";
import { useModelSearch } from "./hooks/useModelSearch";
import { useModelWorker } from "./hooks/useModelWorker";
import {
  clearLightweightAppState,
  deriveStorageFeedback,
  getDefaultStorageMessage,
  loadActiveChatThreadId,
  pushRecentModel,
  saveActiveChatThreadId,
  saveAppSettings,
  saveLastModel,
  savePickerTab,
  saveRecentModels,
  saveShowExperimental,
  upsertModelVerdict,
} from "./storage";
import { useAppStore } from "./store/app-store";
import type {
  AppSettings,
  ChatStore,
  ChatThread,
  ModelDescriptor,
  PickerTab,
  ThreadMessage,
  ThreadUiState,
  WorkerResponse,
} from "./types";
import { DEFAULT_APP_SETTINGS } from "./types";

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatLogRef = useRef<HTMLElement | null>(null);
  const chatStoreRef = useRef<ChatStore | null>(null);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const pendingScrollStateRef = useRef<{
    threadId: string;
    scrollTop: number;
  } | null>(null);
  const scrollStateFlushTimerRef = useRef<number | null>(null);
  const threadFlushTimersRef = useRef<Record<string, number>>({});
  const pendingThreadFlushRef = useRef<
    Record<string, { thread: ChatThread; messages: ThreadMessage[] }>
  >({});
  const uiStateFlushTimerRef = useRef<number | null>(null);
  const threadOpenNonceRef = useRef(0);

  const {
    booting,
    appState,
    deviceCapabilities,
    selectedModel,
    error,
    progress,
    pickerOpen,
    pickerTab,
    pendingModel,
    loadingModelId,
    recentModels,
    localVerdicts,
    chatThreads,
    threadMessages,
    threadUiStates,
    activeThreadId,
    draftAttachment,
    generationRequest,
    stopRequested,
    chatStorageWarning,
    chatPersistenceStatus,
    settingsOpen,
    appSettings,
    loadedModelId,
    searchFilters,
    setBooting,
    setAppState,
    setDeviceCapabilities,
    setSelectedModel,
    setError,
    setProgress,
    setPickerOpen,
    setPickerTab,
    setPendingModel,
    setLoadingModelId,
    setRecentModels,
    setLocalVerdicts,
    setChatThreads,
    upsertThread,
    setThreadMessagesMap,
    replaceThreadMessages,
    setThreadUiStates,
    setThreadUiState,
    removeThreadState,
    clearThreadState,
    setActiveThreadId,
    setDraftAttachment,
    setGenerationRequest,
    setStopRequested,
    setChatPersistence,
    setSettingsOpen,
    setAppSettings,
    setLoadedModelId,
    setSearchFilters,
    updateSearchFilters,
    toggleSearchFilter,
  } = useAppStore();

  const {
    searchQuery,
    searchResults,
    searchLoading,
    searchError,
    setSearchQuery,
  } = useModelSearch({
    pickerOpen,
    pickerTab,
    searchFilters,
    deviceCapabilities,
    localVerdicts,
  });

  const isGenerating = generationRequest !== null;
  const activeThread = useMemo(
    () => chatThreads.find((thread) => thread.id === activeThreadId) ?? null,
    [activeThreadId, chatThreads],
  );
  const activeMessages = useMemo(
    () => (activeThreadId ? (threadMessages[activeThreadId] ?? []) : []),
    [activeThreadId, threadMessages],
  );
  const activeInput = activeThreadId
    ? (threadUiStates[activeThreadId]?.draftText ?? "")
    : "";

  const handleStorageWriteResults = (
    ...results: Parameters<typeof deriveStorageFeedback>[0]
  ) => {
    const feedback = deriveStorageFeedback(results, chatStoreRef.current?.kind);
    setChatPersistence(feedback.status, feedback.warning);
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

  const scheduleThreadSnapshotPersist = (
    thread: ChatThread,
    messages: ThreadMessage[],
  ) => {
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

  const persistThreadSnapshotNow = async (
    thread: ChatThread,
    messages: ThreadMessage[],
  ) => {
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
    const thread = useAppStore
      .getState()
      .chatThreads.find((entry) => entry.id === threadId);
    if (!thread) {
      return;
    }

    const openNonce = ++threadOpenNonceRef.current;
    const snapshot = await loadThreadSnapshot(threadId);
    if (!snapshot || openNonce !== threadOpenNonceRef.current) {
      return;
    }

    upsertThread(snapshot.thread);
    replaceThreadMessages(threadId, snapshot.messages);
    setThreadUiStates({
      ...useAppStore.getState().threadUiStates,
      [threadId]: snapshot.uiState ?? createDefaultThreadUiState(threadId),
    });
    pendingScrollRestoreRef.current = snapshot.uiState?.scrollTop ?? 0;
    shouldStickToBottomRef.current = (snapshot.uiState?.scrollTop ?? 0) <= 0;

    setActiveThreadId(threadId);
    saveActiveChatThreadId(threadId);
    setPickerOpen(false);
    setPendingModel(null);
    clearDraftAttachment();
    setError(null);

    const {
      generationRequest: currentGeneration,
      selectedModel: currentModel,
    } = useAppStore.getState();
    if (!currentGeneration && currentModel?.id !== snapshot.thread.model.id) {
      setSelectedModel(snapshot.thread.model);
    }
  };

  const handleWorkerMessage = (event: MessageEvent<WorkerResponse>) => {
    const state = useAppStore.getState();
    const currentSelectedModel = state.selectedModel;
    const currentGeneration = state.generationRequest;

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

        const existingMessages =
          useAppStore.getState().threadMessages[payload.threadId] ?? [];
        const nextMessages = [...existingMessages];
        const last = nextMessages.at(-1);
        if (
          !last ||
          last.role !== "assistant" ||
          last.requestId !== payload.requestId
        ) {
          return;
        }

        const nextRawContent = `${last.rawContent ?? last.content}${payload.text}`;
        nextMessages[nextMessages.length - 1] = applyAssistantContent(
          last,
          nextRawContent,
        );
        replaceThreadMessages(payload.threadId, nextMessages);

        const thread = useAppStore
          .getState()
          .chatThreads.find((entry) => entry.id === payload.threadId);
        if (thread) {
          scheduleThreadSnapshotPersist(thread, nextMessages);
        }
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

        const thread = useAppStore
          .getState()
          .chatThreads.find((entry) => entry.id === payload.threadId);
        if (!thread) {
          setGenerationRequest(null);
          return;
        }

        const existingMessages =
          useAppStore.getState().threadMessages[payload.threadId] ?? [];
        const nextMessages = [...existingMessages];
        const last = nextMessages.at(-1);

        if (
          last?.role === "assistant" &&
          last.requestId === payload.requestId
        ) {
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
        upsertThread(nextThread);
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

          const thread = useAppStore
            .getState()
            .chatThreads.find((entry) => entry.id === payload.threadId);
          const existingMessages =
            useAppStore.getState().threadMessages[payload.threadId] ?? [];
          const nextMessages =
            existingMessages.at(-1)?.role === "assistant" &&
            existingMessages.at(-1)?.requestId === payload.requestId &&
            existingMessages.at(-1)?.content.length === 0
              ? existingMessages.slice(0, -1)
              : existingMessages;

          if (thread) {
            const nextThread = updateThreadFromMessages(thread, nextMessages);
            replaceThreadMessages(payload.threadId, nextMessages);
            upsertThread(nextThread);
            void persistThreadSnapshotNow(nextThread, nextMessages);
          }

          setGenerationRequest(null);
          setStopRequested(false);
          if (useAppStore.getState().activeThreadId === payload.threadId) {
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

  const { workerReady, postWorkerMessage } = useModelWorker({
    enabled: deviceCapabilities.hasWebGpu,
    onMessage: handleWorkerMessage,
  });

  useEffect(() => {
    detectDeviceCapabilities()
      .then((capabilities) => {
        setDeviceCapabilities(capabilities);
        updateSearchFilters((current) => ({
          ...current,
          mobileSafe: current.mobileSafe || capabilities.tier === "mobile",
        }));
      })
      .catch(() => {
        setDeviceCapabilities(DEFAULT_DEVICE_CAPABILITIES);
      });
  }, [setDeviceCapabilities, updateSearchFilters]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const { store, status } = await initializeChatStore();
      if (cancelled) {
        return;
      }

      chatStoreRef.current = store;
      setChatPersistence(status, getDefaultStorageMessage(status));

      const threads = sortThreadsByUpdatedAt(await store.listThreads());
      if (cancelled) {
        return;
      }

      setChatThreads(threads);

      const savedActiveThreadId = loadActiveChatThreadId();
      const nextActiveThread =
        threads.find((thread) => thread.id === savedActiveThreadId) ??
        threads[0] ??
        null;

      if (!nextActiveThread) {
        setSelectedModel(null);
        setBooting(false);
        return;
      }

      const snapshot = await store.getSnapshot(nextActiveThread.id);
      if (cancelled || !snapshot) {
        return;
      }

      setThreadMessagesMap({ [snapshot.thread.id]: snapshot.messages });
      setThreadUiStates({
        [snapshot.thread.id]:
          snapshot.uiState ?? createDefaultThreadUiState(snapshot.thread.id),
      });
      pendingScrollRestoreRef.current = snapshot.uiState?.scrollTop ?? 0;
      shouldStickToBottomRef.current = (snapshot.uiState?.scrollTop ?? 0) <= 0;
      setActiveThreadId(snapshot.thread.id);
      saveActiveChatThreadId(snapshot.thread.id);
      setSelectedModel(snapshot.thread.model);
      setBooting(false);
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [
    setActiveThreadId,
    setBooting,
    setChatPersistence,
    setChatThreads,
    setSelectedModel,
    setThreadMessagesMap,
    setThreadUiStates,
  ]);

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

    postWorkerMessage({
      type: "LOAD_MODEL",
      payload: { model: selectedModel },
    });
  }, [
    appState,
    isGenerating,
    loadedModelId,
    loadingModelId,
    postWorkerMessage,
    selectedModel,
    setAppState,
    setError,
    setLoadingModelId,
    setProgress,
    workerReady,
  ]);

  useEffect(() => {
    if (!activeThread || !workerReady || isGenerating) {
      return;
    }

    if (selectedModel?.id === activeThread.model.id) {
      return;
    }

    setSelectedModel(activeThread.model);
  }, [
    activeThread,
    isGenerating,
    selectedModel,
    setSelectedModel,
    workerReady,
  ]);

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
    // `flushActiveUiState` closes over refs and the latest active state intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      shouldStickToBottomRef.current =
        distanceFromBottom <= AUTO_SCROLL_BOTTOM_THRESHOLD;
      pendingScrollRestoreRef.current = null;
      return;
    }

    if (
      generationRequest?.threadId === activeThreadId &&
      shouldStickToBottomRef.current
    ) {
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
    // `flushAll` intentionally uses ref-backed helpers to persist the latest buffered state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId, threadUiStates]);

  useEffect(() => {
    return () => {
      if (scrollStateFlushTimerRef.current) {
        window.clearTimeout(scrollStateFlushTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    saveRecentModels(recentModels);
  }, [recentModels]);

  useEffect(() => {
    savePickerTab(pickerTab);
  }, [pickerTab]);

  useEffect(() => {
    saveShowExperimental(searchFilters.showExperimental);
  }, [searchFilters.showExperimental]);

  const curatedSections = useMemo(
    () => buildCuratedSections(deviceCapabilities, localVerdicts),
    [deviceCapabilities, localVerdicts],
  );

  const starterModels = useMemo(
    () => buildStarterModels(deviceCapabilities, localVerdicts),
    [deviceCapabilities, localVerdicts],
  );

  const recentModelsWithCompatibility = useMemo(
    () => buildRecentModels(recentModels, deviceCapabilities, localVerdicts),
    [deviceCapabilities, localVerdicts, recentModels],
  );

  const recommendedModel = useMemo(
    () => getRecommendedModel(deviceCapabilities, localVerdicts),
    [deviceCapabilities, localVerdicts],
  );

  const selectedModelWithCompatibility = useMemo(
    () =>
      selectedModel
        ? decorateModel(selectedModel, deviceCapabilities, localVerdicts)
        : null,
    [deviceCapabilities, localVerdicts, selectedModel],
  );

  const activeThreadModelWithCompatibility = useMemo(
    () =>
      activeThread
        ? decorateModel(activeThread.model, deviceCapabilities, localVerdicts)
        : null,
    [activeThread, deviceCapabilities, localVerdicts],
  );

  const progressWidth =
    appState === "ready" ? "100%" : `${Math.max(progress?.progress ?? 6, 6)}%`;
  const progressClassName = error
    ? "panel-progress panel-progress-error"
    : appState === "ready"
      ? "panel-progress panel-progress-ready"
      : "panel-progress panel-progress-loading";

  const defaultThreadModel = useMemo(
    () =>
      recommendedModel ??
      activeThreadModelWithCompatibility ??
      getFallbackThreadModel(deviceCapabilities, localVerdicts),
    [
      activeThreadModelWithCompatibility,
      deviceCapabilities,
      localVerdicts,
      recommendedModel,
    ],
  );

  const pickerSearchResults = useMemo(
    () =>
      searchResults.map((model) => ({
        model,
        compatibility: model.compatibility!,
      })),
    [searchResults],
  );

  const openPicker = (tab: PickerTab) => {
    setPickerTab(tab);
    setPickerOpen(true);
  };

  const resolveSelectedModel = async (model: ModelDescriptor) => {
    const baseModel =
      model.source === "search"
        ? enrichModelDescriptor(model, await fetchHubModelDetails(model.id))
        : model;
    const resolvedModel = decorateModel(
      baseModel,
      deviceCapabilities,
      localVerdicts,
    );

    if (!resolvedModel.compatibility?.canLoad) {
      throw new Error(
        resolvedModel.compatibility?.reason ??
          "This model is not loadable here.",
      );
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
    upsertThread(thread);
    replaceThreadMessages(thread.id, []);
    setThreadUiStates({
      ...useAppStore.getState().threadUiStates,
      [thread.id]: uiState,
    });
    setActiveThreadId(thread.id);
    saveActiveChatThreadId(thread.id);
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

    const remainingThreads = useAppStore
      .getState()
      .chatThreads.filter((thread) => thread.id !== threadId);
    setChatThreads(remainingThreads);
    removeThreadState(threadId);

    if (remainingThreads.length === 0) {
      setActiveThreadId(null);
      saveActiveChatThreadId(null);
      setSelectedModel(null);
      setGenerationRequest(null);
      clearDraftAttachment();
      setError(null);
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
      const shouldReuseActiveThread = Boolean(
        activeThread && activeMessages.length === 0 && !isGenerating,
      );
      const nextThread = shouldReuseActiveThread
        ? {
            ...activeThread!,
            ...createThreadRecord(stripModelCompatibility(resolvedModel)),
            id: activeThread!.id,
            createdAt: activeThread!.createdAt,
          }
        : createThreadRecord(stripModelCompatibility(resolvedModel));
      const uiState =
        threadUiStates[nextThread.id] ??
        createDefaultThreadUiState(nextThread.id);

      shouldStickToBottomRef.current = true;
      upsertThread(nextThread);
      replaceThreadMessages(nextThread.id, []);
      setThreadUiStates({
        ...useAppStore.getState().threadUiStates,
        [nextThread.id]: uiState,
      });
      setActiveThreadId(nextThread.id);
      saveActiveChatThreadId(nextThread.id);
      setSelectedModel(nextThread.model);
      setPickerOpen(false);
      setPendingModel(null);
      clearDraftAttachment();
      setError(null);
      pendingScrollRestoreRef.current = 0;

      if (chatStoreRef.current) {
        const threadResult = await chatStoreRef.current.putThread(nextThread);
        const messagesResult = await chatStoreRef.current.putMessages(
          nextThread.id,
          [],
        );
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
      const distanceFromBottom =
        chatLog.scrollHeight - chatLog.clientHeight - scrollTop;
      shouldStickToBottomRef.current =
        distanceFromBottom <= AUTO_SCROLL_BOTTOM_THRESHOLD;
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
    postWorkerMessage({
      type: "STOP_GENERATION",
      payload: {
        threadId: generationRequest.threadId,
        requestId: generationRequest.requestId,
      },
    });
  };

  const submitMessage = async () => {
    if (
      !activeThread ||
      !activeThreadModelWithCompatibility ||
      !selectedModelWithCompatibility
    ) {
      return;
    }

    if (
      selectedModelWithCompatibility.id !==
      activeThreadModelWithCompatibility.id
    ) {
      return;
    }

    const trimmed = activeInput.trim();
    const canSendImageOnly =
      activeThreadModelWithCompatibility.task === "vision" && draftAttachment;

    if (
      (!trimmed && !canSendImageOnly) ||
      appState !== "ready" ||
      isGenerating
    ) {
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
    const assistantDraft = createThreadMessage(
      activeThread.id,
      nextSequence + 1,
      "assistant",
      "",
      {
        status: "streaming",
        requestId,
      },
    );
    const promptMessages = [...activeMessages, userMessage];
    const nextMessages = [...promptMessages, assistantDraft];
    const nextThread = updateThreadFromMessages(activeThread, nextMessages);

    replaceThreadMessages(activeThread.id, nextMessages);
    upsertThread(nextThread);
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

    postWorkerMessage({
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
    });
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

  const saveSettings = (next: AppSettings) => {
    setAppSettings(next);
    const result = saveAppSettings(next);
    if (!result.ok) {
      setChatPersistence(
        chatPersistenceStatus,
        "Settings could not be saved locally in this browser.",
      );
      return;
    }

    setChatPersistence(
      chatPersistenceStatus,
      getDefaultStorageMessage(chatPersistenceStatus),
    );
  };

  const clearAllChats = async () => {
    if (!chatStoreRef.current) {
      return;
    }

    const result = await chatStoreRef.current.clearAll();
    handleStorageWriteResults(result);
    clearThreadState();
    setActiveThreadId(null);
    saveActiveChatThreadId(null);
    setSelectedModel(null);
    setGenerationRequest(null);
    clearDraftAttachment();
    setError(null);
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
          <div
            className="panel-progress panel-progress-loading"
            aria-hidden="true"
          >
            <div className="panel-progress-fill" style={{ width: "24%" }} />
          </div>
        </section>
      </main>
    );
  }

  const chatAppState =
    selectedModelWithCompatibility?.id ===
    activeThreadModelWithCompatibility?.id
      ? appState
      : "loading";

  return (
    <>
      {activeThreadModelWithCompatibility ? (
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
          onOpenSettings={() => setSettingsOpen(true)}
          onInputChange={handleInputChange}
          onSubmit={handleSubmit}
          onComposerKeyDown={handleComposerKeyDown}
          onFileChange={handleFileChange}
          onRemoveAttachment={clearDraftAttachment}
          onChatScroll={handleChatScroll}
          onStopGeneration={handleStopGeneration}
          stopRequested={stopRequested}
        />
      ) : (
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
      )}

      <ModelPickerDialog
        open={pickerOpen}
        activeTab={pickerTab}
        curatedSections={curatedSections}
        recentModels={recentModelsWithCompatibility}
        searchQuery={searchQuery}
        searchFilters={searchFilters}
        searchResults={pickerSearchResults}
        searchLoading={searchLoading}
        searchError={searchError}
        loadingModelId={loadingModelId}
        onClose={() => setPickerOpen(false)}
        onTabChange={setPickerTab}
        onSearchQueryChange={setSearchQuery}
        onToggleFilter={toggleSearchFilter}
        onLoadModel={requestModelLoad}
      />

      <SettingsDialog
        open={settingsOpen}
        settings={appSettings}
        contextWindowTokens={
          activeThreadModelWithCompatibility?.runtime.contextWindowTokens ??
          null
        }
        storageStatus={chatPersistenceStatus}
        storageWarning={chatStorageWarning}
        onClose={() => setSettingsOpen(false)}
        onSave={saveSettings}
        onClearChatHistory={() => {
          void clearAllChats();
        }}
        onClearAllData={() => {
          void clearAllData();
        }}
        onClearAllDownloadedModels={() => {
          setChatPersistence(
            chatPersistenceStatus,
            getDefaultStorageMessage(chatPersistenceStatus),
          );
        }}
      />

      {pendingModel && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="confirm-shell"
            role="dialog"
            aria-modal="true"
            aria-label="Change model"
          >
            <p className="section-label">Change Model</p>
            <h2>Start a new chat with this model?</h2>
            <p className="confirm-copy">
              Switching models starts a new conversation with{" "}
              <strong>{pendingModel.label}</strong>.
            </p>
            <div className="confirm-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setPendingModel(null)}
              >
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
