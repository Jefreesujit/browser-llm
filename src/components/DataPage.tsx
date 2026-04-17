import { useEffect, useState } from "react";

import type { ChatPersistenceStatus } from "../types";
import DataSettingsTab from "./settings/DataSettingsTab";
import ModelCacheSettingsTab from "./settings/ModelCacheSettingsTab";

type DataViewTab = "storage" | "models";

type DataPageProps = {
  open: boolean;
  storageStatus: ChatPersistenceStatus;
  storageWarning?: string | null;
  onClearChatHistory: () => void;
  onClearAllData: () => void;
  onClearAllDownloadedModels: () => void;
};

function DataPage({
  open,
  storageStatus,
  storageWarning,
  onClearChatHistory,
  onClearAllData,
  onClearAllDownloadedModels,
}: DataPageProps) {
  const [activeTab, setActiveTab] = useState<DataViewTab>("storage");

  useEffect(() => {
    if (open) {
      setActiveTab("storage");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <section className="panel settings-page" aria-label="Data">
      <div className="settings-page-shell">
        <header className="settings-page-header">
          <div>
            <p className="section-label">Maintenance</p>
            <h2>Data</h2>
            <p className="settings-page-copy">
              Manage browser storage separately from generation settings.
            </p>
          </div>
        </header>

        <div className="settings-page-content">
          <div
            className="settings-subtabs"
            role="tablist"
            aria-label="Data sections"
          >
            <button
              type="button"
              role="tab"
              className={`settings-subtab ${activeTab === "storage" ? "settings-subtab-active" : ""}`}
              aria-selected={activeTab === "storage"}
              onClick={() => setActiveTab("storage")}
            >
              Storage &amp; Data
            </button>
            <button
              type="button"
              role="tab"
              className={`settings-subtab ${activeTab === "models" ? "settings-subtab-active" : ""}`}
              aria-selected={activeTab === "models"}
              onClick={() => setActiveTab("models")}
            >
              Model Cache
            </button>
          </div>

          {activeTab === "storage" ? (
            <section className="settings-surface-section">
              <div className="settings-surface-header">
                <p className="section-label">Storage &amp; Data</p>
                <h3>Local browser data</h3>
                <p>
                  Review persistence status and clear saved chats or lightweight
                  browser state when needed.
                </p>
              </div>
              <DataSettingsTab
                storageStatus={storageStatus}
                storageWarning={storageWarning}
                onClearChatHistory={onClearChatHistory}
                onClearAllData={onClearAllData}
              />
            </section>
          ) : (
            <section className="settings-surface-section">
              <div className="settings-surface-header">
                <p className="section-label">Model Cache</p>
                <h3>Downloaded model files</h3>
                <p>
                  Review cached browser model files grouped by chat and voice,
                  then remove them without touching your generation defaults.
                </p>
              </div>
              <ModelCacheSettingsTab
                onClearAllDownloadedModels={onClearAllDownloadedModels}
              />
            </section>
          )}
        </div>

      </div>
    </section>
  );
}

export default DataPage;
