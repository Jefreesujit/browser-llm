import type { ChangeEvent, RefObject } from "react";

import type {
  AudioTab,
  AudioTranscriptionChunk,
  ModelDescriptor,
  ModelLoadProgress,
  ModelLoadState,
} from "../types";

type AudioScreenProps = {
  activeTab: AudioTab;
  selectedModel: ModelDescriptor;
  appState: ModelLoadState;
  progress: ModelLoadProgress;
  error: string | null;
  taskBusy: boolean;
  taskStatus: string | null;
  isRecording: boolean;
  recordingLevels: number[];
  recordingDurationMs: number;
  audioInputLabel: string | null;
  transcriptText: string;
  transcriptChunks: AudioTranscriptionChunk[];
  showTimestamps: boolean;
  timestampsEnabled: boolean;
  speakText: string;
  selectedVoice: string;
  speakSpeed: number;
  audioUrl: string | null;
  audioDurationSec: number | null;
  audioUploadRef: RefObject<HTMLInputElement | null>;
  onSwitchTab: (tab: AudioTab) => void;
  onChangeModel: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onBrowseAudio: () => void;
  onAudioFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onToggleTimestamps: (enabled: boolean) => void;
  onCopyTranscript: () => void;
  onDownloadTranscript: () => void;
  onUseInSpeak: () => void;
  onSpeakTextChange: (value: string) => void;
  onVoiceChange: (voice: string) => void;
  onSpeedChange: (speed: number) => void;
  onGenerateSpeech: () => void;
  onDownloadAudio: () => void;
};

const formatDuration = (seconds: number | null) => {
  if (!seconds || Number.isNaN(seconds)) {
    return null;
  }

  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
};

