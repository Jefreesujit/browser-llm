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

import ChatScreen from "./components/ChatScreen";
import LandingScreen from "./components/LandingScreen";
import ModelPickerDialog from "./components/ModelPickerDialog";
import SettingsDialog from "./components/SettingsDialog";
import { getCompatibilityReport, shouldShowSearchModel } from "./compatibility";
import { detectDeviceCapabilities } from "./device";
import { searchHubModels, fetchHubModelDetails, enrichModelDescriptor } from "./hf";
import {
  CURATED_CATEGORIES,
  CURATED_MODELS,
  HOME_STARTER_MODELS,
  getCuratedModelsForCategory,
  searchCatalogModels,
} from "./models";
import {
  loadActiveChatThreadId,
  loadAppSettings,
  loadChatThreads,
  loadLastModel,
  loadModelVerdictCache,
  loadPickerTab,
  loadRecentModels,
  loadShowExperimental,
  pushRecentModel,
  saveActiveChatThreadId,
  saveAppSettings,
  saveChatThreads,
  saveLastModel,
  savePickerTab,
  saveRecentModels,
  saveShowExperimental,
  upsertModelVerdict,
} from "./storage";
import type {
  AppSettings,
  ChatMessage,
  ChatThread,
  DeviceCapabilities,
  GenerationOptions,
  LocalModelVerdictCache,
  ModelDescriptor,
  PickerTab,
  SearchFilters,
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

const computeGenerationOptions = (
  settings: AppSettings,
  contextWindowTokens: number,
): GenerationOptions => {
  const maxNewTokens =
    settings.maxTokenMode === "percentage"
      ? Math.max(64, Math.floor((contextWindowTokens * settings.percentageMaxTokens) / 100))
      : settings.staticMaxTokens;

  return {
    maxNewTokens: Math.min(maxNewTokens, contextWindowTokens),
    temperature: settings.temperature,
    topP: settings.topP,
  };
};

const THINK_OPEN_TAG = "<think>";
const THINK_CLOSE_TAG = "</think>";

const DEFAULT_DEVICE_CAPABILITIES: DeviceCapabilities = {
  hasWebGpu: false,
  supportsFp16: false,
  tier: "desktop",
  browserLabel: "Your browser",
  userAgent: "",
};

const createMessage = (
  role: ChatMessage["role"],
  content: string,
  attachment?: ChatMessage["attachment"],
): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  attachment,
});

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

