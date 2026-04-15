# Browser Audio Models Inventory

Date: 2026-04-01

This research pass inventories Hugging Face speech repos that are discoverable with the Hub filter `transformers.js` and audio task tags, then estimates the minimum model payload needed to run them in-browser.

Files:
- `browser-audio-model-inventory-2026-04-01.csv`
- `browser-audio-model-inventory-2026-04-01.json`

Inventory scope:
- 254 STT/ASR repos
- 58 TTS repos
- 312 total repos

Support buckets:
- `direct_pipeline`: matches the current high-level Transformers.js speech pipeline path in this repo
- `custom_browser`: browser-capable, but likely needs custom model wiring instead of the simple pipeline API
- `unknown_or_not_supported`: tagged for browser use on the Hub, but not a clean fit for the installed package or current pipeline path

Smallest practical canonical models:

STT:
- `onnx-community/moonshine-tiny-ONNX`
  - Parameter estimate: 27M
  - Minimum runtime download estimate: 32.01 MB
  - Repo storage on Hub: 1700.37 MB
- `Xenova/whisper-tiny.en`
  - Parameter estimate: 39M
  - Minimum runtime download estimate: 44.46 MB
  - Repo storage on Hub: 7651.67 MB
- `Xenova/wav2vec2-base-960h`
  - Parameter estimate: 95M
  - Minimum runtime download estimate: 66.48 MB
  - Repo storage on Hub: 1852.65 MB

TTS:
- `Xenova/mms-tts-eng`
  - Parameter estimate: 36.3M
  - Minimum runtime download estimate: 38.37 MB
  - Repo storage on Hub: 210.75 MB
- `Xenova/speecht5_tts`
  - Parameter estimate: 144M
  - Minimum runtime download estimate: 131.81 MB
  - Repo storage on Hub: 4412.79 MB
  - Note: estimate includes default `Xenova/speecht5_hifigan`; still needs speaker embeddings at inference time
- `onnx-community/Supertonic-TTS-ONNX`
  - Parameter estimate: 66M
  - Minimum runtime download estimate: 262.82 MB
  - Repo storage on Hub: 263.29 MB

Smallest browser-capable custom TTS models:
- `onnx-community/kitten-tts-nano-0.1-ONNX`
  - Minimum runtime download estimate: 23.80 MB
- `onnx-community/KittenTTS-Micro-v0.8-ONNX`
  - Parameter estimate: ~41M
  - Minimum runtime download estimate: 41.39 MB
- `onnx-community/Kokoro-82M-ONNX`
  - Parameter estimate: 82M
  - Minimum runtime download estimate: 92.89 MB

Notes:
- Some repos expose very large total storage because they publish many quantization variants. The `minimum_runtime_download` estimate is the more useful number for browser UX.
- A few repos are clearly tests or incomplete community exports. The CSV/JSON include them for completeness, but the canonical picks above are the safest starting points for product work.
