const TRANSFORMERS_CACHE_NAME = "transformers-cache";
const HF_URL_PREFIX = "https://huggingface.co/";

export type InstalledModelEntry = {
  modelId: string;
  fileCount: number;
  approximateBytes: number | null;
};

const extractModelIdFromUrl = (url: string): string | null => {
  if (!url.startsWith(HF_URL_PREFIX)) {
    return null;
  }

  const path = url.slice(HF_URL_PREFIX.length);
  const parts = path.split("/");

  if (parts.length < 4 || parts[2] !== "resolve") {
    return null;
  }

  return `${parts[0]}/${parts[1]}`;
};

const readApproximateSize = async (cache: Cache, request: Request) => {
  try {
    const response = await cache.match(request);
    if (!response) {
      return null;
    }

    const headerValue = response.headers.get("content-length");
    if (!headerValue) {
      return null;
    }

    const parsed = Number.parseInt(headerValue, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const getInstalledModels = async (): Promise<InstalledModelEntry[]> => {
  if (typeof caches === "undefined") {
    return [];
  }

  try {
    const cache = await caches.open(TRANSFORMERS_CACHE_NAME);
    const requests = await cache.keys();

    const entries = new Map<
      string,
      {
        fileCount: number;
        approximateBytes: number;
        hasSize: boolean;
      }
    >();

    await Promise.all(
      requests.map(async (request) => {
        const modelId = extractModelIdFromUrl(request.url);
        if (!modelId) {
          return;
        }

        const next = entries.get(modelId) ?? {
          fileCount: 0,
          approximateBytes: 0,
          hasSize: false,
        };

        next.fileCount += 1;
        const size = await readApproximateSize(cache, request);
        if (typeof size === "number" && size > 0) {
          next.approximateBytes += size;
          next.hasSize = true;
        }

        entries.set(modelId, next);
      }),
    );

    return [...entries.entries()]
      .map(([modelId, entry]) => ({
        modelId,
        fileCount: entry.fileCount,
        approximateBytes: entry.hasSize ? entry.approximateBytes : null,
      }))
      .sort((left, right) => left.modelId.localeCompare(right.modelId));
  } catch {
    return [];
  }
};

export const deleteModelCache = async (modelId: string): Promise<boolean> => {
  if (typeof caches === "undefined") {
    return false;
  }

  try {
    const cache = await caches.open(TRANSFORMERS_CACHE_NAME);
    const requests = await cache.keys();

    const matchingRequests = requests.filter((request) => {
      const id = extractModelIdFromUrl(request.url);
      return id === modelId;
    });

    await Promise.all(matchingRequests.map((request) => cache.delete(request)));
    return true;
  } catch {
    return false;
  }
};

export const clearAllModelCache = async (): Promise<boolean> => {
  if (typeof caches === "undefined") {
    return false;
  }

  try {
    return await caches.delete(TRANSFORMERS_CACHE_NAME);
  } catch {
    return false;
  }
};
