import { useEffect, useState } from "react";

import type { AppSettings } from "../types";
import { DEFAULT_APP_SETTINGS } from "../types";
import GenerationSettingsTab from "./settings/GenerationSettingsTab";

type SettingsPageProps = {
  open: boolean;
  settings: AppSettings;
  contextWindowTokens: number | null;
  githubUrl?: string;
  onSave: (settings: AppSettings) => void;
};

function SettingsPage({
  open,
  settings,
  contextWindowTokens,
  githubUrl,
  onSave,
}: SettingsPageProps) {
  const [draft, setDraft] = useState<AppSettings>(settings);

  useEffect(() => {
    if (open) {
      setDraft(settings);
    }
  }, [open, settings]);

  if (!open) {
    return null;
  }

  const handleChange = (patch: Partial<AppSettings>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  return (
    <section className="panel settings-page" aria-label="Settings">
      <div className="settings-page-shell">
        <header className="settings-page-header">
          <div>
            <p className="section-label">Configuration</p>
            <h2>Settings</h2>
            <p className="settings-page-copy">
              Manage generation defaults without mixing in storage cleanup or
              model cache controls.
            </p>
          </div>
        </header>

        <div className="settings-page-content">
          <section className="settings-surface-section">
            <div className="settings-surface-header">
              <p className="section-label">Generation</p>
              <h3>Response defaults</h3>
              <p>
                Tune how chat replies are sampled and how much context each
                reply can consume.
              </p>
            </div>
            <GenerationSettingsTab
              draft={draft}
              contextWindowTokens={contextWindowTokens}
              onChange={handleChange}
              onReset={() => setDraft(DEFAULT_APP_SETTINGS)}
            />
          </section>

          {githubUrl && (
            <div className="settings-external-actions">
              <a
                className="secondary-button settings-github-link"
                href={githubUrl}
                target="_blank"
                rel="noreferrer"
              >
                View project on GitHub
              </a>
            </div>
          )}
        </div>

        <footer className="settings-footer">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              onSave(draft);
            }}
          >
            Save settings
          </button>
        </footer>
      </div>
    </section>
  );
}

export default SettingsPage;
