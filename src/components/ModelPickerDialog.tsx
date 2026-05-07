import { useDeferredValue } from "react";

import { useDialogScrollLock } from "../hooks/useDialogScrollLock";
import type {
  AudioTab,
  CompatibilityReport,
  ModelDescriptor,
  PickerTab,
  SearchFilters,
} from "../types";
import ModelCard from "./ModelCard";

type CategorizedModel = {
  category: {
    key: string;
    label: string;
    description: string;
  };
  models: Array<{ model: ModelDescriptor; compatibility: CompatibilityReport }>;
};

type ModelPickerDialogProps = {
  open: boolean;
  activeTab: PickerTab;
  curatedSections: CategorizedModel[];
  recentModels: Array<{
    model: ModelDescriptor;
    compatibility: CompatibilityReport;
  }>;
  searchQuery: string;
  searchFilters: SearchFilters;
  searchResults: Array<{
    model: ModelDescriptor;
    compatibility: CompatibilityReport;
  }>;
  searchLoading: boolean;
  searchError: string | null;
  loadingModelId: string | null;
  availableTabs?: PickerTab[];
  audioTask?: AudioTab;
  onClose: () => void;
  onTabChange: (tab: PickerTab) => void;
  onSearchQueryChange: (value: string) => void;
  onToggleFilter: (filter: keyof SearchFilters) => void;
  onLoadModel: (model: ModelDescriptor) => void;
  onAudioTaskChange?: (tab: AudioTab) => void;
};

const TAB_LABELS: Record<PickerTab, string> = {
  curated: "Curated",
  search: "Search",
  recent: "Recent",
};

const EMPTY_STATE_COPY: Record<PickerTab, string> = {
  curated: "No curated models are available.",
  recent: "Models you load successfully will appear here.",
  search:
    "Search by family or publisher, such as gemma, qwen, smollm, or onnx-community.",
};

