import type { ChatPersistenceStatus } from "../../types";

const getStorageLabel = (status: ChatPersistenceStatus) => {
  switch (status) {
    case "fallback_local_storage":
      return "Using localStorage fallback";
    case "quota_exceeded":
      return "Storage full";
    case "unavailable":
      return "Storage unavailable";
    default:
      return "IndexedDB ready";
  }
};

type DataSettingsTabProps = {
  storageStatus: ChatPersistenceStatus;
  storageWarning?: string | null;
  onClearChatHistory: () => void;
  onClearAllData: () => void;
};

function DataSettingsTab({
  storageStatus,
  storageWarning,
  onClearChatHistory,
  onClearAllData,
}: DataSettingsTabProps) {
  return (
    <div className="settings-section">
      <div className="settings-field">
        <div className="settings-field-header">
          <span className="settings-field-label">Storage health</span>
          <span className="settings-field-value">
            {getStorageLabel(storageStatus)}
          </span>
        </div>
        <p className="settings-field-description">
          Chats are stored locally in this browser. Lightweight preferences stay
          in local storage.
        </p>
        {storageWarning && (
          <p className="settings-warning-copy">{storageWarning}</p>
        )}
      </div>

      <div className="settings-field">
        <div className="settings-field-header">
          <span className="settings-field-label">Chat history</span>
        </div>
        <p className="settings-field-description">
          Deletes all saved conversations but keeps downloaded models and
          general preferences.
        </p>
        <button
          type="button"
          className="settings-danger-btn"
          onClick={onClearChatHistory}
        >
          Clear chat history
        </button>
      </div>

      <div className="settings-field">
        <div className="settings-field-header">
          <span className="settings-field-label">App data</span>
        </div>
        <p className="settings-field-description">
          Clears chat history, model verdicts, recent models, and saved settings
          in this browser.
        </p>
        <button
          type="button"
          className="settings-danger-btn"
          onClick={onClearAllData}
        >
          Clear all app data
        </button>
      </div>
    </div>
  );
}

export default DataSettingsTab;