function AudioScreen({
  activeTab,
  selectedModel,
  appState,
  progress,
  error,
  taskBusy,
  taskStatus,
  isRecording,
  recordingLevels,
  recordingDurationMs,
  audioInputLabel,
  transcriptText,
  transcriptChunks,
  showTimestamps,
  timestampsEnabled,
  speakText,
  selectedVoice,
  speakSpeed,
  audioUrl,
  audioDurationSec,
  audioUploadRef,
  onSwitchTab,
  onChangeModel,
  onStartRecording,
  onStopRecording,
  onBrowseAudio,
  onAudioFileChange,
  onToggleTimestamps,
  onCopyTranscript,
  onDownloadTranscript,
  onUseInSpeak,
  onSpeakTextChange,
  onVoiceChange,
  onSpeedChange,
  onGenerateSpeech,
  onDownloadAudio,
}: AudioScreenProps) {
  const interactionLocked = taskBusy || isRecording;
  const canGenerateSpeech =
    appState === "ready" && !taskBusy && !isRecording && speakText.trim().length > 0;
  const modelStatus = error
    ? {
        label: "Failed",
        className: "model-switcher-status model-switcher-status-error",
      }
    : appState === "ready"
      ? {
          label: interactionLocked ? "Running" : "Live",
          className: "model-switcher-status model-switcher-status-live",
        }
      : progress?.loaded && progress.total
        ? {
            label: "Loading",
            className: "model-switcher-status model-switcher-status-loading",
          }
        : {
            label: "Preparing",
            className: "model-switcher-status model-switcher-status-loading",
          };
  const durationLabel = formatDuration(audioDurationSec);
  const recordingDurationLabel = formatDuration(recordingDurationMs / 1000);
  const progressLabel =
    typeof progress?.progress === "number"
      ? `${Math.round(progress.progress)}%`
      : null;
  const isTranscriptionProcessing = taskBusy && activeTab === "transcribe";
  const isSpeechGenerating = taskBusy && activeTab === "speak";
  const transcribePlaceholder = isRecording
    ? "Recording in progress. Stop recording to generate the transcript."
    : taskBusy
      ? progressLabel
        ? `${progressLabel} downloaded`
        : "Transcription is processing. The transcript will appear here once it finishes."
      : taskStatus ?? "No transcript yet. Record audio or upload a file to get started.";
  const speechOutputPlaceholder = taskBusy
    ? "Speech generation is in progress. Your audio preview will appear here when it is ready."
    : "No generated speech yet. Paste some text and generate audio.";
  const generateSpeechLabel = taskBusy ? "Generating..." : "Generate Speech";
  const waveformHeightForLevel = (level: number) =>
    `${Math.min(100, Math.max(24, Math.round(level * 180)))}%`;

  return (
    <section className="panel app-panel audio-workspace-panel">
      <div className="audio-workspace-content">
        <header className="audio-toolbar">
          <div className="audio-toolbar-copy">
            <p className="section-label">
              Voice Workspace
            </p>
            <h2>{activeTab === "transcribe" ? "Transcribe" : "Speak"}</h2>
            <p className="audio-toolbar-copy-text">
              {activeTab === "transcribe"
                ? "Record or upload audio and turn it into text in your browser."
                : "Paste text, pick a voice, and generate speech locally."}
            </p>
          </div>

          <div className="audio-toolbar-actions">
            <div className="model-switcher-wrap">
              <button
                className="secondary-button model-switcher"
                type="button"
                onClick={onChangeModel}
                disabled={interactionLocked}
              >
                <span className={modelStatus.className}>
                  <span className="model-switcher-dot" aria-hidden="true" />
                  {modelStatus.label}
                </span>
                <span className="model-switcher-name">
                  {selectedModel.label}
                </span>
                <span className="model-switcher-caret" aria-hidden="true">
                  ▾
                </span>
              </button>
            </div>
          </div>
        </header>

        <div
          className="audio-mode-tabs"
          role="tablist"
          aria-label="Audio tasks"
        >
          <button
            className={`audio-mode-tab ${activeTab === "transcribe" ? "audio-mode-tab-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "transcribe"}
            onClick={() => onSwitchTab("transcribe")}
            disabled={interactionLocked}
          >
            Transcribe
          </button>
          <button
            className={`audio-mode-tab ${activeTab === "speak" ? "audio-mode-tab-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "speak"}
            onClick={() => onSwitchTab("speak")}
            disabled={interactionLocked}
          >
            Speak
          </button>
        </div>

        {error && <p className="audio-task-error">{error}</p>}

        {activeTab === "transcribe" ? (
          <section className="audio-content-grid">
            <div className="audio-panel-card">
              <div className="audio-panel-header">
                <div className="audio-panel-header-copy">
                  <p className="section-label">Input</p>
                  <h2>Audio input</h2>
                </div>
                <div className="audio-panel-actions">
                  {isRecording ? (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={onStopRecording}
                    >
                      Stop Recording
                    </button>
                  ) : (
                    <>
                      <button
                        className="primary-button"
                        type="button"
                        onClick={onStartRecording}
                        disabled={appState !== "ready" || interactionLocked}
                      >
                        Record
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={onBrowseAudio}
                        disabled={appState !== "ready" || interactionLocked}
                      >
                        Upload
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="audio-panel-body">
                <div className="audio-source-stage">
                  {isRecording ? (
                    <div className="audio-recording-monitor" role="status">
                      <div className="audio-recording-header">
                        <span className="audio-recording-badge">
                          <span
                            className="audio-recording-dot"
                            aria-hidden="true"
                          />
                          Recording
                        </span>
                        <span className="audio-recording-time">
                          {recordingDurationLabel ?? "0.0s"}
                        </span>
                      </div>

                      <div className="audio-waveform" aria-hidden="true">
                        {recordingLevels.map((level, index) => (
                          <span
                            key={`recording-wave-${index}`}
                            className="audio-wave-bar"
                            style={{
                              height: waveformHeightForLevel(level),
                            }}
                          />
                        ))}
                      </div>

                      <p className="audio-source-label">
                        The live meter reacts to your microphone input while the
                        recorder is active.
                      </p>
                    </div>
                  ) : audioInputLabel ? (
                    <div className="audio-source-summary">
                      <strong>Audio source ready</strong>
                      <span>
                        Record again or upload a different file whenever you
                        want to replace the current source.
                      </span>
                    </div>
                  ) : (
                    <div className="audio-empty-state audio-empty-state-inline">
                      No audio source selected yet. Record with the microphone
                      or upload a file to begin.
                    </div>
                  )}
                </div>

                <input
                  ref={audioUploadRef}
                  className="sr-only"
                  type="file"
                  accept="audio/*"
                  onChange={onAudioFileChange}
                />

                {selectedModel.runtime.supportsTimestamps && (
                  <label className="audio-toggle">
                    <input
                      type="checkbox"
                      checked={timestampsEnabled}
                      onChange={(event) =>
                        onToggleTimestamps(event.target.checked)
                      }
                      disabled={interactionLocked || appState !== "ready"}
                    />
                    <span>Include timestamps</span>
                  </label>
                )}
              </div>
            </div>

            <div className="audio-panel-card">
              <div className="audio-panel-header">
                <div className="audio-panel-header-copy">
                  <p className="section-label">Output</p>
                  <h2>Audio to text</h2>
                </div>
                <div className="audio-panel-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={onCopyTranscript}
                    disabled={!transcriptText}
                  >
                    Copy
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={onDownloadTranscript}
                    disabled={!transcriptText}
                  >
                    Download
                  </button>
                </div>
              </div>

              <div className="audio-panel-body">
                {isRecording || isTranscriptionProcessing ? (
                  <div className="audio-processing-state">
                    <div
                      className={`audio-processing-indicator ${isRecording ? "audio-processing-indicator-recording" : ""}`}
                      aria-hidden="true"
                    />
                    <div className="audio-processing-copy">
                      <strong>
                        {isRecording
                          ? "Recording in progress"
                          : "Generating transcript"}
                      </strong>
                      <span>{transcribePlaceholder}</span>
                    </div>
                  </div>
                ) : (
                  <textarea
                    className="audio-output-textarea"
                    readOnly
                    value={transcriptText || transcribePlaceholder}
                  />
                )}

                <div className="audio-panel-actions audio-panel-actions-bottom">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={onUseInSpeak}
                    disabled={!transcriptText}
                  >
                    Use in Speak
                  </button>
                </div>

                {showTimestamps && transcriptChunks.length > 0 && (
                  <div
                    className="timestamp-list"
                    aria-label="Transcript timestamps"
                  >
                    {transcriptChunks.map((chunk, index) => (
                      <div
                        key={`${chunk.timestamp.join("-")}-${index}`}
                        className="timestamp-row"
                      >
                        <span>
                          {chunk.timestamp[0].toFixed(1)}s -{" "}
                          {chunk.timestamp[1].toFixed(1)}s
                        </span>
                        <span>{chunk.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="audio-content-grid">
            <div className="audio-panel-card">
              <div className="audio-panel-header">
                <div className="audio-panel-header-copy">
                  <p className="section-label">Input</p>
                  <h2>Text to audio</h2>
                </div>
                <div className="audio-panel-actions">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={onGenerateSpeech}
                    disabled={!canGenerateSpeech}
                  >
                    {generateSpeechLabel}
                  </button>
                </div>
              </div>

              <div className="audio-panel-body">
                <textarea
                  className="audio-input-textarea"
                  value={speakText}
                  onChange={(event) => onSpeakTextChange(event.target.value)}
                  placeholder="Paste or type the text you want to turn into speech..."
                  disabled={interactionLocked}
                />

                <div className="audio-form-grid">
                  <label className="audio-field">
                    <span>Voice</span>
                    <select
                      value={selectedVoice}
                      onChange={(event) => onVoiceChange(event.target.value)}
                      disabled={interactionLocked}
                    >
                      {(selectedModel.runtime.voices ?? []).map((voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voice.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="audio-field">
                    <span>Speed</span>
                    <input
                      type="range"
                      min="0.8"
                      max="1.2"
                      step="0.05"
                      value={speakSpeed}
                      onChange={(event) =>
                        onSpeedChange(Number(event.target.value))
                      }
                      disabled={interactionLocked}
                    />
                    <span className="audio-field-value">
                      {speakSpeed.toFixed(2)}x
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="audio-panel-card">
              <div className="audio-panel-header">
                <div className="audio-panel-header-copy">
                  <p className="section-label">Output</p>
                  <h2>Generated speech</h2>
                </div>
                <div className="audio-panel-actions">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={onDownloadAudio}
                    disabled={!audioUrl}
                  >
                    Download Audio
                  </button>
                </div>
              </div>

              <div className="audio-panel-body">
                {isSpeechGenerating ? (
                  <div className="audio-processing-state">
                    <div
                      className="audio-processing-indicator"
                      aria-hidden="true"
                    />
                    <div className="audio-processing-copy">
                      <strong>Generating audio</strong>
                      <span>{speechOutputPlaceholder}</span>
                    </div>
                  </div>
                ) : audioUrl ? (
                  <div className="audio-player-card">
                    <audio controls src={audioUrl} className="audio-player" />
                    {durationLabel && (
                      <p className="audio-source-label">
                        Duration: {durationLabel}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="audio-empty-state">
                    {speechOutputPlaceholder}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </section>
  );
}

export default AudioScreen;
