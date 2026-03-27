# 🌐 Browser LLM Chat

A high-performance, **100% local-first** React application designed to run Large Language Models directly in your browser. Leveraging **WebGPU** via `@huggingface/transformers`, this experiment brings powerful inference to the client-side with no backend required.

![Browser LLM Chat Interface](https://img.shields.io/badge/Status-Experimental-orange)
![WebGPU-Powered](https://img.shields.io/badge/Powered%20By-WebGPU-blue)
![Local-First](https://img.shields.io/badge/Privacy-Local--First-green)

---

## ✨ Key Features

- **🚀 100% Local Inference**: Your prompts, images, and model outputs never leave your browser. Privacy is built-in by design.
- **⚡ WebGPU Accelerated**: Utilizes your GPU's power for near-native performance on compatible browsers (Chrome/Edge Desktop).
- **🧠 Advanced Model Support**:
  - **Fast (SmolLM2-360M)**: Ultra-quick response times with a tiny footprint.
  - **Thinking (Qwen 3 - 0.6B)**: Built-in reasoning capabilities for complex logic.
  - **Vision (Qwen 3.5 - 0.8B)**: Fully multimodal support for image-to-text tasks.
- **💾 Automatic Caching**: Model weights are fetched from Hugging Face once and stored in your browser's Cache Storage for instant subsequent loads.
- **🧵 Worker-Based Architecture**: Heavy computation happens in a dedicated Web Worker to keep the UI smooth and responsive.

---

## 🛠 Tech Stack

- **Core**: [React 19](https://react.dev/), Vite, TypeScript
- **Inference**: [@huggingface/transformers (v4.0.0-next)](https://github.com/huggingface/transformers.js)
- **Styling**: Vanilla CSS (Custom UI with glassmorphism and modern aesthetics)
- **Formatting**: `react-markdown` with `remark-gfm` for rich text and reasoning blocks.

---

## 🚀 Getting Started

### Prerequisites

- A browser with **WebGPU support** (Recommended: Chrome 113+ or Edge 113+ on Desktop).
- [Node.js](https://nodejs.org/) installed.

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd web-llm
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```

4. **Open in Browser**: Navigate to `http://localhost:5173`.

---

## 📝 Notes & Limitations

- **First Load**: The initial model download (200MB - 900MB depending on the model) may take some time depending on your connection.
- **VRAM**: Older GPUs with limited VRAM may struggle with the Vision/Thinking models.
- **Environment**: This is an experimental proof-of-concept.

---

## 🤝 Credits

Special thanks to the **Hugging Face** team for the amazing [transformers.js](https://huggingface.co/docs/transformers.js/index) library and the open-source community for the quantized ONNX models.

---

Built with ❤️ for the future of local AI.
