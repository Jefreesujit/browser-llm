import type { AudioTranscriptionChunk } from "../types";

export const EMPTY_TRANSCRIPTION_MESSAGE =
  "No speech was detected in that clip. Try recording closer to the microphone or upload a clearer file.";

export const normalizeTranscriptionText = (
  text: string,
  chunks: AudioTranscriptionChunk[] | undefined,
) => {
  const directText = text.trim();
  if (directText) {
    return directText;
  }

  const chunkText = (chunks ?? [])
    .map((chunk) => chunk.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return chunkText;
};
