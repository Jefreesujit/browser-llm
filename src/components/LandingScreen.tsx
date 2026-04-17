import type { ModelDescriptor, WorkspaceMode } from "../types";
import StarterCard from "./StarterCard";

type LandingScreenProps = {
  mode: WorkspaceMode;
  recommendedModel: ModelDescriptor | null;
  selectedSttModel: ModelDescriptor;
  selectedTtsModel: ModelDescriptor;
  starterModels: Array<{
    model: ModelDescriptor;
    compatibility: ModelDescriptor["compatibility"];
  }>;
  audioStarterModels: {
    transcribe: Array<{
      model: ModelDescriptor;
      compatibility: ModelDescriptor["compatibility"];
    }>;
    speak: Array<{
      model: ModelDescriptor;
      compatibility: ModelDescriptor["compatibility"];
    }>;
  };
  loadingModelId: string | null;
  getStartedDisabled: boolean;
  globalMessage?: string | null;
  onGetStarted: () => void;
  onSearchModels: () => void;
  onTryTranscribe: () => void;
  onTrySpeak: () => void;
  onSelectChatModel: (model: ModelDescriptor) => void;
  onSelectTranscribeModel: (model: ModelDescriptor) => void;
  onSelectSpeakModel: (model: ModelDescriptor) => void;
};

function LandingScreen({
  mode,
  recommendedModel,
  selectedSttModel,
  selectedTtsModel,
  starterModels,
  audioStarterModels,
  loadingModelId,
  getStartedDisabled,
  globalMessage,
  onGetStarted,
  onSearchModels,
  onTryTranscribe,
  onTrySpeak,
  onSelectChatModel,
  onSelectTranscribeModel,
  onSelectSpeakModel,
}: LandingScreenProps) {
  return (
    <section className="panel landing-panel">
      <header className="landing-hero">
        <div className="topbar landing-topbar">
          <div className="topbar-copy">
            <p className="eyebrow">
              {mode === "chat" ? "Private Browser Chat" : "Private Browser Voice"}
            </p>
            <h1 className="landing-title">
              {mode === "chat" ? (
                <>
                  <span>Private chat AI</span>
                  <span>in your browser.</span>
                </>
              ) : (
                <>
                  <span>Private audio AI</span>
                  <span>in your browser.</span>
                </>
              )}
            </h1>
            <p className="lede">
              {mode === "chat"
                ? "Choose a browser-ready model for local chat. No signup, no API key, and no inference requests leaving your device."
                : "Record audio, upload a file, or generate speech entirely in the browser. No API key and no audio sent to a server."}
            </p>
            <div className="landing-highlights" aria-label="Feature highlights">
              <span>Free to use</span>
              <span>Private on-device inference</span>
              {mode === "chat" ? (
                <>
                  <span>Chat and vision models</span>
                  <span>No API key</span>
                </>
              ) : (
                <>
                  <span>Speech and transcription</span>
                  <span>Local microphone processing</span>
                </>
              )}
            </div>
            {mode === "chat" && recommendedModel && (
              <p className="recommended-summary">
                Start with: {recommendedModel.label}
              </p>
            )}
            {mode === "audio" && (
              <p className="recommended-summary">
                Defaults: {selectedSttModel.label} for transcription and{" "}
                {selectedTtsModel.label} for speech.
              </p>
            )}
            {globalMessage && (
              <p className="recommended-summary error-text">{globalMessage}</p>
            )}
          </div>

          <div className="landing-actions landing-topbar-actions">
            {mode === "chat" ? (
              <>
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
                  onClick={onSearchModels}
                >
                  Search Models
                </button>
              </>
            ) : (
              <>
                <button
                  className="primary-button landing-button"
                  type="button"
                  onClick={onTryTranscribe}
                >
                  Try Transcribe
                </button>
                <button
                  className="secondary-button landing-button"
                  type="button"
                  onClick={onTrySpeak}
                >
                  Try Speak
                </button>
                <button
                  className="secondary-button landing-button"
                  type="button"
                  onClick={onSearchModels}
                >
                  Search Models
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {mode === "chat" ? (
        <>
          <section className="starter-section">
            <div className="starter-copy">
              <p className="section-label">Starter Models</p>
              <p className="section-copy">
                Start with a fast default, a stronger everyday model, coding
                help, reasoning, or a curated vision model.
              </p>
            </div>
            <div className="starter-grid">
              {starterModels.map(({ model, compatibility }) => (
                <StarterCard
                  key={model.id}
                  model={model}
                  onLoad={onSelectChatModel}
                  loading={loadingModelId === model.id}
                  disabled={!compatibility?.canLoad}
                />
              ))}
            </div>
            <p className="landing-note">
              We only surface browser-ready models in the default picker.
              Unsupported repos stay filtered out unless you explicitly search
              for more.
            </p>
          </section>
        </>
      ) : (
        <section className="audio-landing-section">
          <div className="audio-landing-grid">
            <button
              className="audio-landing-card"
              type="button"
              onClick={onTryTranscribe}
            >
              <p className="section-label">Transcribe</p>
              <h2>Audio to text</h2>
              <p>
                Record with the microphone or upload an audio file and keep the
                transcript local.
              </p>
              <div className="audio-landing-card-footer">
                <span>{selectedSttModel.label}</span>
                <span>Open Transcribe</span>
              </div>
            </button>

            <button
              className="audio-landing-card"
              type="button"
              onClick={onTrySpeak}
            >
              <p className="section-label">Speak</p>
              <h2>Text to audio</h2>
              <p>
                Paste text, pick a voice, and generate browser-local speech with
                a matching output panel.
              </p>
              <div className="audio-landing-card-footer">
                <span>{selectedTtsModel.label}</span>
                <span>Open Speak</span>
              </div>
            </button>
          </div>

          <section className="starter-section audio-starter-section">
            <div className="starter-copy">
              <p className="section-label">Transcribe Starters</p>
              <p className="section-copy">
                Quick local transcription models you can load before opening
                the recorder or file upload flow.
              </p>
            </div>
            <div className="starter-grid">
              {audioStarterModels.transcribe.map(({ model, compatibility }) => (
                <StarterCard
                  key={model.id}
                  model={model}
                  onLoad={onSelectTranscribeModel}
                  loading={loadingModelId === model.id}
                  disabled={!compatibility?.canLoad}
                />
              ))}
            </div>
          </section>

          <section className="starter-section audio-starter-section">
            <div className="starter-copy">
              <p className="section-label">Speak Starters</p>
              <p className="section-copy">
                Browser-ready speech models for local voice generation with a
                few quick defaults up front.
              </p>
            </div>
            <div className="starter-grid">
              {audioStarterModels.speak.map(({ model, compatibility }) => (
                <StarterCard
                  key={model.id}
                  model={model}
                  onLoad={onSelectSpeakModel}
                  loading={loadingModelId === model.id}
                  disabled={!compatibility?.canLoad}
                />
              ))}
            </div>
          </section>

          <p className="landing-note">
            Use the model picker to swap the active speech model, and use
            Settings to clear downloaded model files if you need to reload a
            broken runtime.
          </p>
        </section>
      )}
    </section>
  );
}

export default LandingScreen;