const applyAssistantContent = (message: ChatMessage, rawContent: string): ChatMessage => {
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

const stripMessageRuntime = (message: ChatMessage): ChatMessage => {
  const { rawContent: _rawContent, ...rest } = message;
  return rest;
};

const toStoredMessages = (messages: ChatMessage[]) => messages.map(stripMessageRuntime);

const buildThreadTitle = (messages: ChatMessage[]) => {
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

const areMessagesEqual = (left: ChatMessage[], right: ChatMessage[]) =>
  JSON.stringify(left) === JSON.stringify(right);

const loadInitialThreadState = () => {
  const threads = sortThreadsByUpdatedAt(loadChatThreads());
  const savedActiveThreadId = loadActiveChatThreadId();
  const activeThread =
    threads.find((thread) => thread.id === savedActiveThreadId) ?? threads[0] ?? null;

  return {
    threads,
    activeThreadId: activeThread?.id ?? null,
    activeThread,
    screen: threads.length > 0 ? ("chat" as const) : ("landing" as const),
  };
};

function App() {
  const initialThreadState = useMemo(loadInitialThreadState, []);
  const workerRef = useRef<Worker | null>(null);
  const selectedModelRef = useRef<ModelDescriptor | null>(null);
  const chatLogRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [screen, setScreen] = useState<Screen>(initialThreadState.screen);
  const [appState, setAppState] = useState<AppState>("loading");
  const [deviceCapabilities, setDeviceCapabilities] = useState<DeviceCapabilities>(
    DEFAULT_DEVICE_CAPABILITIES,
  );
  const [workerReady, setWorkerReady] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelDescriptor | null>(
    initialThreadState.activeThread?.model ?? null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialThreadState.activeThread?.messages ?? [],
  );
  const [input, setInput] = useState("");
  const [draftAttachment, setDraftAttachment] = useState<DraftAttachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>(null);
  const [isGenerating, setIsGenerating] = useState(false);
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
  const [chatThreads, setChatThreads] = useState<ChatThread[]>(initialThreadState.threads);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadState.activeThreadId);
  const [chatStorageWarning, setChatStorageWarning] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(loadAppSettings());
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    mobileSafe: deviceCapabilities.tier === "mobile",
    verifiedOnly: false,
    showExperimental: loadShowExperimental(),
  });

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const activeThread = useMemo(
    () => chatThreads.find((thread) => thread.id === activeThreadId) ?? null,
    [activeThreadId, chatThreads],
  );

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
    if (!deviceCapabilities.hasWebGpu) {
      return;
    }

    const worker = new Worker(new URL("./model.worker.ts", import.meta.url), { type: "module" });

    const handleWorkerMessage = (event: MessageEvent<WorkerResponse>) => {
      const currentModel = selectedModelRef.current;
      if (!currentModel) {
        return;
      }

      switch (event.data.type) {
        case "LOAD_PROGRESS": {
          if (event.data.payload.modelId !== currentModel.id) {
            return;
          }
          setProgress(event.data.payload);
          break;
        }
        case "MODEL_READY": {
          if (event.data.payload.modelId !== currentModel.id) {
            return;
          }
          setAppState("ready");
          setError(null);
          setProgress(null);
          setLoadingModelId(null);
          break;
        }
        case "MODEL_LOAD_RESULT": {
          if (event.data.payload.modelId !== currentModel.id) {
            return;
          }

          if (event.data.payload.status === "verified") {
            const nextCache = upsertModelVerdict(currentModel.id, {
              status: "verified",
              lastLoadedAt: new Date().toISOString(),
            });
            setLocalVerdicts(nextCache);

            const nextRecentModels = pushRecentModel(currentModel);
            setRecentModels(nextRecentModels);
            saveLastModel(currentModel);
          } else {
            const nextCache = upsertModelVerdict(currentModel.id, {
              status: "failed_on_device",
              lastLoadedAt: new Date().toISOString(),
            });
            setLocalVerdicts(nextCache);
          }
          break;
        }
        case "STREAM_TOKEN": {
          if (event.data.payload.modelId !== currentModel.id) {
            return;
          }

          const { text } = event.data.payload;
          setMessages((current) => {
            const next = [...current];
            const last = next.at(-1);

            if (last?.role !== "assistant") {
              return current;
            }

            const nextRawContent = `${last.rawContent ?? last.content}${text}`;
            next[next.length - 1] = applyAssistantContent(last, nextRawContent);
            return next;
          });
          break;
        }
        case "GENERATION_DONE": {
          if (event.data.payload.modelId !== currentModel.id) {
            return;
          }

          const { text } = event.data.payload;
          setMessages((current) => {
            const next = [...current];
            const last = next.at(-1);

            if (last?.role !== "assistant") {
              return current;
            }

            next[next.length - 1] = applyAssistantContent(last, text);
            return next;
          });
          setIsGenerating(false);
          break;
        }
        case "ERROR": {
          if (event.data.payload.modelId !== currentModel.id) {
            return;
          }

          const nextCache = upsertModelVerdict(currentModel.id, {
            status: "failed_on_device",
            lastLoadedAt: new Date().toISOString(),
          });
          setLocalVerdicts(nextCache);
          setMessages((current) => {
            const last = current.at(-1);

            if (last?.role === "assistant" && last.content.length === 0) {
              return current.slice(0, -1);
            }

            return current;
          });
          setError(event.data.payload.message);
          setAppState("loading");
          setIsGenerating(false);
          setLoadingModelId(null);
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
    if (!activeThreadId || !selectedModel) {
      return;
    }

    const storedModel = stripModelCompatibility(selectedModel);
    const storedMessages = toStoredMessages(messages);

    setChatThreads((current) => {
      const existingThread = current.find((thread) => thread.id === activeThreadId);
      if (!existingThread) {
        return current;
      }

      const nextTitle = buildThreadTitle(storedMessages);
      const hasModelChanged =
        existingThread.model.id !== storedModel.id ||
        existingThread.model.label !== storedModel.label;
      const hasMessagesChanged = !areMessagesEqual(existingThread.messages, storedMessages);
      const hasTitleChanged = existingThread.title !== nextTitle;

      if (!hasModelChanged && !hasMessagesChanged && !hasTitleChanged) {
        return current;
      }

      const updatedThread: ChatThread = {
        ...existingThread,
        title: nextTitle,
        model: storedModel,
        messages: storedMessages,
        updatedAt: new Date().toISOString(),
      };

      return sortThreadsByUpdatedAt(
        current.map((thread) => (thread.id === activeThreadId ? updatedThread : thread)),
      );
    });
  }, [activeThreadId, messages, selectedModel]);

  useEffect(() => {
    if (!workerReady || !selectedModel) {
      return;
    }

    setAppState("loading");
    setError(null);
    setProgress(null);

    workerRef.current?.postMessage({
      type: "LOAD_MODEL",
      payload: { model: selectedModel },
    } satisfies WorkerRequest);
  }, [selectedModel, workerReady]);

  useEffect(() => {
    const chatLog = chatLogRef.current;
    if (!chatLog) {
      return;
    }

    chatLog.scrollTop = chatLog.scrollHeight;
  }, [messages, progress]);

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

    if (selectedModelWithCompatibility) {
      return selectedModelWithCompatibility;
    }

    const fallback = CURATED_MODELS.find((model) =>
      deviceCapabilities.tier === "mobile"
        ? model.category === "mobile_safe" && model.task === "text"
        : model.category === "balanced" && model.task === "text",
    );

    return fallback ? decorateModel(fallback) : null;
  }, [deviceCapabilities.tier, recommendedModel, selectedModelWithCompatibility]);

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

  const createThreadRecord = (model: ModelDescriptor): ChatThread => {
    const timestamp = new Date().toISOString();

    return {
      id: crypto.randomUUID(),
      title: "New chat",
      model: stripModelCompatibility(model),
      messages: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  };

  const openThread = (threadId: string) => {
    if (isGenerating) {
      return;
    }

    const thread = chatThreads.find((entry) => entry.id === threadId);
    if (!thread) {
      return;
    }

    const sameModel = selectedModel?.id === thread.model.id;
    setActiveThreadId(thread.id);
    setScreen("chat");
    setPendingModel(null);
    setPickerOpen(false);
    setInput("");
    setDraftAttachment(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setMessages(thread.messages);

    if (!sameModel || !selectedModel) {
      setSelectedModel(thread.model);
      setAppState("loading");
      setProgress(null);
      setLoadingModelId(thread.model.id);
      return;
    }

    setSelectedModel(selectedModel);
  };

  const createNewThread = async (preferredModel?: ModelDescriptor) => {
    if (isGenerating) {
      return;
    }

    const baseModel = preferredModel ?? defaultThreadModel;
    if (!baseModel) {
      return;
    }

    const thread = createThreadRecord(baseModel);
    setChatThreads((current) => sortThreadsByUpdatedAt([thread, ...current]));
    setActiveThreadId(thread.id);
    setScreen("chat");
    setMessages([]);
    setInput("");
    setDraftAttachment(null);
    setError(null);
    setPickerOpen(false);
    setPendingModel(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (selectedModel?.id === baseModel.id) {
      setSelectedModel(selectedModel);
      return;
    }

    setSelectedModel(baseModel);
    setAppState("loading");
    setProgress(null);
    setLoadingModelId(baseModel.id);
  };

  const deleteThread = (threadId: string) => {
    if (isGenerating) {
      return;
    }

    const remainingThreads = chatThreads.filter((thread) => thread.id !== threadId);
    setChatThreads(remainingThreads);

    if (remainingThreads.length === 0) {
      setActiveThreadId(null);
      setSelectedModel(null);
      setMessages([]);
      setInput("");
      setDraftAttachment(null);
      setError(null);
      setPickerOpen(false);
      setPendingModel(null);
      setScreen("landing");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    if (threadId === activeThreadId) {
      openThread(remainingThreads[0].id);
    }
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

  const activateModel = async (model: ModelDescriptor) => {
    setLoadingModelId(model.id);
    setError(null);

    try {
      const resolvedModel = await resolveSelectedModel(model);
      const shouldReuseActiveThread = screen === "chat" && activeThreadId && messages.length === 0;
      const nextThread = shouldReuseActiveThread
        ? {
            ...(activeThread ?? createThreadRecord(resolvedModel)),
            title: "New chat",
            model: stripModelCompatibility(resolvedModel),
            messages: [],
            updatedAt: new Date().toISOString(),
          }
        : createThreadRecord(resolvedModel);

      setChatThreads((current) => {
        const withoutTarget = current.filter((thread) => thread.id !== nextThread.id);
        return sortThreadsByUpdatedAt([nextThread, ...withoutTarget]);
      });
      setActiveThreadId(nextThread.id);
      setSelectedModel(resolvedModel);
      setScreen("chat");
      setPickerOpen(false);
      setPendingModel(null);
      setAppState("loading");
      setProgress(null);
      setMessages([]);
      setInput("");
      setDraftAttachment(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
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

    if (screen === "chat" && selectedModel && selectedModel.id !== model.id && messages.length > 0) {
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

  const submitMessage = () => {
    if (!selectedModelWithCompatibility) {
      return;
    }

    const trimmed = input.trim();
    const canSendImageOnly = selectedModelWithCompatibility.task === "vision" && draftAttachment;

    if ((!trimmed && !canSendImageOnly) || appState !== "ready" || isGenerating) {
      return;
    }

    const userMessage = createMessage(
      "user",
      trimmed,
      draftAttachment
        ? {
            name: draftAttachment.name,
            mimeType: draftAttachment.mimeType,
            size: draftAttachment.size,
          }
        : undefined,
    );
    const assistantMessage = createMessage("assistant", "");
    const nextMessages = [...messages, userMessage];

    setMessages([...nextMessages, assistantMessage]);
    setInput("");
    setDraftAttachment(null);
    setIsGenerating(true);
    setError(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    workerRef.current?.postMessage({
      type: "GENERATE",
      payload: {
        model: selectedModelWithCompatibility,
        messages: nextMessages,
        image: draftAttachment?.file ?? null,
        options: computeGenerationOptions(appSettings, selectedModelWithCompatibility.runtime.contextWindowTokens),
      },
    } satisfies WorkerRequest);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitMessage();
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  };

  const handleFileChange = () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setDraftAttachment(null);
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
    setDraftAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    saveRecentModels(recentModels);
  }, [recentModels]);

  const openSettings = () => setSettingsOpen(true);
  const closeSettings = () => setSettingsOpen(false);

  const saveSettings = (next: AppSettings) => {
    setAppSettings(next);
    saveAppSettings(next);
  };

  const clearAllChats = () => {
    setChatThreads([]);
    setActiveThreadId(null);
    setSelectedModel(null);
    setMessages([]);
    setInput("");
    setDraftAttachment(null);
    setError(null);
    setScreen("landing");
    saveChatThreads([]);
    saveActiveChatThreadId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const clearAllData = () => {
    clearAllChats();
    setLocalVerdicts({});
    setRecentModels([]);
    saveRecentModels([]);
  };

  useEffect(() => {
    savePickerTab(pickerTab);
  }, [pickerTab]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const threadsResult = saveChatThreads(chatThreads);
      const activeThreadResult = saveActiveChatThreadId(activeThreadId);

      if (
        (!threadsResult.ok && threadsResult.reason === "quota") ||
        (!activeThreadResult.ok && activeThreadResult.reason === "quota")
      ) {
        setChatStorageWarning("Local storage is full. Delete some chats to keep saving new ones.");
        return;
      }

      if (threadsResult.ok && activeThreadResult.ok) {
        setChatStorageWarning(null);
      }
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [activeThreadId, chatThreads]);

  if (screen === "landing" || !selectedModelWithCompatibility) {
    return (
      <>
        <LandingScreen
          recommendedModel={recommendedModel}
          starterModels={starterModels}
          loadingModelId={loadingModelId}
          getStartedDisabled={!recommendedModel?.compatibility?.canLoad}
          globalMessage={error}
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

  return (
    <>
      <ChatScreen
        threads={chatThreads}
        activeThreadId={activeThreadId}
        selectedModel={selectedModelWithCompatibility}
        appState={appState}
        messages={messages}
        input={input}
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
        onSelectThread={openThread}
        onDeleteThread={deleteThread}
        onChangeModel={() => openPicker("curated")}
        onOpenSettings={openSettings}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        onComposerKeyDown={handleComposerKeyDown}
        onFileChange={handleFileChange}
        onRemoveAttachment={removeAttachment}
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
        contextWindowTokens={selectedModelWithCompatibility?.runtime.contextWindowTokens ?? null}
        onClose={closeSettings}
        onSave={saveSettings}
        onClearChatHistory={clearAllChats}
        onClearAllData={clearAllData}
      />

      {pendingModel && (
        <div className="dialog-backdrop" role="presentation">
          <section className="confirm-shell" role="dialog" aria-modal="true" aria-label="Change model">
            <p className="section-label">Change Model</p>
            <h2>Start a new chat with this model?</h2>
            <p className="confirm-copy">
              Switching models clears the current chat so the new session starts cleanly with{" "}
              <strong>{pendingModel.label}</strong>.
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
