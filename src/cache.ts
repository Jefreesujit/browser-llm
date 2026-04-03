// Transformers.js stores all model files in a cache named "transformers-cache".
// URLs follow the pattern: https://huggingface.co/{owner}/{repo}/resolve/main/{filename}
// We use these URLs to identify which model a cached file belongs to.

const TRANSFORMERS_CACHE_NAME = "transformers-cache";
const HF_URL_PREFIX = "https://huggingface.co/";

export type InstalledModelEntry = {
  modelId: string;
  fileCount: number;
};

const extractModelIdFromUrl = (url: string): string | null => {
  if (!url.startsWith(HF_URL_PREFIX)) {
    return null;
  }

  // Pattern: https://huggingface.co/{owner}/{repo}/resolve/main/...
  const path = url.slice(HF_URL_PREFIX.length);
  const parts = path.split("/");

  if (parts.length < 4 || parts[2] !== "resolve") {
    return null;
  }

  return `${parts[0]}/${parts[1]}`;
};

export const getInstalledModels = async (): Promise<InstalledModelEntry[]> => {
  if (typeof caches === "undefined") {
    return [];
  }

  try {
    const cache = await caches.open(TRANSFORMERS_CACHE_NAME);
    const requests = await cache.keys();

    const counts = new Map<string, number>();
    for (const request of requests) {
      const modelId = extractModelIdFromUrl(request.url);
      if (modelId) {
        counts.set(modelId, (counts.get(modelId) ?? 0) + 1);
      }
    }

    return [...counts.entries()].map(([modelId, fileCount]) => ({ modelId, fileCount }));
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
