# Usage Guide

## OpenAI Whisper (default path)
1) Install deps: `npm install`
2) Set credentials:
```bash
OPENAI_API_KEY=sk-... # or put this in a .env file
```
3) Run:
```bash
node transcribe.js <folderPath> [--language=de-DE] [--concurrency=8]
```
- `<folderPath>`: directory with `.mp3` files, or a single `.mp3` file
- `--language`: language code (default `de-DE`; mapped to ISO 639-1 `de` for Whisper)
- `--concurrency`: parallel files (default 8)

Notes:
- Whisper has file size limits; split very large files if needed.
