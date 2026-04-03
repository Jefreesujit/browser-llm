import { FormEvent, KeyboardEvent, RefObject } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import ChatHistorySidebar from "./ChatHistorySidebar";
import { formatBytes } from "../format";
import type { ChatMessage, ChatThread, ModelDescriptor } from "../types";

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

const formatContextWindow = (tokens: number) => {
  if (tokens >= 1000) {
    const value = tokens / 1000;
    return Number.isInteger(value) ? `${value}K tokens` : `${value.toFixed(1)}K tokens`;
  }

  return `${tokens} tokens`;
};

const getModelFlags = (model: ModelDescriptor) => {
  const flags = [model.compatibility?.badgeLabel ?? "Browser-ready"];

  if (model.task === "vision") {
    flags.push("Image support");
  } else {
    flags.push("Text chat");
  }

  if (model.category === "coding") {
    flags.push("Coding");
  }

  if (model.category === "reasoning") {
    flags.push("Reasoning");
  }

  if (model.category === "desktop_experimental" || model.compatibility?.verdict === "experimental") {
    flags.push("Experimental");
  }

  return flags;
};

const getStarterPrompts = (model: ModelDescriptor) => {
  if (model.task === "vision") {
    return [
      "Describe the image and summarize the key details.",
      "Extract the main text and explain what it means.",
      "What stands out in this image and why?",
    ];
  }

  if (model.category === "coding") {
    return [
      "Write a small utility function and explain it.",
      "Review this bug and suggest the fix.",
      "Refactor this code for readability.",
      "Explain how this code works step by step.",
    ];
  }

  if (model.category === "reasoning") {
    return [
      "Compare two options and recommend one.",
      "Break this problem into clear steps.",
      "Give me the tradeoffs behind this decision.",
      "Help me think through the risks here.",
    ];
  }

  return [
    "Summarize a topic clearly for me.",
    "Help me draft a message or email.",
    "Explain a concept in simple terms.",
    "Give me a quick plan for this task.",
  ];
};

type ChatScreenProps = {
  threads: ChatThread[];
  activeThreadId: string | null;
  selectedModel: ModelDescriptor;
  appState: AppState;
  messages: ChatMessage[];
  input: string;
  progress: ProgressState;
  progressWidth: string;
  progressClassName: string;
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
  onOpenSettings: () => void;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onFileChange: () => void;
  onRemoveAttachment: () => void;
};

