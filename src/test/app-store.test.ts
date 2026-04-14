import { beforeEach, describe, expect, it } from "vitest";

import { useAppStore } from "../store/app-store";
import type { ChatThread } from "../types";
import { createModelDescriptor } from "./factories";

const initialState = useAppStore.getState();

const createThread = (id: string, updatedAt: string): ChatThread => ({
  id,
  title: `Thread ${id}`,
  model: createModelDescriptor({ id: `model/${id}` }),
  createdAt: updatedAt,
  updatedAt,
  lastMessagePreview: null,
  messageCount: 0,
  memorySummary: null,
  summaryUpToSequence: 0,
});

beforeEach(() => {
  useAppStore.setState({ ...initialState }, true);
});

describe("app store", () => {
  it("keeps threads sorted when upserting", () => {
    const olderThread = createThread("thread-1", "2026-01-01T00:00:00.000Z");
    const newerThread = createThread("thread-2", "2026-01-02T00:00:00.000Z");

    useAppStore.getState().upsertThread(olderThread);
    useAppStore.getState().upsertThread(newerThread);

    expect(
      useAppStore.getState().chatThreads.map((thread) => thread.id),
    ).toEqual(["thread-2", "thread-1"]);
  });

  it("creates missing thread ui state on demand", () => {
    useAppStore
      .getState()
      .setThreadUiState("thread-3", { draftText: "Draft message" });

    expect(useAppStore.getState().threadUiStates["thread-3"]).toMatchObject({
      threadId: "thread-3",
      draftText: "Draft message",
      scrollTop: 0,
    });
  });
});
