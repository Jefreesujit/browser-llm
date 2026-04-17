import type { WorkspaceMode } from "../types";

type WorkspaceModeTabsProps = {
  activeMode: WorkspaceMode;
  disabled?: boolean;
  onSelectMode: (mode: WorkspaceMode) => void;
};

function WorkspaceModeTabs({
  activeMode,
  disabled = false,
  onSelectMode,
}: WorkspaceModeTabsProps) {
  return (
    <div
      className="workspace-mode-tabs"
      role="tablist"
      aria-label="Workspace mode"
    >
      <button
        className={`workspace-mode-tab ${activeMode === "chat" ? "workspace-mode-tab-active" : ""}`}
        type="button"
        role="tab"
        aria-selected={activeMode === "chat"}
        onClick={() => onSelectMode("chat")}
        disabled={disabled}
      >
        Chat
      </button>
      <button
        className={`workspace-mode-tab ${activeMode === "audio" ? "workspace-mode-tab-active" : ""}`}
        type="button"
        role="tab"
        aria-selected={activeMode === "audio"}
        onClick={() => onSelectMode("audio")}
        disabled={disabled}
      >
        Audio
      </button>
    </div>
  );
}

export default WorkspaceModeTabs;
