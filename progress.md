Original prompt: Implement a controlled model picker and compatibility-gated search flow for the browser LLM app, including a landing screen, curated catalog, text-only Hugging Face search, device-aware compatibility labels, and descriptor-based worker loading while keeping the app local-first and simple.

- Started refactor from fixed model modes to descriptor-based model selection.
- Need to preserve existing user changes in `.gitignore` and `index.html`.
- Added descriptor-based types, curated model catalog, device detection, compatibility heuristics, local storage helpers, and Hugging Face search/detail helpers.
- Reworked the app shell into a landing screen, shared model picker, confirmation flow, and descriptor-based chat view.
- Refactored the worker to load models by descriptor instead of fixed modes while preserving curated vision loading.
- Verification:
  - `npm run build`
  - `npm run preview -- --host 127.0.0.1 --port 4173`
  - `curl -I http://127.0.0.1:4173/`
