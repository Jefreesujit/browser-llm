import type { ModelDescriptor } from "../../types";
import { formatContextWindow } from "./helpers";

type ChatToolbarProps = {
  title: string;
  selectedModel: ModelDescriptor;
  modelStatus: {
    label: string;
    className: string;
  };
  modelFlags: string[];
  isGenerating: boolean;
  onChangeModel: () => void;
};

function ChatToolbar({
  title,
  selectedModel,
  modelStatus,
  modelFlags,
  isGenerating,
  onChangeModel,
}: ChatToolbarProps) {
  return (
    <header className="chat-toolbar">
      <div className="chat-toolbar-main">
        <div className="chat-toolbar-copy">
          <h2>{title}</h2>
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
        </div>
      </div>
    </header>
  );
}

export default ChatToolbar;
