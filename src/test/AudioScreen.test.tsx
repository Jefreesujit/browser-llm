import { cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AudioScreen from "../components/AudioScreen";
import { createModelDescriptor } from "./factories";

const createAudioProps = () => ({
  activeTab: "transcribe" as const,
  selectedModel: createModelDescriptor({
    task: "stt",
    runtime: {
      contextWindowTokens: 4096,
      supportsTimestamps: true,
      voices: [
        { id: "f1", label: "F1" },
        { id: "f2", label: "F2" },
      ],
    },
  }),
  appState: "ready" as const,
  progress: null,
  error: null,
  taskBusy: false,
  taskStatus: null,
  isRecording: false,
  recordingLevels: [0.2, 0.65, 0.4],
  recordingDurationMs: 12500,
  audioInputLabel: null,
  transcriptText: "",
  transcriptChunks: [],
  showTimestamps: false,
  timestampsEnabled: false,
  speakText: "",
  selectedVoice: "f1",
  speakSpeed: 1,
  audioUrl: null,
  audioDurationSec: null,
  audioUploadRef: createRef<HTMLInputElement>(),
  onSwitchTab: vi.fn(),
  onChangeModel: vi.fn(),
  onStartRecording: vi.fn(),
  onStopRecording: vi.fn(),
  onBrowseAudio: vi.fn(),
  onAudioFileChange: vi.fn(),
  onToggleTimestamps: vi.fn(),
  onCopyTranscript: vi.fn(),
  onDownloadTranscript: vi.fn(),
  onUseInSpeak: vi.fn(),
  onSpeakTextChange: vi.fn(),
  onVoiceChange: vi.fn(),
  onSpeedChange: vi.fn(),
  onGenerateSpeech: vi.fn(),
  onDownloadAudio: vi.fn(),
});

afterEach(() => {
  cleanup();
});

describe("AudioScreen", () => {
  it("uses compact one-line action labels in the transcribe header", () => {
    render(<AudioScreen {...createAudioProps()} />);

    expect(screen.getByRole("button", { name: "Record" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Record with Microphone" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Upload Audio" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Download .txt" }),
    ).not.toBeInTheDocument();
  });

  it("hides upload while recording and shows stop in the transcribe header", () => {
    render(
      <AudioScreen
        {...createAudioProps()}
        isRecording
        recordingDurationMs={8400}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Stop Recording" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Upload" }),
    ).not.toBeInTheDocument();
  });

  it("uses the generate button state instead of a global top status message", () => {
    render(
      <AudioScreen
        {...createAudioProps()}
        activeTab="speak"
        selectedModel={createModelDescriptor({
          task: "tts",
          runtime: {
            contextWindowTokens: 4096,
            voices: [{ id: "f1", label: "F1" }],
          },
        })}
        taskBusy
        taskStatus="Generating speech"
        speakText="Turn this into audio."
      />,
    );

    expect(
      screen.getByRole("button", { name: "Generating..." }),
    ).toBeDisabled();
    expect(screen.getByText(/audio preview will appear here/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download Audio" }),
    ).toHaveClass("primary-button");
    expect(screen.queryByText("Generating speech")).not.toBeInTheDocument();
  });

  it("shows transcript processing feedback in the output pane and avoids file-name copy", () => {
    render(
      <AudioScreen
        {...createAudioProps()}
        taskBusy
        taskStatus="Preparing transcription"
        audioInputLabel="microphone-recording.wav"
      />,
    );

    expect(
      screen.getByText(/transcription is processing/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("microphone-recording.wav")).not.toBeInTheDocument();
  });

  it("shows a specific post-run transcript status instead of the generic empty prompt", () => {
    render(
      <AudioScreen
        {...createAudioProps()}
        taskStatus="No speech was detected in that clip. Try recording closer to the microphone or upload a clearer file."
      />,
    );

    expect(
      screen.getByDisplayValue(/No speech was detected in that clip/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByDisplayValue(/No transcript yet\. Record audio or upload a file to get started\./i),
    ).not.toBeInTheDocument();
  });

  it("keeps the toolbar outside a dedicated workspace scroll region", () => {
    const { container } = render(<AudioScreen {...createAudioProps()} />);

    expect(container.querySelector(".audio-toolbar")).toBeInTheDocument();
    expect(container.querySelector(".audio-mode-tabs")).toBeInTheDocument();
    expect(container.querySelector(".audio-workspace-scroll")).toBeInTheDocument();
  });
});
