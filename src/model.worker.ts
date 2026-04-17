import type { WorkerRequest, WorkerResponse } from "./types";
import {
  generateSpeech,
  generateTextReply,
  generateTranscription,
  generateVisionReply,
} from "./worker/generation";
import { createModelSession } from "./worker/model-session";

const postMessageToUi = (
  message: WorkerResponse,
  transfer?: Transferable[],
) => {
  const workerScope = self as unknown as {
    postMessage: (value: WorkerResponse, transfer?: Transferable[]) => void;
  };
  workerScope.postMessage(message, transfer ?? []);
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

  if (!threadId && !requestId) {
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
    case "TRANSCRIBE_AUDIO": {
      const { requestId, model, audio, returnTimestamps, durationSec } =
        event.data.payload;

      try {
        const result = await generateTranscription({
          session,
          postMessageToUi,
          model,
          audio,
          requestId,
          returnTimestamps,
        });

        postMessageToUi({
          type: "TRANSCRIPTION_DONE",
          payload: {
            requestId,
            modelId: model.id,
            text: result.text,
            chunks: result.chunks,
            durationSec,
          },
        });
      } catch (error) {
        postError(model.id, error, undefined, requestId);
      }
      break;
    }
    case "SYNTHESIZE_SPEECH": {
      const { requestId, model, text, voice, speed } = event.data.payload;

      try {
        const result = await generateSpeech({
          session,
          postMessageToUi,
          model,
          requestId,
          text,
          voice,
          speed,
        });
        const audioBuffer = new Uint8Array(
          result.audio.buffer,
          result.audio.byteOffset,
          result.audio.byteLength,
        ).slice().buffer;

        postMessageToUi(
          {
            type: "SPEECH_DONE",
            payload: {
              requestId,
              modelId: model.id,
              audioBuffer,
              sampleRate: result.sampleRate,
              durationSec: result.audio.length / result.sampleRate,
            },
          },
          [audioBuffer],
        );
      } catch (error) {
        postError(model.id, error, undefined, requestId);
      }
      break;
    }
  }
});
