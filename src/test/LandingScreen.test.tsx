import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LandingScreen from "../components/LandingScreen";
import { createModelDescriptor } from "./factories";

const createProps = () => ({
  mode: "audio" as const,
  recommendedModel: null,
  selectedSttModel: createModelDescriptor({
    id: "onnx-community/moonshine-base-ONNX",
    label: "Moonshine Base",
    task: "stt",
    category: "audio_recommended",
  }),
  selectedTtsModel: createModelDescriptor({
    id: "onnx-community/Supertonic-TTS-ONNX",
    label: "Supertonic TTS",
    task: "tts",
    category: "audio_recommended",
    runtime: {
      contextWindowTokens: 0,
      defaultVoice: "F1",
      voices: [{ id: "F1", label: "F1" }],
    },
  }),
  starterModels: [],
  audioStarterModels: {
    transcribe: [],
    speak: [],
  },
  loadingModelId: null,
  getStartedDisabled: false,
  globalMessage: null,
  onGetStarted: vi.fn(),
  onAudioGetStarted: vi.fn(),
  onSearchModels: vi.fn(),
  onTryTranscribe: vi.fn(),
  onTrySpeak: vi.fn(),
  onSelectChatModel: vi.fn(),
  onSelectTranscribeModel: vi.fn(),
  onSelectSpeakModel: vi.fn(),
});

afterEach(() => {
  cleanup();
});

describe("LandingScreen", () => {
  it("uses Audio naming and only two hero actions in audio mode", () => {
    render(<LandingScreen {...createProps()} />);

    expect(screen.getByText("Private Browser Audio")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Get Started" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Search Models" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Try Transcribe" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Try Speak" }),
    ).not.toBeInTheDocument();
  });

  it("keeps explicit entry points for opening transcribe and speak cards", () => {
    render(<LandingScreen {...createProps()} />);

    expect(screen.getAllByText("Open Transcribe").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Open Speak").length).toBeGreaterThan(0);
  });

  it("uses the dedicated audio get started action in audio mode", () => {
    const onGetStarted = vi.fn();
    const onAudioGetStarted = vi.fn();

    render(
      <LandingScreen
        {...createProps()}
        onGetStarted={onGetStarted}
        onAudioGetStarted={onAudioGetStarted}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Get Started" })[0]!);

    expect(onAudioGetStarted).toHaveBeenCalledTimes(1);
    expect(onGetStarted).not.toHaveBeenCalled();
  });
});
