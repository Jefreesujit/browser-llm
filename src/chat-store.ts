import {
  clearLegacyChatThreads,
  loadLegacyChatThreads,
  readJson,
  removeValue,
  writeJson,
} from "./storage";
import type {
  ChatMessage,
  ChatPersistenceStatus,
  ChatStore,
  ChatStoreSnapshot,
  ChatThread,
  ModelDescriptor,
  StorageWriteResult,
  ThreadMessage,
  ThreadUiState,
} from "./types";

const DB_NAME = "webllm-chat-db";
const DB_VERSION = 1;
const THREADS_STORE = "threads";
const MESSAGES_STORE = "messages";
const THREAD_UI_STORE = "thread_ui";

const LOCAL_THREADS_KEY = "webllm:chat-threads-v2";
const LOCAL_MESSAGES_KEY = "webllm:chat-messages-v2";
const LOCAL_UI_KEY = "webllm:chat-ui-v2";

type LegacyChatThread = {
  id: string;
  title: string;
  model: ModelDescriptor;
  messages?: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

const sortThreadsByUpdatedAt = (threads: ChatThread[]) =>
  [...threads].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );

const getLastMessagePreview = (
  message: ChatMessage | ThreadMessage | undefined,
) => {
  if (!message) {
    return null;
  }

  if (message.content.trim().length > 0) {
    const normalized = message.content.replace(/\s+/g, " ").trim();
    return normalized.length > 72
      ? `${normalized.slice(0, 72).trimEnd()}…`
      : normalized;
  }

  if (message.attachment) {
    return `Image · ${message.attachment.name}`;
  }

  return null;
};

const toThreadMeta = (
  legacyThread: LegacyChatThread,
  messages: ThreadMessage[],
): ChatThread => ({
  id: legacyThread.id,
  title: legacyThread.title,
  model: legacyThread.model,
  createdAt: legacyThread.createdAt,
  updatedAt: legacyThread.updatedAt,
  lastMessagePreview: getLastMessagePreview(messages.at(-1)),
  messageCount: messages.length,
  memorySummary: null,
  summaryUpToSequence: 0,
});

const migrateLegacyMessages = (thread: LegacyChatThread): ThreadMessage[] =>
  (thread.messages ?? []).map((message, index) => ({
    ...message,
    threadId: thread.id,
    sequence: index + 1,
    createdAt: thread.updatedAt,
    status: "complete",
  }));

const maybeMigrateLegacyThreads = async (
  store: ChatStore,
): Promise<StorageWriteResult> => {
  const existingThreads = await store.listThreads();
  if (existingThreads.length > 0) {
    return { ok: true };
  }

  const legacyThreads =
    loadLegacyChatThreads() as unknown as LegacyChatThread[];
  if (legacyThreads.length === 0) {
    return { ok: true };
  }

  for (const legacyThread of legacyThreads) {
    const messages = migrateLegacyMessages(legacyThread);
    const meta = toThreadMeta(legacyThread, messages);
    const threadResult = await store.putThread(meta);
    const messagesResult = await store.putMessages(meta.id, messages);

    if (!threadResult.ok || !messagesResult.ok) {
      return !threadResult.ok ? threadResult : messagesResult;
    }
  }

  clearLegacyChatThreads();
  return { ok: true };
};

const getStorageWriteFailure = (error: unknown): StorageWriteResult => {
  if (error instanceof DOMException) {
    if (error.name === "QuotaExceededError") {
      return { ok: false, reason: "quota" };
    }

    if (error.name === "SecurityError" || error.name === "InvalidStateError") {
      return { ok: false, reason: "blocked" };
    }
  }

  return { ok: false, reason: "unavailable" };
};

const isQuotaExceededError = (error: unknown) =>
  error instanceof DOMException && error.name === "QuotaExceededError";

const isFallbackEligibleError = (error: unknown) =>
  error instanceof DOMException
    ? error.name === "SecurityError" || error.name === "InvalidStateError"
    : error instanceof Error && error.message === "indexeddb-unavailable";

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });

const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb-unavailable"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(THREADS_STORE)) {
        database.createObjectStore(THREADS_STORE, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(MESSAGES_STORE)) {
        const messageStore = database.createObjectStore(MESSAGES_STORE, {
          keyPath: "id",
        });
        messageStore.createIndex("byThreadSequence", ["threadId", "sequence"], {
          unique: false,
        });
      }

      if (!database.objectStoreNames.contains(THREAD_UI_STORE)) {
        database.createObjectStore(THREAD_UI_STORE, { keyPath: "threadId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to open IndexedDB."));
    request.onblocked = () =>
      reject(new DOMException("IndexedDB blocked", "InvalidStateError"));
  });

