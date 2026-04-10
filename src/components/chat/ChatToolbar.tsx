import type { ModelDescriptor } from "../../types";
import { formatContextWindow } from "./helpers";

type ChatToolbarProps = {
  selectedModel: ModelDescriptor;
  modelStatus: {
    label: string;
    className: string;
  };
  modelFlags: string[];
  isGenerating: boolean;
  onChangeModel: () => void;
  onOpenSettings: () => void;
};

function ChatToolbar({
  selectedModel,
  modelStatus,
  modelFlags,
  isGenerating,
  onChangeModel,
  onOpenSettings,
}: ChatToolbarProps) {
  return (
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
            <div
              className="model-switcher-popover"
              role="note"
              aria-label="Model details"
            >
              <p className="model-switcher-popover-title">
                {selectedModel.label}
              </p>
              <p className="model-switcher-popover-copy">
                {selectedModel.summary}
              </p>
              <dl className="model-switcher-stats">
                <div>
                  <dt>Parameters</dt>
                  <dd>{selectedModel.paramsLabel}</dd>
                </div>
                <div>
                  <dt>Context</dt>
                  <dd>
                    {formatContextWindow(
                      selectedModel.runtime.contextWindowTokens,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Publisher</dt>
                  <dd>{selectedModel.publisher}</dd>
                </div>
                <div>
                  <dt>Mode</dt>
                  <dd>
                    {selectedModel.task === "vision"
                      ? "Vision chat"
                      : "Text chat"}
                  </dd>
                </div>
              </dl>
              <div
                className="model-switcher-flags"
                aria-label="Model capabilities"
              >
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
  );
}

export default ChatToolbar;
