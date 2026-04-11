# Chat Persistence, Settings, And Model Catalog Implementation

## Summary
Implement chat history as a durable local conversation system with three clear storage layers:

- `IndexedDB` for chats, messages, summaries, and per-thread UI state
- `localStorage` for lightweight settings and global preferences
- `Cache API` for downloaded model artifacts managed by Transformers.js

Keep the current hybrid model approach:
- curated models stay code-defined in [src/models.ts](/Users/jefree/Documents/Jefree/projects/web-llm/src/models.ts)
- Hugging Face search remains available for discovery and loading compatible models

Replace the `Reset` button with a `Settings` action in the header. Settings becomes the place to manage generation config, downloaded models, and destructive data actions like clearing chat history.

## Key Decisions
- Keep [src/models.ts](/Users/jefree/Documents/Jefree/projects/web-llm/src/models.ts) as the curated model source of truth instead of inventing another catalog file. Developers customize surfaced defaults by editing that file.
- Use `IndexedDB` as the canonical store for chat data. Do not keep canonical chat history in `localStorage`.
- Keep app settings in `localStorage`. They are small, fast to read at boot, and do not need transactional/history semantics.
- Use `localStorage` fallback for chats only when IndexedDB is unavailable or blocked at startup. Do not fall back on quota exhaustion; instead surface `out of storage` clearly.
- Add a token-aware recent-window + rolling-summary memory strategy. Do not rely on silent tokenizer truncation.

## Implementation Changes

### 1. Storage architecture
Create a storage split instead of one generic localStorage helper.

- Keep [src/storage.ts](/Users/jefree/Documents/Jefree/projects/web-llm/src/storage.ts) for lightweight key-value data only:
  - active thread id
  - last model
  - recent models
  - picker tab
  - experimental toggle
  - local model verdict cache
  - app settings
- Add a dedicated chat persistence layer, e.g. `src/chat-store.ts`, backed by IndexedDB.
- Add an adapter abstraction so the app can initialize one of:
  - `IndexedDbChatStore` as default
  - `LocalStorageChatStore` only if IndexedDB open/init fails because of unavailable/blocked/security conditions
- Chat store responsibilities:
  - create thread
  - list thread metadata
  - load thread messages
  - append user/assistant messages
  - update streamed assistant draft
  - finalize assistant message
  - update thread metadata/title/summary
  - delete thread
  - clear all chat history
  - persist per-thread UI state
- Persistence status should be explicit in runtime state:
  - `ready`
  - `fallback_local_storage`
  - `quota_exceeded`
  - `unavailable`

### 2. Data model changes
Extend the current types so persistence and routing are explicit.

- `ChatThread` should become metadata-first:
  - `id`
  - `title`
  - `model`
  - `createdAt`
  - `updatedAt`
  - `lastMessagePreview`
  - `messageCount`
  - `memorySummary`
  - `summaryUpToSequence`
- Add a persisted `ThreadMessage` shape:
  - `id`
  - `threadId`
  - `sequence`
  - `role`
  - `content`
  - `rawContent`
  - `reasoning`
  - `reasoningState`
  - `attachment`
  - `createdAt`
  - `status`
- Add `ThreadUiState`:
  - `draftText`
  - `scrollTop`
  - `updatedAt`
- Add `AppSettings`:
  - `temperature`
  - `topP`
  - `maxTokenMode`
  - `staticMaxTokens`
  - `percentageMaxTokens`
- Add worker correlation fields:
  - `threadId`
  - `requestId`
- `WorkerRequest.GENERATE` becomes:
  - `threadId`
  - `requestId`
  - `model`
  - `messages`
  - `summary`
  - `options`
  - `image`
- `WorkerResponse` streaming/done/error events must echo:
  - `threadId`
  - `requestId`
  - `modelId`

### 3. Thread lifecycle and correct routing
Refactor the app so chat state is thread-driven, not just `messages`-driven.

- On startup:
  - load all thread metadata from chat store
  - read active thread id from `localStorage`
  - open that thread if it exists
  - otherwise open the most recently updated thread
  - show landing only if no threads exist
- Opening a thread loads:
  - thread metadata
  - message list
  - thread UI state
  - stored model descriptor
- Sending a message:
  - always uses the current active thread id
  - appends the user message to that thread immediately
  - appends a placeholder assistant draft to that same thread
  - sends only that thread’s memory summary + recent messages to the worker
- Streaming tokens:
  - update only the draft assistant message belonging to that `threadId` + `requestId`
  - do not route by `modelId` alone
- Switching threads during generation:
  - allowed for viewing
  - the response continues writing to the original thread
  - composer remains disabled globally until current generation completes
- Loading a different model while a generation is active:
  - defer the actual load until the current request finishes
  - keep UI state explicit so the user understands why send is disabled

### 4. Context and memory management
Implement a real bounded prompt builder.

- Stop passing the full thread and relying on `truncation: true` as the primary policy.
- Add a prompt budget calculation in the worker:
  - reserve output budget based on settings
  - reserve a small safety margin
  - use remaining tokens for prompt context
