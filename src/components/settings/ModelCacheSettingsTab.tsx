import { useEffect, useState } from "react";

import {
  clearAllModelCache,
  deleteModelCache,
  getInstalledModels,
  type InstalledModelEntry,
} from "../../cache";
import { formatBytes } from "../../format";

type ModelCacheSettingsTabProps = {
  onClearAllDownloadedModels: () => void;
};

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

        {loadingModels ? (
          <p className="settings-cache-loading">Scanning browser cache…</p>
        ) : installedModels.length === 0 ? (
          <p className="settings-cache-empty">
            No downloaded model files found in your browser cache.
          </p>
        ) : (
          <ul className="settings-model-list">
            {installedModels.map(({ modelId, fileCount, approximateBytes }) => (
              <li key={modelId} className="settings-model-row">
                <div className="settings-model-info">
                  <span className="settings-model-id">{modelId}</span>
                  <span className="settings-model-meta">
                    {fileCount} file{fileCount !== 1 ? "s" : ""}
                    {approximateBytes
                      ? ` · ${formatBytes(approximateBytes)}`
                      : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="settings-delete-btn"
                  disabled={deletingIds.has(modelId)}
                  onClick={() => {
                    void deleteInstalledModel(modelId);
                  }}
                >
                  {deletingIds.has(modelId) ? "Removing…" : "Remove"}
                </button>
              </li>
            ))}
          </ul>
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
