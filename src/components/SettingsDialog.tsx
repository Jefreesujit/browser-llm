import { useEffect, useState } from "react";

import { useDialogScrollLock } from "../hooks/useDialogScrollLock";
import type { AppSettings, ChatPersistenceStatus } from "../types";
import { DEFAULT_APP_SETTINGS } from "../types";
import DataSettingsTab from "./settings/DataSettingsTab";
import GenerationSettingsTab from "./settings/GenerationSettingsTab";
import ModelCacheSettingsTab from "./settings/ModelCacheSettingsTab";

type SettingsTab = "generation" | "data" | "models";

type SettingsDialogProps = {
  open: boolean;
  settings: AppSettings;
  contextWindowTokens: number | null;
  storageStatus: ChatPersistenceStatus;
  storageWarning?: string | null;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
  onClearChatHistory: () => void;
  onClearAllData: () => void;
  onClearAllDownloadedModels: () => void;
};

const TAB_LABELS: Record<SettingsTab, string> = {
  generation: "Generation",
  data: "Data",
  models: "Models",
};

function SettingsDialog({
  open,
  settings,
  contextWindowTokens,
  storageStatus,
  storageWarning,
  onClose,
  onSave,
  onClearChatHistory,
  onClearAllData,
  onClearAllDownloadedModels,
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("generation");
  const [draft, setDraft] = useState<AppSettings>(settings);

  useDialogScrollLock(open);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setActiveTab("generation");
    }
  }, [open, settings]);

  if (!open) {
    return null;
  }

  const handleChange = (patch: Partial<AppSettings>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="dialog-shell settings-shell"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(event) => event.stopPropagation()}
        onWheelCapture={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div>
            <p className="section-label">Configuration</p>
            <h2>Settings</h2>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="dialog-tabs" role="tablist" aria-label="Settings tabs">
          {(Object.keys(TAB_LABELS) as SettingsTab[]).map((tab) => (
            <button
              key={tab}
              className={`dialog-tab ${tab === activeTab ? "dialog-tab-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={tab === activeTab}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        <div className="dialog-content">
          {activeTab === "generation" && (
            <GenerationSettingsTab
              draft={draft}
              contextWindowTokens={contextWindowTokens}
              onChange={handleChange}
              onReset={() => setDraft(DEFAULT_APP_SETTINGS)}
            />
          )}
          {activeTab === "data" && (
            <DataSettingsTab
              storageStatus={storageStatus}
              storageWarning={storageWarning}
              onClearChatHistory={onClearChatHistory}
              onClearAllData={onClearAllData}
            />
          )}
          {activeTab === "models" && (
            <ModelCacheSettingsTab
              onClearAllDownloadedModels={onClearAllDownloadedModels}
            />
          )}
        </div>

        <footer className="settings-footer">
          {activeTab === "generation" ? (
            <>
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  onSave(draft);
                  onClose();
                }}
              >
                Save settings
              </button>
            </>
          ) : (
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

export default SettingsDialog;
