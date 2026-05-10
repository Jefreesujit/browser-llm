import { useEffect, useState } from "react";

import {
  clearAllModelCache,
  deleteModelCache,
  getInstalledModels,
  type InstalledModelEntry,
} from "../../cache";
import { formatBytes } from "../../format";
import { getCanonicalCuratedModel } from "../../models";

type ModelCacheSettingsTabProps = {
  onClearAllDownloadedModels: () => void;
};

type InstalledModelGroupKey = "chat" | "audio" | "other";

const GROUP_ORDER: InstalledModelGroupKey[] = ["chat", "audio", "other"];

const GROUP_COPY: Record<
  InstalledModelGroupKey,
  { label: string; description: string }
> = {
  chat: {
    label: "Chat Models",
    description: "Text and vision model files cached for chat use.",
  },
  audio: {
    label: "Audio Models",
    description: "Speech and transcription model files cached for audio use.",
  },
  other: {
    label: "Other Models",
    description: "Cached model files that could not be classified automatically.",
  },
};

const getInstalledModelGroup = (
  modelId: string,
): InstalledModelGroupKey => {
  const canonicalModel = getCanonicalCuratedModel(modelId);

  if (!canonicalModel) {
    return "other";
  }

  if (canonicalModel.task === "stt" || canonicalModel.task === "tts") {
    return "audio";
  }

  return "chat";
};

const groupInstalledModels = (installedModels: InstalledModelEntry[]) =>
  installedModels.reduce<
    Record<InstalledModelGroupKey, InstalledModelEntry[]>
  >(
    (groups, model) => {
      groups[getInstalledModelGroup(model.modelId)].push(model);
      return groups;
    },
    {
      chat: [],
      audio: [],
      other: [],
    },
  );

const useInstalledModels = (onCleared?: () => void) => {
  const [installedModels, setInstalledModels] = useState<InstalledModelEntry[]>(
    [],
  );
  const [loadingModels, setLoadingModels] = useState(true);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [clearingAll, setClearingAll] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getInstalledModels()
      .then((models) => {
        if (!cancelled) {
          setInstalledModels(models);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingModels(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const reloadInstalledModels = async () => {
    setLoadingModels(true);
    try {
      const models = await getInstalledModels();
      setInstalledModels(models);
    } finally {
      setLoadingModels(false);
    }
  };

  const deleteInstalledModel = async (modelId: string) => {
    setDeletingIds((current) => new Set([...current, modelId]));

    try {
      await deleteModelCache(modelId);
      await reloadInstalledModels();
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(modelId);
        return next;
      });
    }
  };

  const clearInstalledModels = async () => {
    setClearingAll(true);

    try {
      await clearAllModelCache();
      setInstalledModels([]);
      onCleared?.();
    } finally {
      setClearingAll(false);
    }
  };

  return {
    installedModels,
    loadingModels,
    deletingIds,
    clearingAll,
    deleteInstalledModel,
    clearInstalledModels,
  };
};

type InstalledModelListProps = {
  installedModels: InstalledModelEntry[];
  deletingIds: Set<string>;
  onDelete: (modelId: string) => void;
};

function InstalledModelList({
  installedModels,
  deletingIds,
  onDelete,
}: InstalledModelListProps) {
  return (
    <ul className="settings-model-list">
      {installedModels.map(({ modelId, fileCount, approximateBytes }) => (
        <li key={modelId} className="settings-model-row">
          <div className="settings-model-info">
            <span className="settings-model-id">{modelId}</span>
            <span className="settings-model-meta">
              {fileCount} file{fileCount !== 1 ? "s" : ""}
              {approximateBytes ? ` · ${formatBytes(approximateBytes)}` : ""}
            </span>
          </div>
          <button
            type="button"
            className="settings-delete-btn"
            disabled={deletingIds.has(modelId)}
            onClick={() => onDelete(modelId)}
          >
            {deletingIds.has(modelId) ? "Removing…" : "Remove"}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ModelCacheSettingsTab({
  onClearAllDownloadedModels,
}: ModelCacheSettingsTabProps) {
  const {
    installedModels,
    loadingModels,
    deletingIds,
    clearingAll,
    deleteInstalledModel,
    clearInstalledModels,
  } = useInstalledModels(onClearAllDownloadedModels);
  const groupedModels = groupInstalledModels(installedModels);

  return (
    <div className="settings-section">
      <div className="settings-field">
        <div className="settings-field-header">
          <span className="settings-field-label">Downloaded models</span>
        </div>
        <p className="settings-field-description">
          Remove cached model files from browser storage. They will download
          again next time.
        </p>
        <p className="settings-field-description">
          Active models remain in memory until you switch models or refresh the
          page.
        </p>

        {loadingModels ? (
          <p className="settings-cache-loading">Scanning browser cache…</p>
        ) : installedModels.length === 0 ? (
          <p className="settings-cache-empty">
            No downloaded model files found in your browser cache.
          </p>
        ) : (
          <div className="settings-model-groups">
            {GROUP_ORDER.filter((group) => groupedModels[group].length > 0).map(
              (group) => (
                <section key={group} className="settings-model-group">
                  <div className="settings-model-group-header">
                    <h4>{GROUP_COPY[group].label}</h4>
                    <p>{GROUP_COPY[group].description}</p>
                  </div>
                  <InstalledModelList
                    installedModels={groupedModels[group]}
                    deletingIds={deletingIds}
                    onDelete={(modelId) => {
                      void deleteInstalledModel(modelId);
                    }}
                  />
                </section>
              ),
            )}
          </div>
        )}

        {installedModels.length > 0 && (
          <button
            type="button"
            className="settings-danger-btn"
            disabled={clearingAll}
            onClick={() => {
              void clearInstalledModels();
            }}
          >
            {clearingAll ? "Clearing…" : "Clear all downloaded models"}
          </button>
        )}
      </div>
    </div>
  );
}

export default ModelCacheSettingsTab;
