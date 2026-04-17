import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  buildAudioSections,
  buildCuratedSections,
  buildRecentAudioModels,
  buildRecentModels,
  buildStarterModels,
  decorateModel,
  getFallbackAudioModel,
  getFallbackThreadModel,
  getRecommendedModel,
} from "./app/model-helpers";
import {
  createIdleWaveform,
  createWavBlob,
  decodeAudioBlob,
  downloadBlob,
  measureWaveformLevels,
} from "./audio";
import { initializeChatStore } from "./chat-store";
import AppLayout from "./components/AppLayout";
import AudioScreen from "./components/AudioScreen";
import ChatScreen from "./components/ChatScreen";
import DataPage from "./components/DataPage";
import LandingScreen from "./components/LandingScreen";
import ModelPickerDialog from "./components/ModelPickerDialog";
import SettingsPage from "./components/SettingsPage";
import { detectDeviceCapabilities } from "./device";
import { enrichModelDescriptor, fetchHubModelDetails } from "./hf";
import { useModelSearch } from "./hooks/useModelSearch";
import { useModelWorker } from "./hooks/useModelWorker";
import { getCanonicalCuratedModel } from "./models";
import {
  clearLightweightAppState,
  deriveStorageFeedback,
  getDefaultStorageMessage,
  loadActiveChatThreadId,
  loadLastAudioView,
  loadLastAudioTab,
  loadLastSttModel,
  loadLastTtsModel,
  pushRecentModel,
  saveActiveChatThreadId,
  saveAppSettings,
  saveLastAudioView,
  saveLastAudioTab,
  saveLastModel,
  saveLastSttModel,
  saveLastTtsModel,
  savePickerTab,
  saveRecentModels,
  saveShowExperimental,
  upsertModelVerdict,
} from "./storage";
import { useAppStore } from "./store/app-store";
import type {
  AppSettings,
  AudioTab,
  AudioView,
  AudioTranscriptionChunk,
  ChatStore,
  ChatThread,
  ModelDescriptor,
  PickerTab,
  ThreadMessage,
  ThreadUiState,
  WorkerResponse,
  WorkspaceMode,
} from "./types";
import { DEFAULT_APP_SETTINGS } from "./types";

