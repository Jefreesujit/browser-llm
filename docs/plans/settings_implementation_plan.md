# Settings & Advanced Configuration Implementation Plan

This plan introduces a new Settings Dialog that replaces the basic "reset" functionality with comprehensive configuration and data management controls. It maintains the "local-first" architecture constraints while giving users fine-grained control over inference and browser storage.

## Proposed Changes

### 1. Types & Storage (`src/types.ts` & `src/storage.ts`)
We will add robust type definitions and localStorage utilities for settings.

#### [MODIFY] `src/types.ts`
- Add `AppSettings` type with options: `temperature` (number), `topP` (number), `maxTokenMode` ('static' | 'percentage'), `staticMaxTokens` (number), and `percentageMaxTokens` (number).
- Update the `GENERATE` event payload in `WorkerRequest` to carry an `options` object with generation configuration overrides.

#### [MODIFY] `src/storage.ts`
- Add `loadAppSettings` and `saveAppSettings` to map `AppSettings` to `localStorage` under a key like `webllm:app-settings`.
- Setup sensible defaults: `temperature: 0.7`, `topP: 0.9`, `maxTokenMode: 'static'`, `staticMaxTokens: 2048`, `percentageMaxTokens: 20`.

---

### 2. Manage Downloaded Models (Cache API) (`src/cache.ts`)
Transformers.js stores local models in the browser's Native Cache API under the cache name `"transformers-cache"`.

#### [NEW] `src/cache.ts`
- Create a utility file to manage the `transformers-cache` storage natively.
- **`getInstalledModels`**: Reads `.keys()` from `caches.open('transformers-cache')`, extracts repository IDs from the Hugging Face `resolve/main` URLs, groups keys by `modelId`, and roughly calculates size.
- **`deleteModelCache(modelId)`**: Scopes through keys matching a specific model ID URL prefix and deletes those specific `Request` objects using `cache.delete(request)`.

---

### 3. Worker Configuration (`src/model.worker.ts`)
The worker needs to read the new settings during the generation phase to override the hardcoded `GENERATION_CONFIG`.

#### [MODIFY] `src/model.worker.ts`
- Read the generation `options` passed over `event.data.payload`.
- Dynamically calculate the `max_new_tokens`. If the context window is set to 8,192 and the percentage is 20%, it will allocate `~1638` output tokens. 
- Ensure bounds checking when dynamically deciding the target limit.
- Apply `temperature` and `top_p`.

---

### 4. Settings Dialog Component
We will build a modal identical in aesthetic to the model picker.

#### [NEW] `src/components/SettingsDialog.tsx`
- Dialog component supporting tabbed navigation ("Generation" and "Data Management").
- **Generation Tab**:
  - Sliders for Temperature and Top-P.
  - A toggle to switch between **Static Tokens** and **Percentage of Context**.
  - Dynamic constraints (e.g. max percentage to 20%).
- **Data Management Tab**:
  - **"Clear Chat History"**: Wipes `chatThreads` but keeps models.
  - **"Clear All Cache"**: Empties memory and deletes `Model Verdict Caches`.
  - **"Downloaded Models"**: Fetches from `src/cache.ts` and renders a list of downloaded models with individual "Delete Model" buttons.

---

### 5. App Orchestration (`src/App.tsx`)
Tie the new dialog to the main UI.

#### [MODIFY] `src/App.tsx`
- Add state for `settingsOpen` and `appSettings`.
- Pass current settings down to the generation `workerRef.current?.postMessage` function. We can compute `max_new_tokens` locally and pass that right into the generation config, alongside context size.
- Replace the current "Reset" button behaviour (or repurpose it as a Settings cog icon). Add a cog/settings button in the sidebar.
- Implement clearing functions (`clearAllChats`, `clearAppData`).

## User Review Required

> [!IMPORTANT]  
> 1. **Cache Sizing Limitations**: Using `caches.keys()` does not return the exact size of the files instantly. To get strict byte counts, we'd have to perform a `.match(req)` and read `response.blob().size`, which can be slow for multi-gigabyte models on some devices. Is it acceptable to skip exact byte totals per model here, or would you like me to try and estimate them using HEAD requests / blob iteration? 
> 2. **Settings UI positioning**: Should the Settings button live top-right in the header, or at the bottom of the sidebar left navigation?

Once you approve (and guide me on the open questions!), I'll start implementation.
