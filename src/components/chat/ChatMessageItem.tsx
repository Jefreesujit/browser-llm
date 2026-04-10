import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ChatMessage } from "../../types";

type ChatMessageItemProps = {
  message: ChatMessage;
  isGenerating: boolean;
};

function ChatMessageItem({ message, isGenerating }: ChatMessageItemProps) {
  return (
    <article className={`message message-${message.role}`}>
      {message.attachment && (
        <div className="message-attachment">
          <span className="attachment-chip">
            Image attached: {message.attachment.name}
          </span>
        </div>
      )}
      {message.role === "assistant" ? (
        <div className="markdown-body">
          {message.reasoning && (
            <details className="reasoning-panel">
              <summary>
                {message.reasoningState === "streaming"
                  ? "Thinking"
                  : "View thinking"}
              </summary>
              <div className="reasoning-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.reasoning}
                </ReactMarkdown>
              </div>
            </details>
          )}
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content ||
              (message.reasoningState === "streaming"
                ? ""
                : isGenerating
                  ? "Thinking..."
                  : "")}
          </ReactMarkdown>
          {message.reasoningState === "streaming" && !message.content && (
            <p className="thinking-indicator">Thinking…</p>
          )}
        </div>
      ) : (
        <p className="message-content">{message.content}</p>
      )}
    </article>
  );
}

export default ChatMessageItem;
