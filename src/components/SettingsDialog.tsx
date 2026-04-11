import { useEffect, useState } from "react";

import {
  clearAllModelCache,
  deleteModelCache,
  getInstalledModels,
  type InstalledModelEntry,
} from "../cache";
import { formatBytes } from "../format";
import type { AppSettings, ChatPersistenceStatus } from "../types";
import { DEFAULT_APP_SETTINGS } from "../types";

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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getStorageLabel = (status: ChatPersistenceStatus) => {
  switch (status) {
    case "fallback_local_storage":
      return "Using localStorage fallback";
    case "quota_exceeded":
      return "Storage full";
    case "unavailable":
      return "Storage unavailable";
    default:
      return "IndexedDB ready";
  }
};

function GenerationTab({
  draft,
  contextWindowTokens,
  onChange,
  onReset,
}: {
  draft: AppSettings;
  contextWindowTokens: number | null;
  onChange: (patch: Partial<AppSettings>) => void;
  onReset: () => void;
}) {
  const previewTokens = contextWindowTokens
    ? Math.floor((contextWindowTokens * draft.percentageMaxTokens) / 100)
    : null;

  return (
    <div className="settings-section">
      <div className="settings-field">
        <div className="settings-field-header">
          <label htmlFor="settings-temperature" className="settings-field-label">
            Temperature
          </label>
          <span className="settings-field-value">{draft.temperature.toFixed(2)}</span>
        </div>
        <p className="settings-field-description">
          Lower values keep responses tighter. Higher values make outputs more varied.
        </p>
        <input
          id="settings-temperature"
          className="settings-slider"
          type="range"
          min={0}
          max={2}
          step={0.01}
          value={draft.temperature}
          onChange={(e) => onChange({ temperature: parseFloat(e.target.value) })}
        />
        <div className="settings-slider-labels">
          <span>Focused</span>
          <span>Creative</span>
        </div>
      </div>

      <div className="settings-field">
        <div className="settings-field-header">
          <label htmlFor="settings-top-p" className="settings-field-label">
            Top-P
          </label>
          <span className="settings-field-value">{draft.topP.toFixed(2)}</span>
        </div>
        <p className="settings-field-description">
          Limits sampling to the highest-probability tokens until the cumulative mass reaches P.
        </p>
        <input
          id="settings-top-p"
          className="settings-slider"
          type="range"
          min={0.01}
          max={1}
          step={0.01}
          value={draft.topP}
          onChange={(e) => onChange({ topP: parseFloat(e.target.value) })}
        />
        <div className="settings-slider-labels">
          <span>Tight</span>
          <span>Open</span>
        </div>
      </div>

      <div className="settings-field">
        <div className="settings-field-header">
          <span className="settings-field-label">Max response tokens</span>
          <div className="settings-token-mode-toggle" role="group" aria-label="Token mode">
            <button
              type="button"
              className={`token-mode-btn ${draft.maxTokenMode === "static" ? "token-mode-btn-active" : ""}`}
              onClick={() => onChange({ maxTokenMode: "static" })}
            >
              Fixed
            </button>
            <button
              type="button"
              className={`token-mode-btn ${draft.maxTokenMode === "percentage" ? "token-mode-btn-active" : ""}`}
              onClick={() => onChange({ maxTokenMode: "percentage" })}
            >
              % of context
            </button>
          </div>
        </div>

        {draft.maxTokenMode === "static" ? (
          <>
            <p className="settings-field-description">
              Hard cap for the number of tokens generated per reply.
            </p>
            <div className="settings-number-row">
              <input
                className="settings-number-input"
                type="number"
                min={64}
                max={32768}
                step={64}
                value={draft.staticMaxTokens}
                onChange={(e) =>
                  onChange({ staticMaxTokens: clamp(parseInt(e.target.value, 10) || 64, 64, 32768) })
                }
              />
              <span className="settings-number-unit">tokens</span>
            </div>
          </>
        ) : (
          <>
            <p className="settings-field-description">
              Use a percentage of the model context window for the maximum response length.
            </p>
            <div className="settings-number-row">
              <input
                className="settings-slider"
                type="range"
                min={1}
                max={20}
                step={1}
                value={draft.percentageMaxTokens}
                onChange={(e) =>
                  onChange({ percentageMaxTokens: clamp(parseInt(e.target.value, 10), 1, 20) })
                }
              />
              <span className="settings-number-unit">{draft.percentageMaxTokens}%</span>
            </div>
            <div className="settings-slider-labels">
              <span>1%</span>
              <span>20%</span>
            </div>
          </>
        )}
      </div>

      <div className="settings-effective-summary">
        {draft.maxTokenMode === "static" ? (
          <>
            Effective limit: <strong>{draft.staticMaxTokens.toLocaleString()} tokens</strong>
          </>
        ) : contextWindowTokens && previewTokens !== null ? (
          <>
            Effective limit: <strong>≈{previewTokens.toLocaleString()} tokens</strong>
          </>
        ) : (
          <>
            Effective limit: <strong>{draft.percentageMaxTokens}% of context</strong>
          </>
        )}
      </div>

      <button type="button" className="settings-reset-btn" onClick={onReset}>
        Reset to defaults
      </button>
    </div>
  );
}

