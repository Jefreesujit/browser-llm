import type { ModelDescriptor } from "../types";
import type { PickerTab } from "../types";
import StarterCard from "./StarterCard";

type LandingScreenProps = {
  recommendedModel: ModelDescriptor | null;
  starterModels: Array<{
    model: ModelDescriptor;
    compatibility: ModelDescriptor["compatibility"];
  }>;
  loadingModelId: string | null;
  getStartedDisabled: boolean;
  globalMessage?: string | null;
  onGetStarted: () => void;
  onOpenPicker: (tab: PickerTab) => void;
  onSelectModel: (model: ModelDescriptor) => void;
};

function LandingScreen({
  recommendedModel,
  starterModels,
  loadingModelId,
  getStartedDisabled,
  globalMessage,
  onGetStarted,
  onOpenPicker,
  onSelectModel,
}: LandingScreenProps) {
  return (
    <main className="shell">
      <section className="panel landing-panel">
        <header className="topbar landing-topbar">
          <div className="topbar-copy">
            <p className="eyebrow">Browser LLM Chat</p>
            <h1 className="landing-title">
              <span>Free private LLM chat</span>
              <span>in your browser.</span>
            </h1>
            <p className="lede">
              Choose a browser-ready model and start chatting in seconds. No signup, no API key,
              and no inference requests leaving your device.
            </p>
            <div className="landing-highlights" aria-label="Feature highlights">
              <span>Free to use</span>
              <span>Private on-device chat</span>
              <span>No API key</span>
              <span>No inference API calls</span>
            </div>
            {recommendedModel && <p className="recommended-summary">Start with: {recommendedModel.label}</p>}
            {globalMessage && <p className="recommended-summary error-text">{globalMessage}</p>}
          </div>
          <div className="landing-actions">
            <button
              className="primary-button landing-button"
              type="button"
              onClick={onGetStarted}
              disabled={getStartedDisabled}
            >
              Get Started
            </button>
            <button
              className="secondary-button landing-button"
              type="button"
              onClick={() => onOpenPicker("curated")}
            >
              Available Models
            </button>
            <button
              className="secondary-button landing-button"
              type="button"
              onClick={() => onOpenPicker("search")}
            >
              Search Models
            </button>
          </div>
        </header>

        <section className="starter-section">
          <div className="starter-copy">
            <p className="section-label">Starter Models</p>
            <p className="section-copy">
              Start with a fast default, a stronger everyday model, coding help, reasoning, or a
              curated vision model.
            </p>
          </div>
          <div className="starter-grid">
            {starterModels.map(({ model, compatibility }) => (
              <StarterCard
                key={model.id}
                model={model}
                onLoad={onSelectModel}
                loading={loadingModelId === model.id}
                disabled={!compatibility?.canLoad}
              />
            ))}
          </div>
          <p className="landing-note">
            We only surface browser-ready models in the default picker. Unsupported repos stay
            filtered out unless you explicitly search for more.
          </p>
        </section>
      </section>
    </main>
  );
}

export default LandingScreen;
