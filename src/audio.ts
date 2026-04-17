const downmixToMono = (buffer: AudioBuffer) => {
  if (buffer.numberOfChannels === 2) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const audio = new Float32Array(buffer.length);
    const scalingFactor = Math.sqrt(2);

    for (let index = 0; index < buffer.length; index += 1) {
      audio[index] = (scalingFactor * (left[index] + right[index])) / 2;
    }

    return audio;
  }

  return new Float32Array(buffer.getChannelData(0));
};

export const decodeAudioBlob = async (
  blob: Blob,
  targetSampleRate: number,
): Promise<{ samples: Float32Array; durationSec: number }> => {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext({ sampleRate: targetSampleRate });

  try {
    const decoded = await audioContext.decodeAudioData(arrayBuffer);
    return {
      samples: downmixToMono(decoded),
      durationSec: decoded.duration,
    };
  } finally {
    await audioContext.close();
  }
};

const clampSample = (value: number) => Math.max(-1, Math.min(1, value));

export const createIdleWaveform = (barCount = 20) =>
  Array.from({ length: barCount }, (_, index) => 0.14 + ((index % 4) * 0.03));

export const measureWaveformLevels = (
  timeDomainData: Uint8Array,
  barCount = 20,
) => {
  const bucketSize = Math.max(1, Math.floor(timeDomainData.length / barCount));

  return Array.from({ length: barCount }, (_, bucketIndex) => {
    const start = bucketIndex * bucketSize;
    const end =
      bucketIndex === barCount - 1
        ? timeDomainData.length
        : Math.min(timeDomainData.length, start + bucketSize);

    let total = 0;
    for (let index = start; index < end; index += 1) {
      total += Math.abs(timeDomainData[index] - 128) / 128;
    }

    const average = total / Math.max(1, end - start);
    return Math.max(0.08, Math.min(1, average * 5.5));
  });
};

export const createWavBlob = (
  samples: Float32Array,
  sampleRate: number,
): Blob => {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = clampSample(sample);
    view.setInt16(
      offset,
      clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
      true,
    );
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: "audio/wav" });
};

export const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
};
