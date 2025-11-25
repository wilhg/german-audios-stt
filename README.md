# German Audios STT CLI

Batch transcribe `.mp3` files in a folder or a single `.mp3` using OpenAI Whisper (`whisper-1`).

## Prerequisites
- Node.js 18+ installed
- `OPENAI_API_KEY` set (e.g., via `.env`)

### Authentication
- Add to `.env` in the project root (or export in your shell):
  ```bash
  OPENAI_API_KEY=sk-...
  ```

## Install
```bash
npm install
```

## Usage
```bash
node transcribe.js <folderPath> [--language=de-DE] [--concurrency=8]
```

- `folderPath`: local directory containing `.mp3` files, or a single `.mp3` file
- `--language`: Speech language code (default `de-DE`). Whisper expects ISO 639-1 codes; `de-DE` will be mapped to `de`.
- `--concurrency`: how many files to process in parallel (default 8). Increase carefully—too high may hit API/storage limits.

Notes:
- OpenAI Whisper has file size limits (see OpenAI docs; keep files reasonably small or split if needed).

Example:
```bash
OPENAI_API_KEY=sk-... node transcribe.js ./audios --language=de-DE --concurrency=8
```

Outputs are written alongside each source file, e.g. `song.mp3` -> `song.txt`.