const getAllMessagesForThread = async (
  database: IDBDatabase,
  threadId: string,
): Promise<ThreadMessage[]> => {
  const transaction = database.transaction(MESSAGES_STORE, "readonly");
  const store = transaction.objectStore(MESSAGES_STORE);
  const index = store.index("byThreadSequence");
  const range = IDBKeyRange.bound(
    [threadId, 0],
    [threadId, Number.MAX_SAFE_INTEGER],
  );
  const request = index.getAll(range);
  const messages = await requestToPromise(request);
  await transactionDone(transaction);
  return messages as ThreadMessage[];
};

const createIndexedDbStore = async (): Promise<ChatStore> => {
  const database = await openDatabase();

  const listThreads = async () => {
    const transaction = database.transaction(THREADS_STORE, "readonly");
    const store = transaction.objectStore(THREADS_STORE);
    const threads = (await requestToPromise(store.getAll())) as ChatThread[];
    await transactionDone(transaction);
    return sortThreadsByUpdatedAt(threads);
  };

  const getSnapshot = async (threadId: string) => {
    const transaction = database.transaction(
      [THREADS_STORE, THREAD_UI_STORE],
      "readonly",
    );
    const threadsStore = transaction.objectStore(THREADS_STORE);
    const uiStore = transaction.objectStore(THREAD_UI_STORE);
    const thread = (await requestToPromise(threadsStore.get(threadId))) as
      | ChatThread
      | undefined;
    const uiState = (await requestToPromise(uiStore.get(threadId))) as
      | ThreadUiState
      | undefined;
    await transactionDone(transaction);

    if (!thread) {
      return null;
    }

    const messages = await getAllMessagesForThread(database, threadId);
    return {
      thread,
      messages,
      uiState: uiState ?? null,
    } satisfies ChatStoreSnapshot;
  };

  const putThread = async (thread: ChatThread) => {
    try {
      const transaction = database.transaction(THREADS_STORE, "readwrite");
      transaction.objectStore(THREADS_STORE).put(thread);
      await transactionDone(transaction);
      return { ok: true } satisfies StorageWriteResult;
    } catch (error) {
      return getStorageWriteFailure(error);
    }
  };

  const putMessages = async (threadId: string, messages: ThreadMessage[]) => {
    try {
      const transaction = database.transaction(MESSAGES_STORE, "readwrite");
      const store = transaction.objectStore(MESSAGES_STORE);
      const index = store.index("byThreadSequence");
      const range = IDBKeyRange.bound(
        [threadId, 0],
        [threadId, Number.MAX_SAFE_INTEGER],
      );

      await new Promise<void>((resolve, reject) => {
        const request = index.openKeyCursor(range);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve();
            return;
          }

          store.delete(cursor.primaryKey);
          cursor.continue();
        };
        request.onerror = () =>
          reject(
            request.error ?? new Error("Unable to replace thread messages."),
          );
      });

      messages.forEach((message) => {
        store.put(message);
      });

      await transactionDone(transaction);
      return { ok: true } satisfies StorageWriteResult;
    } catch (error) {
      return getStorageWriteFailure(error);
    }
  };

  const putUiState = async (uiState: ThreadUiState) => {
    try {
      const transaction = database.transaction(THREAD_UI_STORE, "readwrite");
      transaction.objectStore(THREAD_UI_STORE).put(uiState);
      await transactionDone(transaction);
      return { ok: true } satisfies StorageWriteResult;
    } catch (error) {
      return getStorageWriteFailure(error);
    }
  };

  const deleteThread = async (threadId: string) => {
    try {
      const transaction = database.transaction(
        [THREADS_STORE, MESSAGES_STORE, THREAD_UI_STORE],
        "readwrite",
      );
      transaction.objectStore(THREADS_STORE).delete(threadId);
      transaction.objectStore(THREAD_UI_STORE).delete(threadId);

      const messagesStore = transaction.objectStore(MESSAGES_STORE);
      const index = messagesStore.index("byThreadSequence");
      const range = IDBKeyRange.bound(
        [threadId, 0],
        [threadId, Number.MAX_SAFE_INTEGER],
      );

      await new Promise<void>((resolve, reject) => {
        const request = index.openKeyCursor(range);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve();
            return;
          }

          messagesStore.delete(cursor.primaryKey);
          cursor.continue();
        };
        request.onerror = () =>
          reject(
            request.error ?? new Error("Unable to delete thread messages."),
          );
      });

      await transactionDone(transaction);
      return { ok: true } satisfies StorageWriteResult;
    } catch (error) {
      return getStorageWriteFailure(error);
    }
  };

  const clearAll = async () => {
    try {
      const transaction = database.transaction(
        [THREADS_STORE, MESSAGES_STORE, THREAD_UI_STORE],
        "readwrite",
      );
      transaction.objectStore(THREADS_STORE).clear();
      transaction.objectStore(MESSAGES_STORE).clear();
      transaction.objectStore(THREAD_UI_STORE).clear();
      await transactionDone(transaction);
      return { ok: true } satisfies StorageWriteResult;
    } catch (error) {
      return getStorageWriteFailure(error);
    }
  };

  return {
    kind: "indexeddb",
    listThreads,
    getSnapshot,
    putThread,
    putMessages,
    putUiState,
    deleteThread,
    clearAll,
  };
};