const RECORDING_WAVE_BAR_COUNT = 20;
const GITHUB_URL = "https://github.com/Jefreesujit/browser-llm";
const MOBILE_LAYOUT_QUERY = "(max-width: 720px)";

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioUploadRef = useRef<HTMLInputElement | null>(null);
  const chatLogRef = useRef<HTMLElement | null>(null);
  const chatStoreRef = useRef<ChatStore | null>(null);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingAnimationFrameRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const audioRequestIdRef = useRef<string | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
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
  const [workspace, setWorkspace] = useState<WorkspaceMode>("chat");
  const [audioView, setAudioView] = useState<AudioView>(() =>
    loadLastAudioView(),
  );
  const [dataOpen, setDataOpen] = useState(false);
  const [audioTab, setAudioTab] = useState<AudioTab>(loadLastAudioTab());
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(MOBILE_LAYOUT_QUERY).matches
      : false,
  );
  const [selectedSttModel, setSelectedSttModel] = useState<ModelDescriptor>(
    () => loadLastSttModel() ?? getFallbackAudioModel("transcribe")!,
  );
  const [selectedTtsModel, setSelectedTtsModel] = useState<ModelDescriptor>(
    () => loadLastTtsModel() ?? getFallbackAudioModel("speak")!,
  );
  const [audioTaskBusy, setAudioTaskBusy] = useState(false);
  const [audioTaskStatus, setAudioTaskStatus] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [recordingLevels, setRecordingLevels] = useState<number[]>(() =>
    createIdleWaveform(RECORDING_WAVE_BAR_COUNT),
  );
  const [audioInputLabel, setAudioInputLabel] = useState<string | null>(null);
  const [transcriptText, setTranscriptText] = useState("");
  const [transcriptChunks, setTranscriptChunks] = useState<
    AudioTranscriptionChunk[]
  >([]);
  const [timestampsEnabled, setTimestampsEnabled] = useState(false);
  const [speakText, setSpeakText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState(
    (loadLastTtsModel() ?? getFallbackAudioModel("speak")!)?.runtime
      .defaultVoice ?? "default",
  );
  const [speakSpeed, setSpeakSpeed] = useState(1);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(
    null,
  );
  const [generatedAudioDurationSec, setGeneratedAudioDurationSec] = useState<
    number | null
  >(null);

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

  const stopRecordingVisualization = () => {
    if (recordingAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(recordingAnimationFrameRef.current);
      recordingAnimationFrameRef.current = null;
    }

    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    recordingStartedAtRef.current = null;
    setRecordingDurationMs(0);
    setRecordingLevels(createIdleWaveform(RECORDING_WAVE_BAR_COUNT));

    const audioContext = recordingAudioContextRef.current;
    recordingAudioContextRef.current = null;
    void audioContext?.close().catch(() => {});
  };

  const startRecordingVisualization = async (stream: MediaStream) => {
    const audioContext = new AudioContext();
    recordingAudioContextRef.current = audioContext;

    try {
      await audioContext.resume();
    } catch {
      // Some browsers already start in a running state.
    }

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);

    const timeDomainData = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(timeDomainData);
      const nextLevels = measureWaveformLevels(
        timeDomainData,
        RECORDING_WAVE_BAR_COUNT,
      );

      setRecordingLevels((current) =>
        nextLevels.map((level, index) => {
          const previous = current[index] ?? level;
          return previous * 0.42 + level * 0.58;
        }),
      );
      recordingAnimationFrameRef.current = window.requestAnimationFrame(tick);
    };

    recordingStartedAtRef.current = performance.now();
    setRecordingDurationMs(0);
    tick();

    recordingTimerRef.current = window.setInterval(() => {
      if (recordingStartedAtRef.current === null) {
        return;
      }

      setRecordingDurationMs(
        Math.max(0, performance.now() - recordingStartedAtRef.current),
      );
    }, 100);
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
          if (
            currentSelectedModel.task === "text" ||
            currentSelectedModel.task === "vision"
          ) {
            saveLastModel(storedModel);
          } else if (currentSelectedModel.task === "stt") {
            saveLastSttModel(storedModel);
          } else if (currentSelectedModel.task === "tts") {
            saveLastTtsModel(storedModel);
          }
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
      case "TASK_STATUS": {
        if (
          event.data.payload.requestId !== audioRequestIdRef.current ||
          event.data.payload.modelId !== currentSelectedModel?.id
        ) {
          return;
        }

        setAudioTaskStatus(event.data.payload.status);
        break;
      }
      case "TRANSCRIPTION_DONE": {
        if (
          event.data.payload.requestId !== audioRequestIdRef.current ||
          event.data.payload.modelId !== currentSelectedModel?.id
        ) {
          return;
        }

        setTranscriptText(event.data.payload.text);
        setTranscriptChunks(event.data.payload.chunks ?? []);
        setAudioTaskBusy(false);
        setAudioTaskStatus(null);
        audioRequestIdRef.current = null;
        break;
      }
      case "SPEECH_DONE": {
        if (
          event.data.payload.requestId !== audioRequestIdRef.current ||
          event.data.payload.modelId !== currentSelectedModel?.id
        ) {
          return;
        }

        if (generatedAudioUrl) {
          URL.revokeObjectURL(generatedAudioUrl);
        }

        const audioBlob = createWavBlob(
          new Float32Array(event.data.payload.audioBuffer),
          event.data.payload.sampleRate,
        );

        setGeneratedAudioUrl(URL.createObjectURL(audioBlob));
        setGeneratedAudioDurationSec(event.data.payload.durationSec);
        setAudioTaskBusy(false);
        setAudioTaskStatus(null);
        audioRequestIdRef.current = null;
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
        if (payload.requestId && !payload.threadId) {
          if (payload.requestId !== audioRequestIdRef.current) {
            return;
          }

          setAudioTaskBusy(false);
          setAudioTaskStatus(null);
          audioRequestIdRef.current = null;
          setError(payload.message);
          return;
        }

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
          if (
            currentSelectedModel.task === "stt" ||
            currentSelectedModel.task === "tts"
          ) {
            setAudioTaskBusy(false);
            setAudioTaskStatus(null);
          }
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
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobileLayout(event.matches);
    };

    handleChange(mediaQuery);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);

      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    }

    mediaQuery.addListener(handleChange);

    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, []);

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
    if (workspace !== "audio" || audioView === "overview") {
      return;
    }

    const nextModel =
      audioTab === "transcribe" ? selectedSttModel : selectedTtsModel;
    if (selectedModel?.id === nextModel.id) {
      return;
    }

    setSelectedModel(nextModel);
  }, [
    audioTab,
    audioView,
    selectedModel,
    selectedSttModel,
    selectedTtsModel,
    setSelectedModel,
    workspace,
  ]);

  useEffect(() => {
    saveLastAudioTab(audioTab);
  }, [audioTab]);

  useEffect(() => {
    saveLastAudioView(audioView);
  }, [audioView]);

  useEffect(() => {
    const voices = selectedTtsModel.runtime.voices ?? [];
    const fallbackVoice =
      selectedTtsModel.runtime.defaultVoice ?? voices[0]?.id ?? "default";

    if (!voices.some((voice) => voice.id === selectedVoice)) {
      setSelectedVoice(fallbackVoice);
    }
  }, [selectedTtsModel, selectedVoice]);

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
    if (workspace !== "chat" || !activeThread || !workerReady || isGenerating) {
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
    workspace,
    workerReady,
  ]);

  useEffect(() => {
    if (workspace !== "chat" || activeThread || isGenerating) {
      return;
    }

    if (selectedModel === null) {
      return;
    }

    setSelectedModel(null);
  }, [activeThread, isGenerating, selectedModel, setSelectedModel, workspace]);

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
    return () => {
      if (recordingAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(recordingAnimationFrameRef.current);
      }
      if (recordingTimerRef.current !== null) {
        window.clearInterval(recordingTimerRef.current);
      }
      void recordingAudioContextRef.current?.close().catch(() => {});
      mediaRecorderRef.current?.stream
        ?.getTracks()
        .forEach((track) => track.stop());
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (generatedAudioUrl) {
        URL.revokeObjectURL(generatedAudioUrl);
      }
    };
  }, [generatedAudioUrl]);

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

  const audioCuratedSections = useMemo(
    () => buildAudioSections(audioTab, deviceCapabilities, localVerdicts),
    [audioTab, deviceCapabilities, localVerdicts],
  );

  const audioLandingStarterModels = useMemo(
    () => ({
      transcribe: buildAudioSections(
        "transcribe",
        deviceCapabilities,
        localVerdicts,
      )
        .flatMap((section) => section.models)
        .slice(0, 3),
      speak: buildAudioSections("speak", deviceCapabilities, localVerdicts)
        .flatMap((section) => section.models)
        .slice(0, 3),
    }),
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

  const recentAudioModelsWithCompatibility = useMemo(
    () =>
      buildRecentAudioModels(
        audioTab,
        recentModels,
        deviceCapabilities,
        localVerdicts,
      ),
    [audioTab, deviceCapabilities, localVerdicts, recentModels],
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

  const selectedSttModelWithCompatibility = useMemo(
    () => decorateModel(selectedSttModel, deviceCapabilities, localVerdicts),
    [deviceCapabilities, localVerdicts, selectedSttModel],
  );

  const selectedTtsModelWithCompatibility = useMemo(
    () => decorateModel(selectedTtsModel, deviceCapabilities, localVerdicts),
    [deviceCapabilities, localVerdicts, selectedTtsModel],
  );

  const activeAudioModelWithCompatibility =
    audioTab === "transcribe"
      ? selectedSttModelWithCompatibility
      : selectedTtsModelWithCompatibility;

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

  const pickerMode: WorkspaceMode = workspace;
  const pickerCuratedSections =
    pickerMode === "audio" ? audioCuratedSections : curatedSections;
  const pickerRecentModels =
    pickerMode === "audio"
      ? recentAudioModelsWithCompatibility
      : recentModelsWithCompatibility;
  const pickerAvailableTabs =
    pickerMode === "audio"
      ? (["curated", "recent"] satisfies PickerTab[])
      : (["curated", "search", "recent"] satisfies PickerTab[]);

  const openPicker = (tab: PickerTab) => {
    setPickerTab(tab);
    setPickerOpen(true);
  };

  const openSettings = () => {
    setDataOpen(false);
    setPickerOpen(false);
    setPendingModel(null);
    setSettingsOpen(true);
  };

  const openData = () => {
    setSettingsOpen(false);
    setPickerOpen(false);
    setPendingModel(null);
    setDataOpen(true);
  };

  const switchToAudioWorkspace = (nextView: AudioView = audioView) => {
    if (isGenerating || audioTaskBusy || isRecording) {
      return;
    }

    setWorkspace("audio");
    setSettingsOpen(false);
    setDataOpen(false);
    setAudioView(nextView);
    if (nextView !== "overview") {
      setAudioTab(nextView);
    }
    setPickerOpen(false);
    setPendingModel(null);
    setError(null);
  };

  const switchToChatWorkspace = () => {
    if (audioTaskBusy || isRecording) {
      return;
    }

    setWorkspace("chat");
    setSettingsOpen(false);
    setDataOpen(false);
    setPickerOpen(false);
    setPendingModel(null);
    setError(null);

    if (
      activeThreadModelWithCompatibility &&
      selectedModel?.id !== activeThreadModelWithCompatibility.id
    ) {
      setSelectedModel(activeThreadModelWithCompatibility);
    } else if (!activeThreadModelWithCompatibility) {
      setSelectedModel(null);
    }
  };

  const resolveSelectedModel = async (model: ModelDescriptor) => {
    const canonicalModel = getCanonicalCuratedModel(model.id);
    const seedModel = canonicalModel
      ? { ...canonicalModel, source: model.source }
      : model;
    const baseModel =
      model.source === "search" && !canonicalModel
        ? enrichModelDescriptor(model, await fetchHubModelDetails(model.id))
        : seedModel;
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

  const requestAudioModelLoad = async (
    model: ModelDescriptor,
    task: AudioTab = audioTab,
  ) => {
    if (audioTaskBusy || isRecording) {
      return;
    }

    setLoadingModelId(model.id);
    setError(null);
    setAudioTab(task);

    try {
      const resolvedModel = await resolveSelectedModel(model);
      const storedModel = stripModelCompatibility(resolvedModel);

      if (task === "transcribe") {
        setSelectedSttModel(storedModel);
      } else {
        setSelectedTtsModel(storedModel);
        setSelectedVoice(
          storedModel.runtime.defaultVoice ??
            storedModel.runtime.voices?.[0]?.id ??
            "default",
        );
      }

      setSelectedModel(storedModel);
      setPickerOpen(false);
      setLoadingModelId(null);
    } catch (selectionIssue) {
      setLoadingModelId(null);
      setError(
        selectionIssue instanceof Error
          ? selectionIssue.message
          : "Unable to prepare this model for loading.",
      );
    }
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
    setWorkspace("chat");

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

  const copyPlainText = async (value: string) => {
    if (!value.trim()) {
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  };

  const createTranscriptFilename = () => {
    const baseName = (audioInputLabel ?? "transcript")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return `${baseName || "transcript"}.txt`;
  };

  const createSpeechFilename = () => {
    const stem = speakText
      .trim()
      .slice(0, 32)
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();

    return `${stem || "speech"}.wav`;
  };

  const transcribeAudioBlob = async (blob: Blob, label: string) => {
    if (
      !selectedSttModelWithCompatibility.compatibility?.canLoad ||
      audioTaskBusy
    ) {
      return;
    }

    setError(null);
    setAudioTaskBusy(true);
    setAudioTaskStatus("Decoding audio");
    setAudioInputLabel(label);
    setTranscriptText("");
    setTranscriptChunks([]);

    try {
      const targetSampleRate =
        selectedSttModelWithCompatibility.runtime.audioSampleRate ?? 16000;
      const { samples, durationSec } = await decodeAudioBlob(
        blob,
        targetSampleRate,
      );
      const requestId = crypto.randomUUID();

      audioRequestIdRef.current = requestId;
      setAudioTaskStatus("Sending audio to the transcription model");
      postWorkerMessage(
        {
          type: "TRANSCRIBE_AUDIO",
          payload: {
            requestId,
            model: selectedSttModelWithCompatibility,
            audio: samples,
            returnTimestamps: timestampsEnabled,
            fileName: label,
            durationSec,
          },
        },
        [samples.buffer],
      );
    } catch (transcriptionIssue) {
      setAudioTaskBusy(false);
      setAudioTaskStatus(null);
      setError(
        transcriptionIssue instanceof Error
          ? transcriptionIssue.message
          : "Unable to read this audio file in the browser.",
      );
      audioRequestIdRef.current = null;
    }
  };

  const handleAudioFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    void transcribeAudioBlob(file, file.name);
  };

  const handleStartRecording = async () => {
    if (audioTaskBusy || appState !== "ready") {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordingChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      void startRecordingVisualization(stream).catch(() => {
        setRecordingLevels(createIdleWaveform(RECORDING_WAVE_BAR_COUNT));
      });

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        recordingChunksRef.current = [];
        stopRecordingVisualization();
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);
        void transcribeAudioBlob(blob, "microphone-recording.webm");
      });

      recorder.start();
      setIsRecording(true);
      setError(null);
      setAudioTaskStatus("Recording from microphone");
    } catch (recordingIssue) {
      stopRecordingVisualization();
      setError(
        recordingIssue instanceof Error
          ? recordingIssue.message
          : "Microphone access was blocked in this browser.",
      );
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      setIsRecording(false);
      setAudioTaskStatus(null);
    }
  };

  const handleStopRecording = () => {
    if (
      !mediaRecorderRef.current ||
      mediaRecorderRef.current.state === "inactive"
    ) {
      return;
    }

    setAudioTaskStatus("Finalizing recording");
    mediaRecorderRef.current.stop();
  };

  const handleGenerateSpeech = () => {
    if (
      !selectedTtsModelWithCompatibility.compatibility?.canLoad ||
      !speakText.trim() ||
      audioTaskBusy
    ) {
      return;
    }

    if (generatedAudioUrl) {
      URL.revokeObjectURL(generatedAudioUrl);
      setGeneratedAudioUrl(null);
    }

    const requestId = crypto.randomUUID();
    audioRequestIdRef.current = requestId;
    setAudioTaskBusy(true);
    setAudioTaskStatus("Preparing speech generation");
    setGeneratedAudioDurationSec(null);
    setError(null);

    postWorkerMessage({
      type: "SYNTHESIZE_SPEECH",
      payload: {
        requestId,
        model: selectedTtsModelWithCompatibility,
        text: speakText.trim(),
        voice: selectedVoice,
        speed: speakSpeed,
      },
    });
  };

  const handleGetStarted = async () => {
    if (!recommendedModel?.compatibility?.canLoad) {
      return;
    }

    setWorkspace("chat");
    await activateModel(recommendedModel);
  };

  const handleSearchModels = () => {
    openPicker(pickerMode === "audio" ? "curated" : "search");
  };

  const handleBrowseAudio = () => {
    audioUploadRef.current?.click();
  };

  const handleCopyTranscript = () => {
    void copyPlainText(transcriptText);
  };

  const handleDownloadTranscript = () => {
    if (!transcriptText) {
      return;
    }

    downloadBlob(
      new Blob([transcriptText], { type: "text/plain;charset=utf-8" }),
      createTranscriptFilename(),
    );
  };

  const handleUseInSpeak = () => {
    if (!transcriptText) {
      return;
    }

    setSpeakText(transcriptText);
    switchToAudioWorkspace("speak");
  };

  const handleDownloadAudio = async () => {
    if (!generatedAudioUrl) {
      return;
    }

    const response = await fetch(generatedAudioUrl);
    const blob = await response.blob();
    downloadBlob(blob, createSpeechFilename());
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
    stopRecordingVisualization();
    mediaRecorderRef.current?.stream
      ?.getTracks()
      .forEach((track) => track.stop());
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;
    setIsRecording(false);
    setLocalVerdicts({});
    setRecentModels([]);
    setAppSettings(DEFAULT_APP_SETTINGS);
    setPickerTab("curated");
    setSearchFilters({
      mobileSafe: deviceCapabilities.tier === "mobile",
      verifiedOnly: false,
      showExperimental: false,
    });
    if (generatedAudioUrl) {
      URL.revokeObjectURL(generatedAudioUrl);
    }
    setAudioTab("transcribe");
    setSelectedSttModel(getFallbackAudioModel("transcribe")!);
    setSelectedTtsModel(getFallbackAudioModel("speak")!);
    setAudioTaskBusy(false);
    setAudioTaskStatus(null);
    audioRequestIdRef.current = null;
    setAudioInputLabel(null);
    setTranscriptText("");
    setTranscriptChunks([]);
    setTimestampsEnabled(false);
    setSpeakText("");
    setSelectedVoice(
      getFallbackAudioModel("speak")!.runtime.defaultVoice ?? "default",
    );
    setSpeakSpeed(1);
    setGeneratedAudioUrl(null);
    setGeneratedAudioDurationSec(null);
    setWorkspace("chat");
    setAudioView("overview");
    setSettingsOpen(false);
    setDataOpen(false);
    clearLightweightAppState();
  };

  const workspaceSwitchDisabled = isGenerating || audioTaskBusy || isRecording;

  if (booting) {
    return (
      <AppLayout
        workspace={workspace}
        settingsActive={false}
        dataActive={false}
        progressClassName="panel-progress panel-progress-loading"
        progressWidth="24%"
        githubUrl={GITHUB_URL}
        onSelectWorkspace={(nextWorkspace) => {
          if (nextWorkspace === "audio") {
            switchToAudioWorkspace(audioView);
            return;
          }

          switchToChatWorkspace();
        }}
        onOpenSettings={openSettings}
        onOpenData={openData}
      >
        <section className="panel app-panel chat-workspace-panel">
          <div className="boot-placeholder" aria-hidden="true" />
        </section>
      </AppLayout>
    );
  }

  const chatAppState =
    selectedModelWithCompatibility?.id ===
    activeThreadModelWithCompatibility?.id
      ? appState
      : "loading";
  const audioAppState =
    selectedModelWithCompatibility?.id === activeAudioModelWithCompatibility.id
      ? appState
      : "loading";

  return (
    <>
      <AppLayout
        workspace={workspace}
        settingsActive={settingsOpen}
        dataActive={dataOpen}
        progressClassName={progressClassName}
        progressWidth={progressWidth}
        workspaceSwitchDisabled={workspaceSwitchDisabled}
        githubUrl={GITHUB_URL}
        onSelectWorkspace={(nextWorkspace) => {
          if (nextWorkspace === "audio") {
            switchToAudioWorkspace(audioView);
            return;
          }

          switchToChatWorkspace();
        }}
        onOpenSettings={openSettings}
        onOpenData={openData}
      >
        {settingsOpen ? (
          <SettingsPage
            open
            settings={appSettings}
            contextWindowTokens={
              activeThreadModelWithCompatibility?.runtime.contextWindowTokens ??
              null
            }
            githubUrl={isMobileLayout ? GITHUB_URL : undefined}
            onSave={saveSettings}
          />
        ) : dataOpen ? (
          <DataPage
            open
            storageStatus={chatPersistenceStatus}
            storageWarning={chatStorageWarning}
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
        ) : workspace === "audio" ? (
          audioView === "overview" ? (
            <LandingScreen
              mode="audio"
              recommendedModel={recommendedModel}
              selectedSttModel={selectedSttModelWithCompatibility}
              selectedTtsModel={selectedTtsModelWithCompatibility}
              starterModels={starterModels}
              audioStarterModels={audioLandingStarterModels}
              loadingModelId={loadingModelId}
              getStartedDisabled={!recommendedModel?.compatibility?.canLoad}
              globalMessage={error ?? chatStorageWarning}
              onGetStarted={handleGetStarted}
              onSearchModels={handleSearchModels}
              onTryTranscribe={() => switchToAudioWorkspace("transcribe")}
              onTrySpeak={() => switchToAudioWorkspace("speak")}
              onSelectChatModel={requestModelLoad}
              onSelectTranscribeModel={(model) => {
                void requestAudioModelLoad(model, "transcribe");
              }}
              onSelectSpeakModel={(model) => {
                void requestAudioModelLoad(model, "speak");
              }}
            />
          ) : (
            <AudioScreen
              activeTab={audioTab}
              selectedModel={activeAudioModelWithCompatibility}
              appState={audioAppState}
              progress={progress}
              error={error}
              taskBusy={audioTaskBusy}
              taskStatus={audioTaskStatus}
              isRecording={isRecording}
              recordingLevels={recordingLevels}
              recordingDurationMs={recordingDurationMs}
              audioInputLabel={audioInputLabel}
              transcriptText={transcriptText}
              transcriptChunks={transcriptChunks}
              showTimestamps={timestampsEnabled}
              timestampsEnabled={timestampsEnabled}
              speakText={speakText}
              selectedVoice={selectedVoice}
              speakSpeed={speakSpeed}
              audioUrl={generatedAudioUrl}
              audioDurationSec={generatedAudioDurationSec}
              audioUploadRef={audioUploadRef}
              onSwitchTab={switchToAudioWorkspace}
              onChangeModel={() => openPicker("curated")}
              onStartRecording={() => {
                void handleStartRecording();
              }}
              onStopRecording={handleStopRecording}
              onBrowseAudio={handleBrowseAudio}
              onAudioFileChange={handleAudioFileChange}
              onToggleTimestamps={setTimestampsEnabled}
              onCopyTranscript={handleCopyTranscript}
              onDownloadTranscript={handleDownloadTranscript}
              onUseInSpeak={handleUseInSpeak}
              onSpeakTextChange={setSpeakText}
              onVoiceChange={setSelectedVoice}
              onSpeedChange={setSpeakSpeed}
              onGenerateSpeech={handleGenerateSpeech}
              onDownloadAudio={() => {
                void handleDownloadAudio();
              }}
            />
          )
        ) : activeThreadModelWithCompatibility ? (
          <ChatScreen
            threads={chatThreads}
            activeThreadId={activeThreadId}
            activeThreadTitle={activeThread?.title ?? "New Chat"}
            selectedModel={activeThreadModelWithCompatibility}
            appState={chatAppState}
            messages={activeMessages}
            input={activeInput}
            progress={progress}
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
            mode="chat"
            recommendedModel={recommendedModel}
            selectedSttModel={selectedSttModelWithCompatibility}
            selectedTtsModel={selectedTtsModelWithCompatibility}
            starterModels={starterModels}
            audioStarterModels={audioLandingStarterModels}
            loadingModelId={loadingModelId}
            getStartedDisabled={!recommendedModel?.compatibility?.canLoad}
            globalMessage={error ?? chatStorageWarning}
            onGetStarted={handleGetStarted}
            onSearchModels={handleSearchModels}
            onTryTranscribe={() => switchToAudioWorkspace("transcribe")}
            onTrySpeak={() => switchToAudioWorkspace("speak")}
            onSelectChatModel={requestModelLoad}
            onSelectTranscribeModel={(model) => {
              void requestAudioModelLoad(model, "transcribe");
            }}
            onSelectSpeakModel={(model) => {
              void requestAudioModelLoad(model, "speak");
            }}
          />
        )}
      </AppLayout>

      <ModelPickerDialog
        open={pickerOpen}
        activeTab={pickerTab}
        curatedSections={pickerCuratedSections}
        recentModels={pickerRecentModels}
        searchQuery={searchQuery}
        searchFilters={searchFilters}
        searchResults={pickerSearchResults}
        searchLoading={searchLoading}
        searchError={searchError}
        loadingModelId={loadingModelId}
        availableTabs={pickerAvailableTabs}
        onClose={() => setPickerOpen(false)}
        onTabChange={setPickerTab}
        onSearchQueryChange={setSearchQuery}
        onToggleFilter={toggleSearchFilter}
        onLoadModel={
          pickerMode === "audio" ? requestAudioModelLoad : requestModelLoad
        }
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
