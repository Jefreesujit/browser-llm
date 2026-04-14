import type { WorkerRequest, WorkerResponse } from "./types";
import { generateTextReply, generateVisionReply } from "./worker/generation";
import { createModelSession } from "./worker/model-session";

const postMessageToUi = (message: WorkerResponse) => {
  self.postMessage(message);
};

const postError = (
  modelId: string,
  error: unknown,
  threadId?: string,
  requestId?: string,
) => {
  const message =
    error instanceof Error
      ? error.message
      : "Something went wrong while running the model.";
  postMessageToUi({
    type: "ERROR",
    payload: { modelId, message, threadId, requestId },
  });

  if (!threadId || !requestId) {
    postMessageToUi({
      type: "MODEL_LOAD_RESULT",
      payload: { modelId, status: "failed_on_device", message },
    });
  }
};

const session = createModelSession(postMessageToUi);

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  switch (event.data.type) {
    case "LOAD_MODEL": {
      const { model } = event.data.payload;

      try {
        await session.ensureModelReady(model);
        postMessageToUi({
          type: "MODEL_READY",
          payload: { modelId: model.id },
        });
        postMessageToUi({
          type: "MODEL_LOAD_RESULT",
          payload: { modelId: model.id, status: "verified" },
        });
      } catch (error) {
        postError(model.id, error);
      }
      break;
    }
    case "GENERATE": {
      const {
        threadId,
        requestId,
        model,
        messages,
        summary,
        summaryUpToSequence,
        image,
        options,
      } = event.data.payload;

      try {
        const result =
          model.task === "vision"
            ? await generateVisionReply({
                session,
                postMessageToUi,
                model,
                messages,
                image,
                threadId,
                requestId,
              })
            : await generateTextReply({
                session,
                postMessageToUi,
                model,
                messages,
                summary,
                summaryUpToSequence,
                options,
                threadId,
                requestId,
              });

        postMessageToUi({
          type: "GENERATION_DONE",
          payload: {
            threadId,
            requestId,
            modelId: model.id,
            text: result.text,
            summary: result.summary,
            summaryUpToSequence: result.summaryUpToSequence,
          },
        });
      } catch (error) {
        postError(model.id, error, threadId, requestId);
      } finally {
        session.clearActiveStoppingCriteria();
      }
      break;
    }
    case "STOP_GENERATION": {
      session.interruptGeneration();
      break;
    }
  }
});
