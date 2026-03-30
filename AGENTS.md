# 🤖 AI Agent Context (AGENTS.md)

This file provides comprehensive context for AI coding assistants (like Antigravity) to understand and work with the **Browser LLM Chat** codebase.

## 🚀 Project Overview
- **Name**: Browser LLM Chat
- **Primary Goal**: Fully local, privacy-first AI chat application running models via WebGPU.
- **Tech Stack**: React 19, Vite, TypeScript, Vanilla CSS.
- **Core Library**: `@huggingface/transformers` (v4.0.0-next.x).

## 🏗️ Architecture Summary
- **No Backend**: Zero server-side inference. All models run in the browser's shared GPU memory.
- **Offloading**: Heavy computation is strictly handled in `src/model.worker.ts` to prevent UI thread blocking.
- **Data Flow**:
  1. `App.tsx` sends messages/images as a `WorkerRequest`.
  2. `model.worker.ts` processes inference using Transformers.js.
  3. `model.worker.ts` sends tokens back as `WorkerResponse`.
  4. `App.tsx` updates React state for real-time streaming.

## 📁 Critical Files
- `src/App.tsx`: Main UI logic, message orchestration, and worker management.
- `src/model.worker.ts`: Worker entry point for Transformers.js inference.
- `src/models.ts`: Configuration for all supported models and quantization settings.
- `src/styles.css`: Custom "glassmorphic" theme.
- `src/types.ts`: Common TypeScript interfaces and enums.

## ⚠️ Architectural Constraints
- **Local-First**: Do NOT attempt to add backend API calls for inference.
- **Web Workers**: Expensive logic (image processing, token generation) MUST stay in the worker.
- **WebGPU Only**: The app target is WebGPU-enabled browsers. Fallback logic is minimal.
- **VRAM Sensitivity**: Be cautious with large models. Use `q4f16` quantization by default.

## 🤝 Contribution Workflow
- Ensure all new logic is fully typed.
- Follow the existing aesthetic: Glassmorphism, CSS variables for colors, and responsive layouts.
- Maintain the single-page, local-only architecture.
