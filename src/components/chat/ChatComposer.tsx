import type { FormEvent, KeyboardEvent, RefObject } from "react";

import { formatBytes } from "../../format";
import type {
  DraftAttachment,
  ModelLoadProgress,
  ModelLoadState,
} from "../../types";

type ChatComposerProps = {
  isVisionMode: boolean;
  appState: ModelLoadState;
  isGenerating: boolean;
  stopRequested: boolean;
  input: string;
  error: string | null;
  progress: ModelLoadProgress;
  draftAttachment: DraftAttachment | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onInputChange: (value: string) => void;
  onFileChange: () => void;
  onRemoveAttachment: () => void;
  onStopGeneration: () => void;
};

function ChatComposer({
  isVisionMode,
  appState,
  isGenerating,
  stopRequested,
  input,
  error,
  progress,
  draftAttachment,
  fileInputRef,
  onSubmit,
  onComposerKeyDown,
  onInputChange,
  onFileChange,
  onRemoveAttachment,
  onStopGeneration,
}: ChatComposerProps) {
  return (
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
              {draftAttachment.name} ·{" "}
              {formatBytes(draftAttachment.size) ?? "image"} ×
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
            : isGenerating && stopRequested
              ? "Stopping generation..."
              : appState === "ready"
                ? "Press Enter to send. Use Shift+Enter for a new line."
                : progress?.loaded && progress.total
                  ? `Downloading ${formatBytes(progress.loaded)} / ${formatBytes(progress.total)}`
                  : "Send unlocks automatically once the model is ready."}
        </p>
        {isGenerating ? (
          <button
            className="primary-button"
            type="button"
            onClick={onStopGeneration}
            disabled={stopRequested}
          >
            {stopRequested ? "Stopping..." : "Stop"}
          </button>
        ) : (
          <button
            className="primary-button"
            type="submit"
            disabled={
              appState !== "ready" ||
              (input.trim().length === 0 && !draftAttachment)
            }
          >
            {appState === "ready" ? "Send" : "Loading..."}
          </button>
        )}
      </div>
    </form>
  );
}

export default ChatComposer;
