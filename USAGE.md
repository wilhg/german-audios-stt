# Usage Guide

## OpenAI Whisper (default path)
1) Install deps: `npm install`
2) Set credentials:
```bash
OPENAI_API_KEY=sk-... # or put this in a .env file
```
3) Run:
```bash
node transcribe.js <folderOrFile> [<folderOrFile> ...] [--language=de-DE] [--concurrency=8]
```
- `<folderOrFile>`: one or more directories with `.mp3`/`.mp4` files, or `.mp3`/`.mp4` files themselves
- `--language`: language code (default `de-DE`; mapped to ISO 639-1 `de` for Whisper)
- `--concurrency`: parallel files (default 8)

Notes:
- `.mp4` files are converted to audio with `ffmpeg` first (expects `ffmpeg` in PATH).
- Whisper has file size limits; split very large files if needed.
