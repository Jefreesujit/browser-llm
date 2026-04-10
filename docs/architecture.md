# 🏗️ Application Architecture

**Browser LLM Chat** is a high-performance, client-side application designed to run Large Language Models directly in the user's browser. It eliminates the need for a backend inference server, ensuring maximum privacy and reduced infrastructure costs.

## Core Components

### 1. **React UI (Vite + TypeScript)**

The user interface is built with **React 19** and **Vite**, focusing on a clean, responsive, and "glassmorphic" aesthetic. Shared app state is centralized in a lightweight **Zustand** store, while local component-only draft state remains local to the components that own it.

### 2. **WebGPU Acceleration**

The application uses the **WebGPU API** to leverage the user's graphics hardware for model inference. This provides near-native performance for transformer-based models by utilizing the parallel processing power of modern GPUs.

### 3. **Web Worker Threading**

To ensure a smooth UI experience, all heavy lifting (model loading, processing, summarization, and inference) is offloaded to a **dedicated Web Worker** (`model.worker.ts`). Communication between the UI and the worker happens asynchronously via the `postMessage` API. The worker is kept intentionally coarse-grained: the entry file handles message routing, while a small `src/worker/` set owns model session state, conversation budgeting, and generation logic.

### 4. **Transformers.js (v4.0.0-next)**

We use the `@huggingface/transformers` library to handle:

- **ONNX Model Loading**: Loading quantized model weights.
- **Tokenization**: Converting text to numerical input.
- **Inference**: Running the model and streaming output tokens.

---

## 🔒 Security & Privacy

### **100% Local-First**

- **No Data Leakage**: Your prompts, images, and model outputs never leave your machine. There is no backend telemetry or logging of your conversations.
- **Offline Capable**: Once the model weights are downloaded into the browser cache, the application can run fully offline.

### **Model Provenance**

- Models are fetched directly from the [Hugging Face Hub](https://huggingface.co/models). We use official and community-quantized versions of reputable models (SmolLM, Qwen).

### **Safe Model Execution**

- The models run within the browser's sandboxed environment. They cannot access your local file system (except through explicit user-provided file uploads) or other browser data.

---

## 💡 Local Inference Benefits

- **Zero Latency**: No network round-trips for inference.
- **Privacy By Design**: Ideal for sensitive or personal queries.
- **Cost Effective**: No expensive GPU server hosting required.

---

## 📁 Project Layout

- `src/App.tsx`: SPA shell composition and screen orchestration
- `src/store/app-store.ts`: shared app state and actions
- `src/components/`: visible UI sections and dialogs
- `src/hooks/`: reusable React behaviors that are shared across screens
- `src/chat-store.ts`: durable chat persistence and legacy thread migration
- `src/storage.ts`: lightweight browser state and storage feedback helpers
- `src/model.worker.ts` + `src/worker/`: inference runtime
- `src/test/`: centralized app and worker tests
