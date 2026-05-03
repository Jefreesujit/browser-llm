import type { ChatThread } from "../types";

type ChatHistorySidebarProps = {
  threads: ChatThread[];
  activeThreadId: string | null;
  disableMutations?: boolean;
  storageWarning?: string | null;
  onCreateThread: () => void;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
};

export const formatRelativeDate = (value: string) => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "";
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));

  if (diffMinutes < 1) {
    return "now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7 && diffDays > 0) {
    return `${diffDays}d`;
  }

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) {
    return `${diffWeeks}w`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths}mo`;
  }

  const diffYears = Math.floor(diffDays / 365);
  return `${Math.max(1, diffYears)}y`;
};

function ChatHistorySidebar({
  threads,
  activeThreadId,
  disableMutations = false,
  storageWarning,
  onCreateThread,
  onSelectThread,
  onDeleteThread,
}: ChatHistorySidebarProps) {
  return (
    <aside className="chat-history" aria-label="Chat history">
      <div className="chat-history-top">
        <div className="chat-history-header">
          <h2>Chats</h2>
          <button
            className="secondary-button chat-history-new"
            type="button"
            onClick={onCreateThread}
            disabled={disableMutations}
          >
            New Chat
          </button>
        </div>
      </div>

      {storageWarning && <p className="chat-history-warning">{storageWarning}</p>}

      <div className="chat-history-list">
        {threads.length === 0 ? (
          <div className="chat-history-empty">
            <p>No chats yet. Start a new one to keep it here.</p>
          </div>
        ) : (
          threads.map((thread) => (
            <div
              key={thread.id}
              className={`chat-history-item ${thread.id === activeThreadId ? "chat-history-item-active" : ""}`}
            >
              <button
                className="chat-history-select"
                type="button"
                onClick={() => onSelectThread(thread.id)}
                aria-current={thread.id === activeThreadId ? "page" : undefined}
                title={thread.title}
              >
                <span className="chat-history-title">{thread.title}</span>
                <span className="chat-history-meta">{formatRelativeDate(thread.updatedAt)}</span>
              </button>
              <button
                className="chat-history-delete"
                type="button"
                onClick={() => onDeleteThread(thread.id)}
                aria-label={`Delete ${thread.title}`}
                title="Delete chat"
                disabled={disableMutations}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

export default ChatHistorySidebar;
