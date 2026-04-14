import { create } from "zustand";

import {
  createDefaultThreadUiState,
  sortThreadsByUpdatedAt,
} from "../app/chat-helpers";
import { DEFAULT_DEVICE_CAPABILITIES } from "../app/constants";
import {
  loadActiveChatThreadId,
  loadAppSettings,
  loadModelVerdictCache,
  loadPickerTab,
  loadRecentModels,
  loadShowExperimental,
} from "../storage";
import type {
  AppSettings,
  ChatPersistenceStatus,
  ChatThread,
  DeviceCapabilities,
  DraftAttachment,
  GenerationRequestState,
  LocalModelVerdictCache,
  ModelDescriptor,
  ModelLoadProgress,
  ModelLoadState,
  PickerTab,
  SearchFilters,
  ThreadMessage,
  ThreadUiState,
} from "../types";

type AppStoreState = {
  booting: boolean;
  appState: ModelLoadState;
  deviceCapabilities: DeviceCapabilities;
  selectedModel: ModelDescriptor | null;
  error: string | null;
  progress: ModelLoadProgress;
  pickerOpen: boolean;
  pickerTab: PickerTab;
  pendingModel: ModelDescriptor | null;
  loadingModelId: string | null;
  recentModels: ModelDescriptor[];
  localVerdicts: LocalModelVerdictCache;
  chatThreads: ChatThread[];
  threadMessages: Record<string, ThreadMessage[]>;
  threadUiStates: Record<string, ThreadUiState>;
  activeThreadId: string | null;
  draftAttachment: DraftAttachment | null;
  generationRequest: GenerationRequestState | null;
  stopRequested: boolean;
  chatStorageWarning: string | null;
  chatPersistenceStatus: ChatPersistenceStatus;
  settingsOpen: boolean;
  appSettings: AppSettings;
  loadedModelId: string | null;
  searchFilters: SearchFilters;
};

type AppStoreActions = {
  setBooting: (booting: boolean) => void;
  setAppState: (appState: ModelLoadState) => void;
  setDeviceCapabilities: (deviceCapabilities: DeviceCapabilities) => void;
  setSelectedModel: (selectedModel: ModelDescriptor | null) => void;
  setError: (error: string | null) => void;
  setProgress: (progress: ModelLoadProgress) => void;
  setPickerOpen: (pickerOpen: boolean) => void;
  setPickerTab: (pickerTab: PickerTab) => void;
  setPendingModel: (pendingModel: ModelDescriptor | null) => void;
  setLoadingModelId: (loadingModelId: string | null) => void;
  setRecentModels: (recentModels: ModelDescriptor[]) => void;
  setLocalVerdicts: (localVerdicts: LocalModelVerdictCache) => void;
  setChatThreads: (chatThreads: ChatThread[]) => void;
  upsertThread: (thread: ChatThread) => void;
  setThreadMessagesMap: (
    threadMessages: Record<string, ThreadMessage[]>,
  ) => void;
  replaceThreadMessages: (threadId: string, messages: ThreadMessage[]) => void;
  setThreadUiStates: (threadUiStates: Record<string, ThreadUiState>) => void;
  setThreadUiState: (threadId: string, patch: Partial<ThreadUiState>) => void;
  removeThreadState: (threadId: string) => void;
  clearThreadState: () => void;
  setActiveThreadId: (activeThreadId: string | null) => void;
  setDraftAttachment: (draftAttachment: DraftAttachment | null) => void;
  setGenerationRequest: (
    generationRequest: GenerationRequestState | null,
  ) => void;
  setStopRequested: (stopRequested: boolean) => void;
  setChatPersistence: (
    chatPersistenceStatus: ChatPersistenceStatus,
    chatStorageWarning: string | null,
  ) => void;
  setSettingsOpen: (settingsOpen: boolean) => void;
  setAppSettings: (appSettings: AppSettings) => void;
  setLoadedModelId: (loadedModelId: string | null) => void;
  setSearchFilters: (searchFilters: SearchFilters) => void;
  updateSearchFilters: (
    updater: (searchFilters: SearchFilters) => SearchFilters,
  ) => void;
  toggleSearchFilter: (filter: keyof SearchFilters) => void;
};

export type AppStore = AppStoreState & AppStoreActions;

