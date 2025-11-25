# AGENTS

## Overview
- **Name**: German Audios STT CLI
- **Purpose**: Batch transcribe `.mp3` files from a folder or a single file using OpenAI Whisper (`whisper-1`), writing `.txt` outputs alongside the source.
- **Entry point**: `transcribe.js`
- **Runtime**: Node.js 18+
- **Auth**: `OPENAI_API_KEY` (loadable via `.env` with `dotenv`)

## Usage
- Install deps: `npm install`
- Set API key: add `OPENAI_API_KEY=sk-...` to `.env` (or export in shell)
- Run: `node transcribe.js <folder-or-mp3> [--language=de-DE] [--concurrency=8]`
  - `--language`: maps to Whisper ISO 639-1 (e.g., `de-DE` -> `de`)
  - `--concurrency`: parallel files (default 8)

## Dependencies
- `openai`: Whisper API client
- `dotenv`: optional `.env` loading

## Notes
- Only `.mp3` files are processed; others are ignored.
- Outputs are saved next to source files with the same basename and `.txt` extension.
- Whisper has file size limits; split very large files if needed.
