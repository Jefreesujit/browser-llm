import type { RefObject } from "react";

import type { ChatMessage, ModelLoadState } from "../../types";
import ChatMessageItem from "./ChatMessageItem";

type ChatMessageListProps = {
  messages: ChatMessage[];
  appState: ModelLoadState;
  isGenerating: boolean;
  starterPrompts: string[];
  chatLogRef: RefObject<HTMLElement | null>;
  onInputChange: (value: string) => void;
  onChatScroll: (scrollTop: number) => void;
};

function ChatMessageList({
  messages,
  appState,
  isGenerating,
  starterPrompts,
  chatLogRef,
  onInputChange,
  onChatScroll,
}: ChatMessageListProps) {
  return (
    <section
      className="chat-log"
      aria-label="Chat messages"
      ref={chatLogRef}
      onScroll={(event) => onChatScroll(event.currentTarget.scrollTop)}
    >
      {messages.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">Start chatting.</p>
          <p className="empty-copy">
            {appState === "ready"
              ? "The selected model is ready. Ask a question to begin."
              : "The selected model is still loading into browser storage."}
          </p>
          {appState === "ready" && (
            <div className="empty-suggestions" aria-label="Starter prompts">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  className="empty-suggestion"
                  type="button"
                  onClick={() => onInputChange(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        messages.map((message) => (
          <ChatMessageItem
            key={message.id}
            message={message}
            isGenerating={isGenerating}
          />
        ))
      )}
    </section>
  );
}

export default ChatMessageList;
