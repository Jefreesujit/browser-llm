import type { AppSettings } from "../../types";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type GenerationSettingsTabProps = {
  draft: AppSettings;
  contextWindowTokens: number | null;
  onChange: (patch: Partial<AppSettings>) => void;
  onReset: () => void;
};

function GenerationSettingsTab({
  draft,
  contextWindowTokens,
  onChange,
  onReset,
}: GenerationSettingsTabProps) {
  const previewTokens = contextWindowTokens
    ? Math.floor((contextWindowTokens * draft.percentageMaxTokens) / 100)
    : null;

  return (
    <div className="settings-section">
      <div className="settings-field">
        <div className="settings-field-header">
          <label
            htmlFor="settings-temperature"
            className="settings-field-label"
          >
            Temperature
          </label>
          <span className="settings-field-value">
            {draft.temperature.toFixed(2)}
          </span>
        </div>
        <p className="settings-field-description">
          Lower values keep responses tighter. Higher values make outputs more
          varied.
        </p>
        <input
          id="settings-temperature"
          className="settings-slider"
          type="range"
          min={0}
          max={2}
          step={0.01}
          value={draft.temperature}
          onChange={(event) =>
            onChange({ temperature: parseFloat(event.target.value) })
          }
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
          Limits sampling to the highest-probability tokens until the cumulative
          mass reaches P.
        </p>
        <input
          id="settings-top-p"
          className="settings-slider"
          type="range"
          min={0.01}
          max={1}
          step={0.01}
          value={draft.topP}
          onChange={(event) =>
            onChange({ topP: parseFloat(event.target.value) })
          }
        />
        <div className="settings-slider-labels">
          <span>Tight</span>
          <span>Open</span>
        </div>
      </div>

      <div className="settings-field">
        <div className="settings-field-header">
          <span className="settings-field-label">Max response tokens</span>
          <div
            className="settings-token-mode-toggle"
            role="group"
            aria-label="Token mode"
          >
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
                onChange={(event) =>
                  onChange({
                    staticMaxTokens: clamp(
                      parseInt(event.target.value, 10) || 64,
                      64,
                      32768,
                    ),
                  })
                }
              />
              <span className="settings-number-unit">tokens</span>
            </div>
          </>
        ) : (
          <>
            <p className="settings-field-description">
              Use a percentage of the model context window for the maximum
              response length.
            </p>
            <div className="settings-number-row">
              <input
                className="settings-slider"
                type="range"
                min={1}
                max={20}
                step={1}
                value={draft.percentageMaxTokens}
                onChange={(event) =>
                  onChange({
                    percentageMaxTokens: clamp(
                      parseInt(event.target.value, 10),
                      1,
                      20,
                    ),
                  })
                }
              />
              <span className="settings-number-unit">
                {draft.percentageMaxTokens}%
              </span>
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
            Effective limit:{" "}
            <strong>{draft.staticMaxTokens.toLocaleString()} tokens</strong>
          </>
        ) : contextWindowTokens && previewTokens !== null ? (
          <>
            Effective limit:{" "}
            <strong>≈{previewTokens.toLocaleString()} tokens</strong>
          </>
        ) : (
          <>
            Effective limit:{" "}
            <strong>{draft.percentageMaxTokens}% of context</strong>
          </>
        )}
      </div>

      <button type="button" className="settings-reset-btn" onClick={onReset}>
        Reset to defaults
      </button>
    </div>
  );
}

export default GenerationSettingsTab;
