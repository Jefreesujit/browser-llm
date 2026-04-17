import type { FormEvent, KeyboardEvent, RefObject } from "react";

import type {
  ChatMessage,
  ChatThread,
  DraftAttachment,
  ModelDescriptor,
  ModelLoadProgress,
  ModelLoadState,
} from "../types";
import ChatComposer from "./chat/ChatComposer";
import ChatMessageList from "./chat/ChatMessageList";
import ChatToolbar from "./chat/ChatToolbar";
import { getModelFlags, getStarterPrompts } from "./chat/helpers";
import ChatHistorySidebar from "./ChatHistorySidebar";

type ChatScreenProps = {
  threads: ChatThread[];
  activeThreadId: string | null;
  activeThreadTitle: string;
  selectedModel: ModelDescriptor;
  appState: ModelLoadState;
  messages: ChatMessage[];
  input: string;
  progress: ModelLoadProgress;
  error: string | null;
  isGenerating: boolean;
  draftAttachment: DraftAttachment | null;
  storageWarning?: string | null;
  chatLogRef: RefObject<HTMLElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onCreateThread: () => void;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onChangeModel: () => void;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onFileChange: () => void;
  onRemoveAttachment: () => void;
  onChatScroll: (scrollTop: number) => void;
  onStopGeneration: () => void;
  stopRequested: boolean;
};

function ChatScreen({
  threads,
  activeThreadId,
  activeThreadTitle,
  selectedModel,
  appState,
  messages,
  input,
  progress,
  error,
  isGenerating,
  draftAttachment,
  storageWarning,
  chatLogRef,
  fileInputRef,
  onCreateThread,
  onSelectThread,
  onDeleteThread,
  onChangeModel,
  onInputChange,
  onSubmit,
  onComposerKeyDown,
  onFileChange,
  onRemoveAttachment,
  onChatScroll,
  onStopGeneration,
  stopRequested,
}: ChatScreenProps) {
  const isVisionMode = selectedModel.task === "vision";
  const starterPrompts = getStarterPrompts(selectedModel);
  const modelStatus = error
    ? {
        label: "Failed",
        className: "model-switcher-status model-switcher-status-error",
      }
    : appState === "ready"
      ? {
          label: "Live",
          className: "model-switcher-status model-switcher-status-live",
        }
      : progress?.loaded && progress.total
        ? {
            label: "Loading",
            className: "model-switcher-status model-switcher-status-loading",
          }
        : {
            label: "Preparing",
            className: "model-switcher-status model-switcher-status-loading",
          };
  const modelFlags = getModelFlags(selectedModel);

  return (
    <section className="panel app-panel chat-workspace-panel">
      <div className="chat-workspace-content">
        <ChatHistorySidebar
          threads={threads}
          activeThreadId={activeThreadId}
          disableMutations={isGenerating}
          storageWarning={storageWarning}
          onCreateThread={onCreateThread}
          onSelectThread={onSelectThread}
          onDeleteThread={onDeleteThread}
        />

        <div className="chat-main">
          <ChatToolbar
            title={activeThreadTitle}
            selectedModel={selectedModel}
            modelStatus={modelStatus}
            modelFlags={modelFlags}
            isGenerating={isGenerating}
            onChangeModel={onChangeModel}
          />

          <ChatMessageList
            messages={messages}
            appState={appState}
            isGenerating={isGenerating}
            starterPrompts={starterPrompts}
            chatLogRef={chatLogRef}
            onInputChange={onInputChange}
            onChatScroll={onChatScroll}
          />

          <ChatComposer
            isVisionMode={isVisionMode}
            appState={appState}
            isGenerating={isGenerating}
            stopRequested={stopRequested}
            input={input}
            error={error}
            progress={progress}
            draftAttachment={draftAttachment}
            fileInputRef={fileInputRef}
            onSubmit={onSubmit}
            onComposerKeyDown={onComposerKeyDown}
            onInputChange={onInputChange}
            onFileChange={onFileChange}
            onRemoveAttachment={onRemoveAttachment}
            onStopGeneration={onStopGeneration}
          />
        </div>
      </div>
    </section>
  );
}

export default ChatScreen;