- Prompt assembly order:
  1. system-level memory summary if present
  2. newest complete turns working backward
  3. pending user turn
- Add rolling summary maintenance per thread:
  - summarize older dropped turns into `memorySummary`
  - update `summaryUpToSequence`
  - keep recent turns verbatim
- Summary content should capture:
  - user preferences
  - ongoing tasks
  - important facts
  - decisions already made
  - unresolved follow-ups
- If summary generation fails:
  - preserve the previous summary
  - fall back to recent-window-only for that turn
- This becomes the canonical behavior when the thread outgrows the model context.

### 5. Settings page replaces reset
Integrate the existing settings concept into the new persistence model.

- Replace `Reset` in the main header with a settings icon/button.
- Add `SettingsDialog` with tabs:
  - `Generation`
  - `Data`
  - `Models`
- `Generation` tab:
  - temperature
  - top-p
  - max output token mode
  - static token count
  - percentage-of-context mode
- Persist `AppSettings` in `localStorage` under a single key.
- Pass generation settings to the worker on every `GENERATE` request.
- `Data` tab:
  - clear chat history
  - clear all app data
  - show storage health/warnings
  - explain whether the app is using IndexedDB or fallback localStorage mode
- `Models` tab:
  - list downloaded model caches via Cache API
  - delete one downloaded model
  - clear all downloaded models
  - optionally show rough size only
- Use approximate cache sizes by default. Do not do expensive full blob iteration in v1.

### 6. Downloaded model management
Add a dedicated cache utility, e.g. `src/cache.ts`.

- `getInstalledModels()`:
  - inspect `transformers-cache`
  - group requests by repo id
  - derive rough size if cheaply available
- `deleteModelCache(modelId)`:
  - remove only cache entries for that model
- `clearAllModelCaches()`:
  - remove all Transformers.js cached artifacts
- Clearing app data from settings should clear:
  - chat history store
  - active thread id
  - recent models
  - verdict cache
  - app settings only if user chooses full reset
- Deleting chat history should not delete downloaded models.

### 7. Curated models and search behavior
Keep the model experience simple and editable.

- Curated/default surfaced models stay in [src/models.ts](/Users/jefree/Documents/Jefree/projects/web-llm/src/models.ts).
- That file should clearly separate:
  - curated list
  - home starters
  - recommended mobile/desktop defaults
- Developers can add supported defaults by editing one model object there.
- Hugging Face search remains in the app:
  - still filtered to browser-compatible candidates
  - searched models are enriched before use
  - once selected, the fully resolved model descriptor is stored with the thread
- Reopening an old thread should never depend on re-searching Hugging Face first.

### 8. Failure handling and fallback behavior
Define explicit storage-failure behavior so the app degrades predictably.

- IndexedDB unavailable/blocked/security failure at startup:
  - switch to `LocalStorageChatStore`
  - show a low-severity notice that chat persistence is running in fallback mode
- IndexedDB quota exceeded:
  - do not silently switch to localStorage
  - show `Storage is full. Delete some chats or downloaded models.`
  - keep existing data readable
  - prevent further writes until space is freed
- Cache API deletion/read failure:
  - show a model-cache specific error in settings
  - do not affect thread history access
- localStorage settings write failure:
  - keep runtime settings in memory for the current session
  - show a small warning that settings could not be saved

## Test Plan
- Boot and restore:
  - no chats shows landing
  - existing chats reopen directly into the last active thread
  - deleted active thread falls back to the most recent remaining thread
- Correct routing:
  - create 5 threads, open the 3rd, send a message, verify only thread 3 changes
  - switch to another thread while thread 3 streams, verify tokens keep landing in thread 3
- Persistence:
  - refresh after sending messages and verify the same thread, messages, and title restore
  - restore draft text and scroll position per thread
  - close the tab mid-stream and verify the latest assistant draft is restored on reopen
- Context handling:
  - long thread exceeds context window
  - recent turns remain present
  - older turns are summarized
  - no silent loss of the newest user turn
- Settings:
  - changing generation settings affects worker generation config
  - settings survive reload
  - clearing chat history removes threads but keeps downloaded models
  - clearing downloaded models does not remove chats
- Fallbacks:
  - IndexedDB unavailable uses localStorage fallback mode
  - IndexedDB quota exceeded shows storage-full warning and stops writes
  - localStorage settings failure keeps session settings only

## Assumptions And Defaults
- Keep [src/models.ts](/Users/jefree/Documents/Jefree/projects/web-llm/src/models.ts) as the curated catalog file instead of renaming it.
- Keep Hugging Face search enabled.
- Keep settings in `localStorage`; move only chat data and thread memory to IndexedDB.
- Use localStorage fallback only for IndexedDB availability failures, not for storage-full conditions.
- Remove `Reset` from the main header and replace it with `Settings`.
- Use approximate downloaded-model size reporting in v1.