function ChatScreen({
  threads,
  activeThreadId,
  selectedModel,
  appState,
  messages,
  input,
  progress,
  progressWidth,
  progressClassName,
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
  onOpenSettings,
  onInputChange,
  onSubmit,
  onComposerKeyDown,
  onFileChange,
  onRemoveAttachment,
}: ChatScreenProps) {
  const isVisionMode = selectedModel.task === "vision";
  const starterPrompts = getStarterPrompts(selectedModel);
  const modelStatus = error
    ? { label: "Failed", className: "model-switcher-status model-switcher-status-error" }
    : appState === "ready"
      ? { label: "Live", className: "model-switcher-status model-switcher-status-live" }
      : progress?.loaded && progress.total
        ? { label: "Loading", className: "model-switcher-status model-switcher-status-loading" }
        : { label: "Preparing", className: "model-switcher-status model-switcher-status-loading" };
  const modelFlags = getModelFlags(selectedModel);

  return (
    <main className="shell">
      <section className="panel app-panel chat-workspace-panel">
        <div className={progressClassName} aria-hidden="true">
          <div className="panel-progress-fill" style={{ width: progressWidth }} />
        </div>

        <div className="chat-workspace-content">
          <ChatHistorySidebar
            threads={threads}
            activeThreadId={activeThreadId}
            disabled={isGenerating}
            storageWarning={storageWarning}
            onCreateThread={onCreateThread}
            onSelectThread={onSelectThread}
            onDeleteThread={onDeleteThread}
          />

          <div className="chat-main">
            <header className="chat-toolbar">
              <div className="chat-toolbar-main">
                <div className="chat-toolbar-copy">
                  <h1>Browser LLM Chat</h1>
                </div>
                <div className="chat-toolbar-actions">
                  <div className="model-switcher-wrap">
                    <button
                      className="secondary-button model-switcher"
                      type="button"
                      onClick={onChangeModel}
                      disabled={isGenerating}
                    >
                      <span className={modelStatus.className}>
                        <span className="model-switcher-dot" aria-hidden="true" />
                        {modelStatus.label}
                      </span>
                      <span className="model-switcher-name">{selectedModel.label}</span>
                      <span className="model-switcher-caret" aria-hidden="true">
                        ▾
                      </span>
                    </button>
                    <div className="model-switcher-popover" role="note" aria-label="Model details">
                      <p className="model-switcher-popover-title">{selectedModel.label}</p>
                      <p className="model-switcher-popover-copy">{selectedModel.summary}</p>
                      <dl className="model-switcher-stats">
                        <div>
                          <dt>Parameters</dt>
                          <dd>{selectedModel.paramsLabel}</dd>
                        </div>
                        <div>
                          <dt>Context</dt>
                          <dd>{formatContextWindow(selectedModel.runtime.contextWindowTokens)}</dd>
                        </div>
                        <div>
                          <dt>Publisher</dt>
                          <dd>{selectedModel.publisher}</dd>
                        </div>
                        <div>
                          <dt>Mode</dt>
                          <dd>{selectedModel.task === "vision" ? "Vision chat" : "Text chat"}</dd>
                        </div>
                      </dl>
                      <div className="model-switcher-flags" aria-label="Model capabilities">
                        {modelFlags.map((flag) => (
                          <span key={flag}>{flag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button
                    className="secondary-button settings-icon-btn"
                    type="button"
                    title="Settings"
                    aria-label="Open settings"
                    onClick={onOpenSettings}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                  </button>
                </div>
              </div>
            </header>

            <section className="chat-log" aria-label="Chat messages" ref={chatLogRef}>
              {messages.length === 0 ? (
                <div className="empty-state">
                  <p className="empty-title">Start chatting.</p>
                  <p className="empty-copy">
                    {appState === "ready"
                      ? "The selected model is ready. Ask a question to begin."
                      : "The selected model is still loading into browser storage."}
                  </p>
                  {appState === "ready" && (
                    <div className="empty-suggestions" aria-label="Starter prompts">
                      {starterPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          className="empty-suggestion"
                          type="button"
                          onClick={() => onInputChange(prompt)}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                messages.map((message) => (
                  <article key={message.id} className={`message message-${message.role}`}>
                    {message.attachment && (
                      <div className="message-attachment">
                        <span className="attachment-chip">
                          Image attached: {message.attachment.name}
                        </span>
                      </div>
                    )}
                    {message.role === "assistant" ? (
                      <div className="markdown-body">
                        {message.reasoning && (
                          <details className="reasoning-panel">
                            <summary>
                              {message.reasoningState === "streaming" ? "Thinking" : "View thinking"}
                            </summary>
                            <div className="reasoning-body">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {message.reasoning}
                              </ReactMarkdown>
                            </div>
                          </details>
                        )}
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content ||
                            (message.reasoningState === "streaming"
                              ? ""
                              : isGenerating
                                ? "Thinking..."
                                : "")}
                        </ReactMarkdown>
                        {message.reasoningState === "streaming" && !message.content && (
                          <p className="thinking-indicator">Thinking…</p>
                        )}
                      </div>
                    ) : (
                      <p className="message-content">{message.content}</p>
                    )}
                  </article>
                ))
              )}
            </section>

            <form className="composer" onSubmit={onSubmit}>
              {isVisionMode && (
                <div className="composer-attachments">
                  <input
                    ref={fileInputRef}
                    className="sr-only"
                    id="vision-upload"
                    type="file"
                    accept="image/*"
                    onChange={onFileChange}
                    disabled={appState !== "ready" || isGenerating}
                  />
                  <button
                    className="attach-button"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={appState !== "ready" || isGenerating}
                  >
                    Attach image
                  </button>
                  {draftAttachment && (
                    <button
                      className="attachment-chip attachment-chip-action"
                      type="button"
                      onClick={onRemoveAttachment}
                    >
                      {draftAttachment.name} · {formatBytes(draftAttachment.size) ?? "image"} ×
                    </button>
                  )}
                </div>
              )}
              <label className="sr-only" htmlFor="chat-input">
                Ask the model something
              </label>
              <textarea
                id="chat-input"
                className="composer-input"
                value={input}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={onComposerKeyDown}
                placeholder={
                  appState === "ready"
                    ? isVisionMode
                      ? "Type a prompt, or attach an image and ask about it..."
                      : "Message the model..."
                    : "Model is downloading into your browser..."
                }
                rows={2}
                disabled={appState !== "ready" || isGenerating}
              />
              <div className="composer-footer">
                <p className={`hint ${error ? "error-text" : ""}`}>
                  {error
                    ? error
                    : appState === "ready"
                      ? "Press Enter to send. Use Shift+Enter for a new line."
                      : progress?.loaded && progress.total
                        ? `Downloading ${formatBytes(progress.loaded)} / ${formatBytes(progress.total)}`
                        : "Send unlocks automatically once the model is ready."}
                </p>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={
                    appState !== "ready" ||
                    isGenerating ||
                    (input.trim().length === 0 && !draftAttachment)
                  }
                >
                  {isGenerating ? "Generating..." : appState === "ready" ? "Send" : "Loading..."}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}

export default ChatScreen;
