import { useEffect, useState } from "react";

import { clearAllModelCache, deleteModelCache, getInstalledModels, type InstalledModelEntry } from "../cache";
import type { AppSettings } from "../types";
import { DEFAULT_APP_SETTINGS } from "../types";

type SettingsTab = "generation" | "data";

type SettingsDialogProps = {
  open: boolean;
  settings: AppSettings;
  contextWindowTokens: number | null;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
  onClearChatHistory: () => void;
  onClearAllData: () => void;
};

const TAB_LABELS: Record<SettingsTab, string> = {
  generation: "Generation",
  data: "Data",
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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
  const effectiveMax = draft.maxTokenMode === "percentage"
    ? draft.percentageMaxTokens
    : draft.staticMaxTokens;

  const previewTokens = contextWindowTokens
    ? Math.floor((contextWindowTokens * draft.percentageMaxTokens) / 100)
    : null;

  return (
    <div className="settings-section">
      {/* ── Temperature ── */}
      <div className="settings-field">
        <div className="settings-field-header">
          <label htmlFor="settings-temperature" className="settings-field-label">
            Temperature
          </label>
          <span className="settings-field-value">{draft.temperature.toFixed(2)}</span>
        </div>
        <p className="settings-field-description">
          Controls randomness. Lower values give more focused outputs; higher values introduce more variety.
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
          <span>Focused (0)</span>
          <span>Creative (2)</span>
        </div>
      </div>

      {/* ── Top-P ── */}
      <div className="settings-field">
        <div className="settings-field-header">
          <label htmlFor="settings-top-p" className="settings-field-label">
            Top-P (nucleus sampling)
          </label>
          <span className="settings-field-value">{draft.topP.toFixed(2)}</span>
        </div>
        <p className="settings-field-description">
          Limits sampling to the top tokens whose cumulative probability reaches P. Lower values tighten the token pool.
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
          <span>Tight (0.01)</span>
          <span>Open (1.0)</span>
        </div>
      </div>

      {/* ── Max output tokens ── */}
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
              Maximum tokens the model can produce in a single response.
            </p>
            <div className="settings-number-row">
              <input
                id="settings-static-tokens"
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
              Cap responses to a percentage of the loaded model's context window (max 20%).
              {contextWindowTokens && previewTokens !== null && (
                <> With the current model ({contextWindowTokens.toLocaleString()} tokens), this is <strong>≈{previewTokens.toLocaleString()} tokens</strong>.</>
              )}
            </p>
            <div className="settings-number-row">
              <input
                id="settings-percent-tokens"
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
          <>Effective limit: <strong>{draft.staticMaxTokens.toLocaleString()} tokens</strong></>
        ) : contextWindowTokens && previewTokens !== null ? (
          <>Effective limit: <strong>≈{previewTokens.toLocaleString()} tokens</strong> ({draft.percentageMaxTokens}% of {contextWindowTokens.toLocaleString()})</>
        ) : (
          <>Effective limit: <strong>{draft.percentageMaxTokens}%</strong> of model context</>
        )}
      </div>

      <button type="button" className="settings-reset-btn" onClick={onReset}>
        Reset to defaults
      </button>

      <p className="settings-note">
        Note: Temperature and Top-P affect all models uniformly. Max tokens applies per-response and is bounded by the loaded model's context window.
      </p>

      <div className="settings-void" style={{ height: effectiveMax > 0 ? "0" : "0" }} />
    </div>
  );
}

function DataTab({
  onClearChatHistory,
  onClearAllData,
}: {
  onClearChatHistory: () => void;
  onClearAllData: () => void;
}) {
  const [installedModels, setInstalledModels] = useState<InstalledModelEntry[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [clearingAll, setClearingAll] = useState(false);

  useEffect(() => {
    setLoadingModels(true);
    getInstalledModels()
      .then(setInstalledModels)
      .finally(() => setLoadingModels(false));
  }, []);

  const handleDeleteModel = async (modelId: string) => {
    setDeletingIds((prev) => new Set([...prev, modelId]));
    try {
      await deleteModelCache(modelId);
      setInstalledModels((prev) => prev.filter((m) => m.modelId !== modelId));
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
      setInstalledModels([]);
      onClearAllData();
    } finally {
      setClearingAll(false);
    }
  };

  return (
    <div className="settings-section">
      {/* ── Chat History ── */}
      <div className="settings-field">
        <div className="settings-field-header">
          <span className="settings-field-label">Chat history</span>
        </div>
        <p className="settings-field-description">
          Removes all saved conversations from this browser. Downloaded models are not affected.
        </p>
        <button type="button" className="settings-danger-btn" onClick={onClearChatHistory}>
          Clear chat history
        </button>
      </div>

      {/* ── Downloaded Models ── */}
      <div className="settings-field">
        <div className="settings-field-header">
          <span className="settings-field-label">Downloaded models</span>
        </div>
        <p className="settings-field-description">
          Models cached in your browser. Removing them frees up browser storage; they'll be re-downloaded on next use.
        </p>

        {loadingModels ? (
          <p className="settings-cache-loading">Scanning browser cache…</p>
        ) : installedModels.length === 0 ? (
          <p className="settings-cache-empty">No downloaded model files found in your browser cache.</p>
        ) : (
          <ul className="settings-model-list">
            {installedModels.map(({ modelId, fileCount }) => (
              <li key={modelId} className="settings-model-row">
                <div className="settings-model-info">
                  <span className="settings-model-id">{modelId}</span>
                  <span className="settings-model-meta">{fileCount} file{fileCount !== 1 ? "s" : ""}</span>
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

        {installedModels.length > 1 && (
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
  onClose,
  onSave,
  onClearChatHistory,
  onClearAllData,
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

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  const handleReset = () => {
    setDraft(DEFAULT_APP_SETTINGS);
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="dialog-shell"
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
              onReset={handleReset}
            />
          )}
          {activeTab === "data" && (
            <DataTab
              onClearChatHistory={onClearChatHistory}
              onClearAllData={onClearAllData}
            />
          )}
        </div>

        {activeTab === "generation" && (
          <footer className="settings-footer">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="primary-button" onClick={handleSave}>
              Save settings
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}

export default SettingsDialog;
