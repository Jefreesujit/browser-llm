import type { PropsWithChildren } from "react";

import type { WorkspaceMode } from "../types";

type AppLayoutProps = PropsWithChildren<{
  workspace: WorkspaceMode;
  settingsActive: boolean;
  dataActive: boolean;
  progressClassName: string;
  progressWidth: string;
  workspaceSwitchDisabled?: boolean;
  githubUrl: string;
  onSelectWorkspace: (workspace: WorkspaceMode) => void;
  onOpenSettings: () => void;
  onOpenData: () => void;
}>;

type NavIconProps = {
  kind: "chat" | "voice" | "settings" | "data" | "github";
};

function NavIcon({ kind }: NavIconProps) {
  switch (kind) {
    case "chat":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 6.5a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H9l-4.4 3.3c-.3.2-.6 0-.6-.3V16.8A2.5 2.5 0 0 1 4 14.5z" />
        </svg>
      );
    case "voice":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 4a3 3 0 0 1 3 3v4a3 3 0 1 1-6 0V7a3 3 0 0 1 3-3z" />
          <path d="M6.5 10.5a5.5 5.5 0 0 0 11 0" />
          <path d="M12 16v4" />
          <path d="M8.5 20h7" />
        </svg>
      );
    case "settings":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 8.8A3.2 3.2 0 1 1 8.8 12 3.2 3.2 0 0 1 12 8.8z" />
          <path d="M19.4 12.9a1 1 0 0 0 0-1.8l-1.2-.4a6.9 6.9 0 0 0-.6-1.4l.6-1.1a1 1 0 0 0-.2-1.2l-1.2-1.2a1 1 0 0 0-1.2-.2l-1.1.6a6.9 6.9 0 0 0-1.4-.6l-.4-1.2a1 1 0 0 0-1.8 0l-.4 1.2a6.9 6.9 0 0 0-1.4.6l-1.1-.6a1 1 0 0 0-1.2.2L5.4 7a1 1 0 0 0-.2 1.2l.6 1.1a6.9 6.9 0 0 0-.6 1.4l-1.2.4a1 1 0 0 0 0 1.8l1.2.4a6.9 6.9 0 0 0 .6 1.4l-.6 1.1a1 1 0 0 0 .2 1.2l1.2 1.2a1 1 0 0 0 1.2.2l1.1-.6a6.9 6.9 0 0 0 1.4.6l.4 1.2a1 1 0 0 0 1.8 0l.4-1.2a6.9 6.9 0 0 0 1.4-.6l1.1.6a1 1 0 0 0 1.2-.2l1.2-1.2a1 1 0 0 0 .2-1.2l-.6-1.1a6.9 6.9 0 0 0 .6-1.4z" />
        </svg>
      );
    case "data":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4.5 6.5C4.5 5.1 7.9 4 12 4s7.5 1.1 7.5 2.5S16.1 9 12 9 4.5 7.9 4.5 6.5z" />
          <path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" />
          <path d="M4.5 17.5c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" />
          <path d="M4.5 6.5v11" />
          <path d="M19.5 6.5v11" />
        </svg>
      );
    case "github":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 3.5a8.5 8.5 0 0 0-2.7 16.6c.4.1.5-.2.5-.4v-1.6c-2.1.5-2.5-.9-2.5-.9-.4-1-.9-1.2-.9-1.2-.7-.5 0-.5 0-.5.8 0 1.2.8 1.2.8.7 1.2 1.8.8 2.2.6.1-.5.3-.8.5-1-1.7-.2-3.6-.9-3.6-3.9 0-.9.3-1.6.8-2.2 0-.2-.3-1 .1-2.1 0 0 .7-.2 2.2.8a7.6 7.6 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1.1.1 1.9.1 2.1.5.6.8 1.3.8 2.2 0 3-1.9 3.7-3.6 3.9.3.2.5.7.5 1.5v2.3c0 .2.1.5.5.4A8.5 8.5 0 0 0 12 3.5z" />
        </svg>
      );
  }
}

