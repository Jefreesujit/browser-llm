import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import ChatScreen from "../components/ChatScreen";
import { createModelDescriptor } from "./factories";

describe("ChatScreen", () => {
  it("shows starter prompts when the selected model is ready and chat is empty", () => {
    render(
      <ChatScreen
        threads={[]}
        activeThreadId={null}
        activeThreadTitle="Project kickoff"
        selectedModel={createModelDescriptor()}
        appState="ready"
        messages={[]}
        input=""
        progress={null}
        error={null}
        isGenerating={false}
        draftAttachment={null}
        chatLogRef={createRef<HTMLElement>()}
        fileInputRef={createRef<HTMLInputElement>()}
        onCreateThread={vi.fn()}
        onSelectThread={vi.fn()}
        onDeleteThread={vi.fn()}
        onChangeModel={vi.fn()}
        onInputChange={vi.fn()}
        onSubmit={vi.fn()}
        onComposerKeyDown={vi.fn()}
        onFileChange={vi.fn()}
        onRemoveAttachment={vi.fn()}
        onChatScroll={vi.fn()}
        onStopGeneration={vi.fn()}
        stopRequested={false}
      />,
    );

    expect(screen.getByText("Start chatting.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Project kickoff" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Give me a quick plan for this task.",
      }),
    ).toBeInTheDocument();
  });
});
