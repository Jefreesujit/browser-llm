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
  loadLastModel,
  loadModelVerdictCache,
  loadPickerTab,
  loadRecentModels,
  loadShowExperimental,
  pushRecentModel,
  saveLastModel,
  savePickerTab,
  saveRecentModels,
  saveShowExperimental,
  upsertModelVerdict,
} from "./storage";
import type {
  ChatMessage,
  DeviceCapabilities,
  LocalModelVerdictCache,
  ModelDescriptor,
  PickerTab,
  SearchFilters,
  WorkerRequest,
  WorkerResponse,
} from "./types";

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

function App() {
  const workerRef = useRef<Worker | null>(null);
  const selectedModelRef = useRef<ModelDescriptor | null>(null);
  const chatLogRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [screen, setScreen] = useState<Screen>("landing");
  const [appState, setAppState] = useState<AppState>("loading");
  const [deviceCapabilities, setDeviceCapabilities] = useState<DeviceCapabilities>(
    DEFAULT_DEVICE_CAPABILITIES,
  );
  const [workerReady, setWorkerReady] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelDescriptor | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    mobileSafe: deviceCapabilities.tier === "mobile",
    verifiedOnly: false,
    showExperimental: loadShowExperimental(),
  });

  const deferredSearchQuery = useDeferredValue(searchQuery);

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

  const resetChat = () => {
    setMessages([]);
    setInput("");
    setDraftAttachment(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    workerRef.current?.postMessage({ type: "RESET_CHAT" } satisfies WorkerRequest);
  };

  const resolveSelectedModel = async (model: ModelDescriptor) => {
    const baseModel = model.source === "search" ? enrichModelDescriptor(model, await fetchHubModelDetails(model.id)) : model;
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

  useEffect(() => {
    savePickerTab(pickerTab);
  }, [pickerTab]);

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
        chatLogRef={chatLogRef}
        fileInputRef={fileInputRef}
        onChangeModel={() => openPicker("curated")}
        onResetChat={resetChat}
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
