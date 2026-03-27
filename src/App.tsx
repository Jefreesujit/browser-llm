import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { DEFAULT_MODEL_MODE, MODEL_DEFINITIONS, MODEL_OPTIONS } from "./models";
import type { ChatMessage, ModelMode, WorkerRequest, WorkerResponse } from "./types";

type AppState = "loading" | "ready";

type ProgressState = {
  mode: ModelMode;
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

const formatBytes = (value: number | null) => {
  if (!value || Number.isNaN(value)) {
    return null;
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unitIndex]}`;
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

function App() {
  const workerRef = useRef<Worker | null>(null);
  const chatLogRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedModeRef = useRef<ModelMode>(DEFAULT_MODEL_MODE);
  const [workerVersion, setWorkerVersion] = useState(0);
  const [workerReady, setWorkerReady] = useState(false);
  const [selectedMode, setSelectedMode] = useState<ModelMode>(DEFAULT_MODEL_MODE);
  const [appState, setAppState] = useState<AppState>("loading");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [draftAttachment, setDraftAttachment] = useState<DraftAttachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const selectedModel = MODEL_DEFINITIONS[selectedMode];
  const isVisionMode = selectedModel.kind === "vision";
  const isWebGpuSupported =
    typeof navigator !== "undefined" &&
    "gpu" in navigator &&
    /(chrome|edg)/i.test(navigator.userAgent);

  useEffect(() => {
    selectedModeRef.current = selectedMode;
  }, [selectedMode]);

  useEffect(() => {
    if (!isWebGpuSupported) {
      return;
    }

    const worker = new Worker(new URL("./model.worker.ts", import.meta.url), {
      type: "module",
    });

    const handleWorkerMessage = (event: MessageEvent<WorkerResponse>) => {
      switch (event.data.type) {
        case "LOAD_PROGRESS": {
          if (event.data.payload.mode !== selectedModeRef.current) {
            return;
          }
          setProgress(event.data.payload);
          break;
        }
        case "MODEL_READY": {
          if (event.data.payload.mode !== selectedModeRef.current) {
            return;
          }
          setAppState("ready");
          setError(null);
          setProgress(null);
          break;
        }
        case "STREAM_TOKEN": {
          if (event.data.payload.mode !== selectedModeRef.current) {
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
            next[next.length - 1] = {
              ...applyAssistantContent(last, nextRawContent),
            };
            return next;
          });
          break;
        }
        case "GENERATION_DONE": {
          if (event.data.payload.mode !== selectedModeRef.current) {
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
          if (event.data.payload.mode !== selectedModeRef.current) {
            return;
          }
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
  }, [isWebGpuSupported, workerVersion]);

  useEffect(() => {
    if (!workerReady) {
      return;
    }

    setAppState("loading");
    setError(null);
    setProgress(null);

    workerRef.current?.postMessage({
      type: "LOAD_MODEL",
      payload: { mode: selectedMode },
    } satisfies WorkerRequest);
  }, [selectedMode, workerReady]);

  useEffect(() => {
    const chatLog = chatLogRef.current;
    if (!chatLog) {
      return;
    }

    chatLog.scrollTop = chatLog.scrollHeight;
  }, [messages, progress]);

  const progressLabel = useMemo(() => {
    if (!progress) {
      return null;
    }

    const loaded = formatBytes(progress.loaded);
    const total = formatBytes(progress.total);

    if (loaded && total) {
      return `${loaded} / ${total}`;
    }

    if (typeof progress.progress === "number") {
      return `${progress.progress.toFixed(1)}%`;
    }

    return "Downloading";
  }, [progress]);

  const statusText = useMemo(() => {
    if (error) {
      return error;
    }

    if (appState === "ready") {
      return `${selectedModel.modelName} is ready in your browser`;
    }

    if (progressLabel) {
      return `Downloading ${selectedModel.modelName} into your browser cache • ${progressLabel}`;
    }

    return `Preparing ${selectedModel.modelName} in your browser cache`;
  }, [appState, error, progressLabel, selectedModel.modelName]);

  const progressWidth =
    appState === "ready" ? "100%" : `${Math.max(progress?.progress ?? 6, 6)}%`;
  const progressClassName = error
    ? "panel-progress panel-progress-error"
    : appState === "ready"
      ? "panel-progress panel-progress-ready"
      : "panel-progress panel-progress-loading";

  const statusBadgeLabel = error
    ? "Issue"
    : appState === "ready"
      ? "Ready"
      : "Loading";
  const statusBadgeClass = error
    ? "error"
    : appState === "ready"
      ? "ready"
      : "loading";

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

  const handleModelChange = (mode: ModelMode) => {
    if (mode === selectedMode) {
      return;
    }

    setWorkerVersion((current) => current + 1);
    setSelectedMode(mode);
    setAppState("loading");
    setMessages([]);
    setInput("");
    setDraftAttachment(null);
    setError(null);
    setProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = () => {
    setDraftAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const submitMessage = () => {
    const trimmed = input.trim();
    const canSendImageOnly = isVisionMode && draftAttachment;

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
        mode: selectedMode,
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

  if (!isWebGpuSupported) {
    return (
      <main className="shell shell-single">
        <section className="panel unsupported-panel">
          <p className="eyebrow">Browser LLM Chat</p>
          <h1>WebGPU is required.</h1>
          <p className="lede">
            Open this app in recent Chrome or Edge on desktop. Model files are downloaded into the
            browser, so WebGPU support is required here.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="panel app-panel">
        <div className={progressClassName} aria-hidden="true">
          <div
            className="panel-progress-fill"
            style={{
              width: progressWidth,
            }}
          />
        </div>

        <header className="topbar topbar-chat">
          <div className="topbar-copy">
            <p className="eyebrow">Browser LLM Chat</p>
            <h1>Local LLM in your browser</h1>
            <p className="lede lede-compact">
              No backend. Model files stay in your browser cache after the first download.
            </p>
          </div>
          <div className="topbar-actions">
            <span className={`status-badge status-${statusBadgeClass}`}>{statusBadgeLabel}</span>
            <label className="model-switcher">
              <span className="sr-only">Select model</span>
              <select
                value={selectedMode}
                onChange={(event) => handleModelChange(event.target.value as ModelMode)}
                disabled={isGenerating}
              >
                {MODEL_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label} · {option.modelName} ({option.paramsLabel})
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary-button"
              onClick={resetChat}
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
                  : "The selected model is still loading. Send unlocks automatically once it is ready."}
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

        <form className="composer" onSubmit={handleSubmit}>
          {isVisionMode && (
            <div className="composer-attachments">
              <input
                ref={fileInputRef}
                className="sr-only"
                id="vision-upload"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
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
                  onClick={removeAttachment}
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
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleComposerKeyDown}
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
              {appState === "ready"
                ? "Press Enter to send. Use Shift+Enter for a new line."
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

export default App;
