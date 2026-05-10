import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ModelPickerDialog from "../components/ModelPickerDialog";
import type { AudioTab, PickerTab } from "../types";
import { createModelDescriptor } from "./factories";

const createCompatibility = () => ({
  verdict: "verified" as const,
  badgeLabel: "Verified",
  reason: "Ready to load.",
  canLoad: true,
});

const createModel = (overrides: Parameters<typeof createModelDescriptor>[0]) => {
  const model = createModelDescriptor(overrides);

  return {
    model,
    compatibility: createCompatibility(),
  };
};

afterEach(() => {
  cleanup();
});

const createAudioProps = (
  overrides: Partial<{
    audioTask: AudioTab;
    onAudioTaskChange: (tab: AudioTab) => void;
    onTabChange: (tab: PickerTab) => void;
  }> = {},
) => ({
  open: true,
  activeTab: "recent" as const,
  curatedSections: [
    {
      category: {
        key: "audio_recommended",
        label: "Recommended",
        description: "Best first-run audio models.",
      },
      models: [
        createModel({
          id: "onnx-community/moonshine-base-ONNX",
          label: "Moonshine Base",
          task: "stt",
          category: "audio_recommended",
        }),
      ],
    },
  ],
  recentModels: [
    createModel({
      id: "onnx-community/lite-whisper-large-v3-turbo-acc-ONNX",
      label: "Lite-Whisper Large v3 Turbo",
      task: "stt",
      category: "audio_desktop_experimental",
    }),
  ],
  searchQuery: "",
  searchFilters: {
    mobileSafe: false,
    verifiedOnly: false,
    showExperimental: false,
  },
  searchResults: [],
  searchLoading: false,
  searchError: null,
  loadingModelId: null,
  availableTabs: [],
  audioTask: "transcribe" as const,
  onClose: vi.fn(),
  onTabChange: vi.fn(),
  onSearchQueryChange: vi.fn(),
  onToggleFilter: vi.fn(),
  onLoadModel: vi.fn(),
  onAudioTaskChange: vi.fn(),
  ...overrides,
});

describe("ModelPickerDialog", () => {
  it("shows task tabs instead of a curated tab for audio models", () => {
    render(<ModelPickerDialog {...createAudioProps()} />);

    expect(screen.getByRole("tab", { name: "Recent" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Transcribe" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Speak" })).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Curated" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Recent" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/recently loaded audio models on this device/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Lite-Whisper Large v3 Turbo")).toBeInTheDocument();
    expect(screen.queryByText("Moonshine Base")).not.toBeInTheDocument();
  });

  it("switches the active audio task from the picker tabs", () => {
    const onAudioTaskChange = vi.fn();

    render(
      <ModelPickerDialog
        {...createAudioProps({ onAudioTaskChange })}
      />,
    );

    fireEvent.click(screen.getAllByRole("tab", { name: "Speak" })[0]!);

    expect(onAudioTaskChange).toHaveBeenCalledWith("speak");
  });

  it("switches back to the recent audio tab", () => {
    const onTabChange = vi.fn();

    render(<ModelPickerDialog {...createAudioProps({ onTabChange })} />);

    fireEvent.click(screen.getByRole("tab", { name: "Recent" }));

    expect(onTabChange).toHaveBeenCalledWith("recent");
  });
});
