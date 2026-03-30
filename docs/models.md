# 🧠 Supported Models

The **Browser LLM Chat** application currently supports several models, each tailored for different performance and reasoning needs.

## 1. **Fast Chat (SmolLM2-360M)**
- **Model ID**: `HuggingFaceTB/SmolLM2-360M-Instruct`
- **Params**: 360 million
- **Context**: 8,192 tokens
- **Download size**: ~273 MB
- **Description**: Optimized for rapid responses and lower memory footprints. It's the best option for quick queries and older hardware.

## 2. **Thinking Model (Qwen 3 - 0.6B)**
- **Model ID**: `onnx-community/Qwen3-0.6B-ONNX`
- **Params**: 0.6 billion
- **Context**: 32,768 tokens
- **Features**: Built-in "thinking" capabilities. It can reason through complex problems before generating an answer.
- **Description**: Slower than the Fast model, but more capable at logic and step-by-step problem-solving.

## 3. **Vision Model (Qwen 3.5 - 0.8B)**
- **Model ID**: `onnx-community/Qwen3.5-0.8B-ONNX`
- **Params**: 0.8 billion
- **Context**: 262,144 tokens
- **Features**: Multi-modal support (images + text).
- **Description**: High-capacity model capable of understanding and describing visual inputs.

---

## 🛠 Model Quantization (ONNX)
All models are served as **quantized ONNX (Open Neural Network Exchange)** files. Quantization reduces the model's memory footprint and improves inference speed with minimal impact on accuracy.

### **How models are loaded**
- **First Load**: Fetched from Hugging Face Hub and cached in the browser's Cache Storage.
- **Subsequent Loads**: Loaded instantly from the local browser cache.

### **WebGPU Requirements**
- Requires specific `q4f16` (4-bit quantized, FP16) or `q8` (8-bit quantized) dtypes depending on browser and GPU features.