function ModelPickerDialog({
  open,
  activeTab,
  curatedSections,
  recentModels,
  searchQuery,
  searchFilters,
  searchResults,
  searchLoading,
  searchError,
  loadingModelId,
  availableTabs = ["curated", "search", "recent"],
  audioTask,
  onClose,
  onTabChange,
  onSearchQueryChange,
  onToggleFilter,
  onLoadModel,
  onAudioTaskChange,
}: ModelPickerDialogProps) {
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const hasSearchQuery = deferredSearchQuery.trim().length > 0;
  const isAudioPicker = Boolean(audioTask && onAudioTaskChange);

  useDialogScrollLock(open);

  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="dialog-shell picker-shell"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a model"
        onClick={(event) => event.stopPropagation()}
        onWheelCapture={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div>
            <p className="section-label">Model Picker</p>
            <h2>Pick a model</h2>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        {isAudioPicker ? (
          <div
            className="dialog-tabs"
            role="tablist"
            aria-label="Audio model tasks"
          >
            <button
              className={`dialog-tab ${activeTab === "recent" ? "dialog-tab-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={activeTab === "recent"}
              onClick={() => onTabChange("recent")}
            >
              Recent
            </button>
            <button
              className={`dialog-tab ${activeTab !== "recent" && audioTask === "transcribe" ? "dialog-tab-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={activeTab !== "recent" && audioTask === "transcribe"}
              onClick={() => {
                onTabChange("curated");
                onAudioTaskChange("transcribe");
              }}
            >
              Transcribe
            </button>
            <button
              className={`dialog-tab ${activeTab !== "recent" && audioTask === "speak" ? "dialog-tab-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={activeTab !== "recent" && audioTask === "speak"}
              onClick={() => {
                onTabChange("curated");
                onAudioTaskChange("speak");
              }}
            >
              Speak
            </button>
          </div>
        ) : availableTabs.length > 0 ? (
          <div className="dialog-tabs" role="tablist" aria-label="Model tabs">
            {availableTabs.map((tab) => (
              <button
                key={tab}
                className={`dialog-tab ${tab === activeTab ? "dialog-tab-active" : ""}`}
                type="button"
                role="tab"
                aria-selected={tab === activeTab}
                onClick={() => onTabChange(tab)}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        ) : null}

        {!isAudioPicker && activeTab === "search" && (
          <section className="search-panel">
            <label className="search-input-wrap">
              <span className="sr-only">Search models</span>
              <input
                className="search-input"
                type="search"
                placeholder="Search model family or publisher..."
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
              />
            </label>
            <div className="search-filters">
              <button
                className={`filter-chip ${searchFilters.mobileSafe ? "filter-chip-active" : ""}`}
                type="button"
                onClick={() => onToggleFilter("mobileSafe")}
              >
                Mobile-safe
              </button>
              <button
                className={`filter-chip ${searchFilters.verifiedOnly ? "filter-chip-active" : ""}`}
                type="button"
                onClick={() => onToggleFilter("verifiedOnly")}
              >
                Verified only
              </button>
              <button
                className={`filter-chip ${searchFilters.showExperimental ? "filter-chip-active" : ""}`}
                type="button"
                onClick={() => onToggleFilter("showExperimental")}
              >
                Show experimental
              </button>
            </div>
          </section>
        )}

        <div className="dialog-content">
          {isAudioPicker && activeTab === "recent" && (
            <section className="picker-section">
              {recentModels.length === 0 ? (
                <div className="picker-empty">
                  <p>Audio models you load successfully will appear here.</p>
                </div>
              ) : (
                <>
                  <div className="picker-section-header">
                    <h3>Recent</h3>
                    <p>
                      Recently loaded audio models on this device. Loading one
                      will open the matching transcribe or speak workspace.
                    </p>
                  </div>
                  <div className="picker-grid">
                    {recentModels.map(({ model, compatibility }) => (
                      <ModelCard
                        key={model.id}
                        model={model}
                        compatibility={compatibility}
                        onLoad={onLoadModel}
                        loading={loadingModelId === model.id}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {((isAudioPicker && activeTab !== "recent") ||
            activeTab === "curated") &&
            curatedSections.map((section) => (
              <section key={section.category.key} className="picker-section">
                <div className="picker-section-header">
                  <h3>{section.category.label}</h3>
                  <p>{section.category.description}</p>
                </div>
                <div className="picker-grid">
                  {section.models.map(({ model, compatibility }) => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      compatibility={compatibility}
                      onLoad={onLoadModel}
                      loading={loadingModelId === model.id}
                    />
                  ))}
                </div>
              </section>
            ))}

          {!isAudioPicker && activeTab === "recent" && (
            <section className="picker-section">
              {recentModels.length === 0 ? (
                <div className="picker-empty">
                  <p>{EMPTY_STATE_COPY.recent}</p>
                </div>
              ) : (
                <div className="picker-grid">
                  {recentModels.map(({ model, compatibility }) => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      compatibility={compatibility}
                      onLoad={onLoadModel}
                      loading={loadingModelId === model.id}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === "search" && (
            <section className="picker-section">
              {!hasSearchQuery ? (
                <div className="picker-empty">
                  <p>{EMPTY_STATE_COPY.search}</p>
                </div>
              ) : searchLoading ? (
                <div className="picker-empty">
                  <p>Searching browser-compatible models…</p>
                </div>
              ) : searchError ? (
                <div className="picker-empty">
                  <p>{searchError}</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="picker-empty">
                  <p>
                    No browser-compatible results matched this query. Try gemma,
                    qwen, smollm, or turn on experimental models.
                  </p>
                </div>
              ) : (
                <div className="picker-grid">
                  {searchResults.map(({ model, compatibility }) => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      compatibility={compatibility}
                      onLoad={onLoadModel}
                      loading={loadingModelId === model.id}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </section>
    </div>
  );
}

export default ModelPickerDialog;
