# Browser LLM Chat

Browser LLM Chat is a fully local-first React application that runs language and vision models directly in the browser with WebGPU. There is no backend inference layer, no API key requirement, and no server-side chat state.

## Highlights

- Local-first inference with `@huggingface/transformers`
- Web Worker based model loading and token streaming
- Shared app state managed with Zustand
- Chat history persisted locally with IndexedDB and localStorage fallback
- Curated browser-ready models plus searchable Hugging Face discovery
- Built-in settings for generation controls and downloaded-model cleanup

## Stack

- React 19
- Vite
- TypeScript
- Vanilla CSS
- `@huggingface/transformers` `4.0.0-next.x`

## Prerequisites

- Node.js `22.x`
- A WebGPU-capable browser
  Recommended: recent Chrome or Edge desktop builds

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Scripts

- `npm run dev`: start the Vite dev server
- `npm run build`: typecheck and build the production bundle
- `npm run preview`: preview the production build locally
- `npm run lint`: run ESLint with zero warnings allowed
- `npm run lint:fix`: apply safe ESLint autofixes
- `npm run format`: format the repo with Prettier
- `npm run format:check`: verify formatting without rewriting files
- `npm run typecheck`: run TypeScript without emitting
- `npm run test`: run the Vitest suite
- `npm run test:watch`: run Vitest in watch mode
- `npm run check`: run lint, typecheck, tests, and build

## Architecture Notes

- `src/App.tsx` is the top-level composition layer for the SPA shell.
- Shared cross-screen UI, chat, and model state lives in `src/store/app-store.ts`.
- Heavy inference work stays in `src/model.worker.ts` plus the focused worker helpers in `src/worker/`.
- Chat persistence is handled locally through `src/chat-store.ts`.
- Lightweight preferences, storage helpers, and storage feedback live in `src/storage.ts`.
- Tests live in `src/test/` so contributors have one place to look for coverage.
- There is intentionally no router or backend inference path.

## Quality Gates

Pull requests are expected to pass:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

GitHub Actions runs the same checks automatically.

## Documentation

- [Architecture overview](docs/architecture.md)
- [Model details](docs/models.md)
- [Contributor guide](CONTRIBUTING.md)
- [Agent context](AGENTS.md)

## Limitations

- First-time model downloads can be large and slow on constrained networks.
- Larger models remain sensitive to browser, VRAM, and device class.
- WebGPU support is required for the supported experience.

## License

MIT