const createLocalStorageStore = (): ChatStore => {
  const readThreads = () => readJson<ChatThread[]>(LOCAL_THREADS_KEY, []);
  const readMessages = () =>
    readJson<Record<string, ThreadMessage[]>>(LOCAL_MESSAGES_KEY, {});
  const readUiStates = () =>
    readJson<Record<string, ThreadUiState>>(LOCAL_UI_KEY, {});

  const writeThreads = (threads: ChatThread[]) =>
    writeJson(LOCAL_THREADS_KEY, threads);
  const writeMessages = (messages: Record<string, ThreadMessage[]>) =>
    writeJson(LOCAL_MESSAGES_KEY, messages);
  const writeUiStates = (uiStates: Record<string, ThreadUiState>) =>
    writeJson(LOCAL_UI_KEY, uiStates);

  return {
    kind: "localstorage",
    listThreads: async () => sortThreadsByUpdatedAt(readThreads()),
    getSnapshot: async (threadId: string) => {
      const thread = readThreads().find((entry) => entry.id === threadId);
      if (!thread) {
        return null;
      }

      const messages = readMessages()[threadId] ?? [];
      const uiState = readUiStates()[threadId] ?? null;
      return { thread, messages, uiState };
    },
    putThread: async (thread: ChatThread) => {
      const threads = readThreads();
      const nextThreads = sortThreadsByUpdatedAt([
        thread,
        ...threads.filter((entry) => entry.id !== thread.id),
      ]);
      return writeThreads(nextThreads);
    },
    putMessages: async (threadId: string, messages: ThreadMessage[]) => {
      const next = {
        ...readMessages(),
        [threadId]: messages,
      };
      return writeMessages(next);
    },
    putUiState: async (uiState: ThreadUiState) => {
      const next = {
        ...readUiStates(),
        [uiState.threadId]: uiState,
      };
      return writeUiStates(next);
    },
    deleteThread: async (threadId: string) => {
      const threadResult = writeThreads(
        readThreads().filter((entry) => entry.id !== threadId),
      );
      const messages = readMessages();
      delete messages[threadId];
      const messagesResult = writeMessages(messages);
      const uiStates = readUiStates();
      delete uiStates[threadId];
      const uiResult = writeUiStates(uiStates);

      return threadResult.ok && messagesResult.ok && uiResult.ok
        ? ({ ok: true } satisfies StorageWriteResult)
        : threadResult.ok
          ? messagesResult.ok
            ? uiResult
            : messagesResult
          : threadResult;
    },
    clearAll: async () => {
      const results = [
        removeValue(LOCAL_THREADS_KEY),
        removeValue(LOCAL_MESSAGES_KEY),
        removeValue(LOCAL_UI_KEY),
      ];
      return results.every((result) => result.ok)
        ? ({ ok: true } satisfies StorageWriteResult)
        : (results.find((result) => !result.ok) ?? {
            ok: false,
            reason: "unavailable",
          });
    },
  };
};

const createUnavailableStore = (
  reason: StorageWriteResult["reason"],
): ChatStore => ({
  kind: "indexeddb",
  listThreads: async () => [],
  getSnapshot: async () => null,
  putThread: async () => ({ ok: false, reason }),
  putMessages: async () => ({ ok: false, reason }),
  putUiState: async () => ({ ok: false, reason }),
  deleteThread: async () => ({ ok: false, reason }),
  clearAll: async () => ({ ok: false, reason }),
});

export const initializeChatStore = async (): Promise<{
  store: ChatStore;
  status: ChatPersistenceStatus;
}> => {
  try {
    const indexedDbStore = await createIndexedDbStore();
    const migrationResult = await maybeMigrateLegacyThreads(indexedDbStore);
    return {
      store: indexedDbStore,
      status: migrationResult.ok
        ? "ready"
        : migrationResult.reason === "quota"
          ? "quota_exceeded"
          : "ready",
    };
  } catch (error) {
    if (isQuotaExceededError(error)) {
      return {
        store: createUnavailableStore("quota"),
        status: "quota_exceeded",
      };
    }

    if (!isFallbackEligibleError(error)) {
      return {
        store: createUnavailableStore("unavailable"),
        status: "unavailable",
      };
    }

    const fallbackStore = createLocalStorageStore();
    const migrationResult = await maybeMigrateLegacyThreads(fallbackStore);
    if (!migrationResult.ok) {
      return {
        store:
          migrationResult.reason === "quota"
            ? createUnavailableStore("quota")
            : createUnavailableStore("unavailable"),
        status:
          migrationResult.reason === "quota" ? "quota_exceeded" : "unavailable",
      };
    }

    return { store: fallbackStore, status: "fallback_local_storage" };
  }
};