function AppLayout({
  workspace,
  settingsActive,
  dataActive,
  progressClassName,
  progressWidth,
  workspaceSwitchDisabled = false,
  githubUrl,
  onSelectWorkspace,
  onOpenSettings,
  onOpenData,
  children,
}: AppLayoutProps) {
  return (
    <div className="app-frame">
      <div className={progressClassName} aria-hidden="true">
        <div className="panel-progress-fill" style={{ width: progressWidth }} />
      </div>

      <div className="app-shell">
        <aside className="app-sidebar" aria-label="Primary navigation">
          <div className="app-sidebar-brand">
            <div className="app-sidebar-logo" aria-hidden="true">
              BL
            </div>
            <div className="app-sidebar-brand-copy">
              <span>Browser</span>
              <span>LLM</span>
            </div>
          </div>

          <nav className="app-sidebar-nav">
            <button
              className={`app-nav-item ${workspace === "chat" && !settingsActive && !dataActive ? "app-nav-item-active" : ""}`}
              type="button"
              aria-current={
                workspace === "chat" && !settingsActive && !dataActive
                  ? "page"
                  : undefined
              }
              onClick={() => onSelectWorkspace("chat")}
              disabled={workspaceSwitchDisabled}
            >
              <NavIcon kind="chat" />
              <span>Chat</span>
            </button>
            <button
              className={`app-nav-item ${workspace === "audio" && !settingsActive && !dataActive ? "app-nav-item-active" : ""}`}
              type="button"
              aria-current={
                workspace === "audio" && !settingsActive && !dataActive
                  ? "page"
                  : undefined
              }
              onClick={() => onSelectWorkspace("audio")}
              disabled={workspaceSwitchDisabled}
            >
              <NavIcon kind="voice" />
              <span>Voice</span>
            </button>
          </nav>

          <div className="app-sidebar-footer">
            <button
              className={`app-nav-item ${settingsActive ? "app-nav-item-active" : ""}`}
              type="button"
              aria-current={settingsActive ? "page" : undefined}
              onClick={onOpenSettings}
            >
              <NavIcon kind="settings" />
              <span>Settings</span>
            </button>
            <button
              className={`app-nav-item ${dataActive ? "app-nav-item-active" : ""}`}
              type="button"
              aria-current={dataActive ? "page" : undefined}
              onClick={onOpenData}
            >
              <NavIcon kind="data" />
              <span>Data</span>
            </button>
            <a
              className="app-nav-item"
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
            >
              <NavIcon kind="github" />
              <span>GitHub</span>
            </a>
          </div>
        </aside>

        <div className="app-main">
          <div className="app-content">{children}</div>
        </div>

        <nav className="mobile-nav" aria-label="Mobile navigation">
          <button
            className={`mobile-nav-item ${workspace === "chat" && !settingsActive && !dataActive ? "mobile-nav-item-active" : ""}`}
            type="button"
            aria-current={
              workspace === "chat" && !settingsActive && !dataActive
                ? "page"
                : undefined
            }
            onClick={() => onSelectWorkspace("chat")}
            disabled={workspaceSwitchDisabled}
          >
            <NavIcon kind="chat" />
            <span>Chat</span>
          </button>
          <button
            className={`mobile-nav-item ${workspace === "audio" && !settingsActive && !dataActive ? "mobile-nav-item-active" : ""}`}
            type="button"
            aria-current={
              workspace === "audio" && !settingsActive && !dataActive
                ? "page"
                : undefined
            }
            onClick={() => onSelectWorkspace("audio")}
            disabled={workspaceSwitchDisabled}
          >
            <NavIcon kind="voice" />
            <span>Voice</span>
          </button>
          <button
            className={`mobile-nav-item ${settingsActive ? "mobile-nav-item-active" : ""}`}
            type="button"
            aria-current={settingsActive ? "page" : undefined}
            onClick={onOpenSettings}
          >
            <NavIcon kind="settings" />
            <span>Settings</span>
          </button>
          <button
            className={`mobile-nav-item ${dataActive ? "mobile-nav-item-active" : ""}`}
            type="button"
            aria-current={dataActive ? "page" : undefined}
            onClick={onOpenData}
          >
            <NavIcon kind="data" />
            <span>Data</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

export default AppLayout;
