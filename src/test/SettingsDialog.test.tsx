import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import DataPage from "../components/DataPage";
import SettingsPage from "../components/SettingsPage";
import { DEFAULT_APP_SETTINGS } from "../types";

describe("Settings surfaces", () => {
  it("renders generation settings separately", () => {
    render(
      <SettingsPage
        open
        settings={DEFAULT_APP_SETTINGS}
        contextWindowTokens={4096}
        githubUrl="https://github.com/Jefreesujit/browser-llm"
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Response defaults")).toBeInTheDocument();
    expect(screen.queryByText("Local browser data")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View project on GitHub" }),
    ).toBeInTheDocument();
  });

  it("switches between storage and model cache tabs", () => {
    render(
      <DataPage
        open
        storageStatus="ready"
        storageWarning={null}
        onClearChatHistory={vi.fn()}
        onClearAllData={vi.fn()}
        onClearAllDownloadedModels={vi.fn()}
      />,
    );

    expect(screen.getByText("Local browser data")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Model Cache" }));
    expect(screen.getByText("Downloaded model files")).toBeInTheDocument();
  });
});