function DataTab({
  storageStatus,
  storageWarning,
  onClearChatHistory,
  onClearAllData,
}: {
  storageStatus: ChatPersistenceStatus;
  storageWarning?: string | null;
  onClearChatHistory: () => void;
  onClearAllData: () => void;
}) {
  return (
    <div className="settings-section">
      <div className="settings-field">
        <div className="settings-field-header">
          <span className="settings-field-label">Storage health</span>
          <span className="settings-field-value">{getStorageLabel(storageStatus)}</span>
        </div>
        <p className="settings-field-description">
          Chats are stored locally in this browser. Lightweight preferences stay in local storage.
        </p>
        {storageWarning && <p className="settings-warning-copy">{storageWarning}</p>}
      </div>

      <div className="settings-field">
        <div className="settings-field-header">
          <span className="settings-field-label">Chat history</span>
        </div>
        <p className="settings-field-description">
          Deletes all saved conversations but keeps downloaded models and general preferences.
        </p>
        <button type="button" className="settings-danger-btn" onClick={onClearChatHistory}>
          Clear chat history
        </button>
      </div>

      <div className="settings-field">
        <div className="settings-field-header">
          <span className="settings-field-label">App data</span>
        </div>
        <p className="settings-field-description">
          Clears chat history, model verdicts, recent models, and saved settings in this browser.
        </p>
        <button type="button" className="settings-danger-btn" onClick={onClearAllData}>
          Clear all app data
        </button>
      </div>
    </div>
  );
}

function ModelsTab({
  onClearAllDownloadedModels,
}: {
  onClearAllDownloadedModels: () => void;
}) {
  const [installedModels, setInstalledModels] = useState<InstalledModelEntry[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [clearingAll, setClearingAll] = useState(false);

  const reload = () => {
    setLoadingModels(true);
    getInstalledModels()
      .then(setInstalledModels)
      .finally(() => setLoadingModels(false));
  };

  useEffect(() => {
    reload();
  }, []);

  const handleDeleteModel = async (modelId: string) => {
    setDeletingIds((prev) => new Set([...prev, modelId]));
    try {
      await deleteModelCache(modelId);
      await reload();
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
    }
  };

  const handleClearAllCache = async () => {
    setClearingAll(true);
    try {
      await clearAllModelCache();
      onClearAllDownloadedModels();
      setInstalledModels([]);
    } finally {
      setClearingAll(false);
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-field">
        <div className="settings-field-header">
          <span className="settings-field-label">Downloaded models</span>
        </div>
        <p className="settings-field-description">
          Remove cached model files from browser storage. They will download again next time.
        </p>

        {loadingModels ? (
          <p className="settings-cache-loading">Scanning browser cache…</p>
        ) : installedModels.length === 0 ? (
          <p className="settings-cache-empty">No downloaded model files found in your browser cache.</p>
        ) : (
          <ul className="settings-model-list">
            {installedModels.map(({ modelId, fileCount, approximateBytes }) => (
              <li key={modelId} className="settings-model-row">
                <div className="settings-model-info">
                  <span className="settings-model-id">{modelId}</span>
                  <span className="settings-model-meta">
                    {fileCount} file{fileCount !== 1 ? "s" : ""}
                    {approximateBytes ? ` · ${formatBytes(approximateBytes)}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="settings-delete-btn"
                  disabled={deletingIds.has(modelId)}
                  onClick={() => handleDeleteModel(modelId)}
                >
                  {deletingIds.has(modelId) ? "Removing…" : "Remove"}
                </button>
              </li>
            ))}
          </ul>
        )}

        {installedModels.length > 0 && (
          <button
            type="button"
            className="settings-danger-btn"
            disabled={clearingAll}
            onClick={handleClearAllCache}
          >
            {clearingAll ? "Clearing…" : "Clear all downloaded models"}
          </button>
        )}
      </div>
    </div>
  );
}

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

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setActiveTab("generation");
    }
  }, [open, settings]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [open]);

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
        onClick={(e) => e.stopPropagation()}
        onWheelCapture={(e) => e.stopPropagation()}
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
            <GenerationTab
              draft={draft}
              contextWindowTokens={contextWindowTokens}
              onChange={handleChange}
              onReset={() => setDraft(DEFAULT_APP_SETTINGS)}
            />
          )}
          {activeTab === "data" && (
            <DataTab
              storageStatus={storageStatus}
              storageWarning={storageWarning}
              onClearChatHistory={onClearChatHistory}
              onClearAllData={onClearAllData}
            />
          )}
          {activeTab === "models" && (
            <ModelsTab onClearAllDownloadedModels={onClearAllDownloadedModels} />
          )}
        </div>

        {activeTab === "generation" && (
          <footer className="settings-footer">
            <button type="button" className="secondary-button" onClick={onClose}>
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
          </footer>
        )}
      </section>
    </div>
  );
}

export default SettingsDialog;
