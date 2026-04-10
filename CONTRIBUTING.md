# Contributing to Browser LLM Chat

## Setup

Use Node `22.x`, then install dependencies:

```bash
npm install
```

Run the app locally with:

```bash
npm run dev
```

## Required Checks

Before opening a pull request, run:

```bash
npm run check
```

That command validates linting, type safety, tests, and the production build.

## Working Rules

- Keep the app local-first. Do not add backend inference calls.
- Keep expensive inference, summarization, and model work inside the worker layer.
- Preserve the current SPA structure. Do not add router-driven page navigation unless explicitly scoped.
- Keep new code fully typed.
- Prefer small focused modules and hooks over growing monolith files.
- Reuse shared helpers for storage, dialog behavior, and model logic instead of duplicating patterns.

## Coding Standards

- ESLint is the source of truth for lint rules.
- Prettier is the source of truth for formatting.
- Prefer type-only imports where possible.
- Add tests for extracted pure logic and regressions when refactoring behavior-heavy code.

## Suggested Workflow

1. Create a branch from `main`.
2. Make focused changes with clear commit scope.
3. Run `npm run check`.
4. Update docs when contributor behavior, scripts, or architecture expectations change.
5. Open a pull request with a concise summary and validation notes.

## Architecture Boundaries

- `src/App.tsx`: app composition and screen orchestration
- `src/store/`: shared app state
- `src/components/`: presentational UI
- `src/hooks/`: reusable React behavior
- `src/worker/`: model runtime domains
- `src/chat-store.ts` and `src/storage.ts`: persistence concerns
- `src/test/`: shared test coverage for app and worker logic

Keep responsibilities aligned with those boundaries when adding new code.