const createInitialSearchFilters = (): SearchFilters => ({
  mobileSafe: DEFAULT_DEVICE_CAPABILITIES.tier === "mobile",
  verifiedOnly: false,
  showExperimental: loadShowExperimental(),
});

export const useAppStore = create<AppStore>()((set) => ({
  booting: true,
  appState: "loading",
  deviceCapabilities: DEFAULT_DEVICE_CAPABILITIES,
  selectedModel: null,
  error: null,
  progress: null,
  pickerOpen: false,
  pickerTab: loadPickerTab(),
  pendingModel: null,
  loadingModelId: null,
  recentModels: loadRecentModels(),
  localVerdicts: loadModelVerdictCache(),
  chatThreads: [],
  threadMessages: {},
  threadUiStates: {},
  activeThreadId: loadActiveChatThreadId(),
  draftAttachment: null,
  generationRequest: null,
  stopRequested: false,
  chatStorageWarning: null,
  chatPersistenceStatus: "ready",
  settingsOpen: false,
  appSettings: loadAppSettings(),
  loadedModelId: null,
  searchFilters: createInitialSearchFilters(),

  setBooting: (booting) => set({ booting }),
  setAppState: (appState) => set({ appState }),
  setDeviceCapabilities: (deviceCapabilities) => set({ deviceCapabilities }),
  setSelectedModel: (selectedModel) => set({ selectedModel }),
  setError: (error) => set({ error }),
  setProgress: (progress) => set({ progress }),
  setPickerOpen: (pickerOpen) => set({ pickerOpen }),
  setPickerTab: (pickerTab) => set({ pickerTab }),
  setPendingModel: (pendingModel) => set({ pendingModel }),
  setLoadingModelId: (loadingModelId) => set({ loadingModelId }),
  setRecentModels: (recentModels) => set({ recentModels }),
  setLocalVerdicts: (localVerdicts) => set({ localVerdicts }),
  setChatThreads: (chatThreads) => set({ chatThreads }),
  upsertThread: (thread) =>
    set((state) => ({
      chatThreads: sortThreadsByUpdatedAt([
        thread,
        ...state.chatThreads.filter((entry) => entry.id !== thread.id),
      ]),
    })),
  setThreadMessagesMap: (threadMessages) => set({ threadMessages }),
  replaceThreadMessages: (threadId, messages) =>
    set((state) => ({
      threadMessages: {
        ...state.threadMessages,
        [threadId]: messages,
      },
    })),
  setThreadUiStates: (threadUiStates) => set({ threadUiStates }),
  setThreadUiState: (threadId, patch) =>
    set((state) => ({
      threadUiStates: {
        ...state.threadUiStates,
        [threadId]: {
          ...(state.threadUiStates[threadId] ??
            createDefaultThreadUiState(threadId)),
          ...patch,
          threadId,
          updatedAt: new Date().toISOString(),
        },
      },
    })),
  removeThreadState: (threadId) =>
    set((state) => {
      const nextMessages = { ...state.threadMessages };
      const nextUiStates = { ...state.threadUiStates };
      delete nextMessages[threadId];
      delete nextUiStates[threadId];

      return {
        chatThreads: state.chatThreads.filter(
          (thread) => thread.id !== threadId,
        ),
        threadMessages: nextMessages,
        threadUiStates: nextUiStates,
      };
    }),
  clearThreadState: () =>
    set({
      chatThreads: [],
      threadMessages: {},
      threadUiStates: {},
    }),
  setActiveThreadId: (activeThreadId) => set({ activeThreadId }),
  setDraftAttachment: (draftAttachment) => set({ draftAttachment }),
  setGenerationRequest: (generationRequest) => set({ generationRequest }),
  setStopRequested: (stopRequested) => set({ stopRequested }),
  setChatPersistence: (chatPersistenceStatus, chatStorageWarning) =>
    set({
      chatPersistenceStatus,
      chatStorageWarning,
    }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setAppSettings: (appSettings) => set({ appSettings }),
  setLoadedModelId: (loadedModelId) => set({ loadedModelId }),
  setSearchFilters: (searchFilters) => set({ searchFilters }),
  updateSearchFilters: (updater) =>
    set((state) => ({
      searchFilters: updater(state.searchFilters),
    })),
  toggleSearchFilter: (filter) =>
    set((state) => ({
      searchFilters: {
        ...state.searchFilters,
        [filter]: !state.searchFilters[filter],
      },
    })),
}));
