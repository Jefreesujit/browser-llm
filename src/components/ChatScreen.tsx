import { FormEvent, KeyboardEvent, RefObject } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { formatBytes } from "../format";
import type { ChatMessage, ModelDescriptor } from "../types";

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

type ChatScreenProps = {
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
  chatLogRef: RefObject<HTMLElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onChangeModel: () => void;
  onResetChat: () => void;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onFileChange: () => void;
  onRemoveAttachment: () => void;
};

function ChatScreen({
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
  chatLogRef,
  fileInputRef,
  onChangeModel,
  onResetChat,
  onInputChange,
  onSubmit,
  onComposerKeyDown,
  onFileChange,
  onRemoveAttachment,
}: ChatScreenProps) {
  const isVisionMode = selectedModel.task === "vision";
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
      <section className="panel app-panel">
        <div className={progressClassName} aria-hidden="true">
          <div className="panel-progress-fill" style={{ width: progressWidth }} />
        </div>

        <header className="chat-toolbar">
          <div className="chat-toolbar-copy">
            <p className="eyebrow">Browser LLM Chat</p>
            <div className="chat-toolbar-heading">
              <h1>Private LLM chat in your browser</h1>
            </div>
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
                  Change
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
              className="secondary-button"
              onClick={onResetChat}
              type="button"
              disabled={isGenerating || messages.length === 0}
            >
              Reset
            </button>
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
      </section>
    </main>
  );
}

export default ChatScreen;
