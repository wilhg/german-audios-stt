#!/usr/bin/env node
import fs from "fs";
import path from "path";
import os from "os";
import process from "process";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import OpenAI from "openai";
import dotenv from "dotenv";

const fsp = fs.promises;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env if present
dotenv.config();

const USAGE = `
Usage: node transcribe.js <folderPath> [--language=de-DE] [--concurrency=8]

Environment: OPENAI_API_KEY must be set. Uses OpenAI Whisper (whisper-1).
Supports .mp3 directly and .mp4 via ffmpeg audio extraction.
`.trim();

const parseArgs = () => {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    throw new Error(USAGE);
  }

  const folderPath = path.resolve(args[0]);

  let languageCode = "de-DE";
  let concurrency = 8;

  args.slice(2).forEach((arg) => {
    if (arg.startsWith("--language=")) {
      languageCode = arg.split("=", 2)[1];
    } else if (arg.startsWith("--concurrency=")) {
      const parsed = Number(arg.split("=", 2)[1]);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error("--concurrency must be a positive integer");
      }
      concurrency = parsed;
    }
  });

  return { folderPath, languageCode, concurrency };
};

const ensurePath = async (targetPath) => {
  const stat = await fsp.stat(targetPath);
  if (!stat.isDirectory() && !stat.isFile()) {
    throw new Error(`Provided path is neither a file nor a directory: ${targetPath}`);
  }
  return stat;
};

const isSupportedAudio = (fileName) => {
  const ext = path.extname(fileName).toLowerCase();
  return ext === ".mp3" || ext === ".mp4";
};

const collectAudioFiles = async (targetPath, stat) => {
  if (stat.isFile()) {
    if (!isSupportedAudio(targetPath)) {
      throw new Error("Provided file is not an .mp3 or .mp4");
    }
    return [targetPath];
  }

  const entries = await fsp.readdir(targetPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isSupportedAudio(entry.name))
    .map((entry) => path.join(targetPath, entry.name));
};

const toWhisperLanguage = (languageCode) => {
  if (!languageCode) return undefined;
  const short = languageCode.split("-")[0];
  return short || undefined;
};

const transcribeWithOpenAI = async (openai, filePath, languageCode) => {
  const language = toWhisperLanguage(languageCode);
  const stream = fs.createReadStream(filePath);
  const response = await openai.audio.transcriptions.create({
    file: stream,
    model: "whisper-1",
    language,
    // Prompt intentionally omitted to avoid biasing.
  });

  if (!response.text) {
    throw new Error(`No transcript returned for ${filePath}`);
  }

  return response.text.trim();
};

const saveTranscript = async (filePath, transcript) => {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const outputPath = path.join(dir, `${base}.txt`);
  await fsp.writeFile(outputPath, transcript, "utf8");
  return outputPath;
};

const runCommand = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });

const hasFfmpeg = () =>
  new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });

const ensureFfmpegForMp4 = async (files) => {
  const needsFfmpeg = files.some((file) => path.extname(file).toLowerCase() === ".mp4");
  if (!needsFfmpeg) return;

  const available = await hasFfmpeg();
  if (!available) {
    throw new Error("ffmpeg is required to process .mp4 files but was not found in PATH.");
  }
};

const extractAudioFromMp4 = async (filePath) => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "stt-audio-"));
  const outputPath = path.join(
    tempDir,
    `${path.basename(filePath, path.extname(filePath))}.mp3`
  );

  console.log(`Extracting audio from ${filePath}...`);
  await runCommand("ffmpeg", [
    "-y",
    "-i",
    filePath,
    "-vn",
    "-acodec",
    "libmp3lame",
    "-loglevel",
    "error",
    outputPath,
  ]);

  return { outputPath, tempDir };
};

const processFile = async (clients, options, filePath) => {
  const { openai } = clients;
  const { languageCode } = options;

  console.log(`Processing ${filePath}...`);

  const ext = path.extname(filePath).toLowerCase();
  let audioPath = filePath;
  let cleanupDir;

  if (ext === ".mp4") {
    const { outputPath, tempDir } = await extractAudioFromMp4(filePath);
    audioPath = outputPath;
    cleanupDir = tempDir;
  }

  try {
    const transcript = await transcribeWithOpenAI(openai, audioPath, languageCode);
    const outputPath = await saveTranscript(filePath, transcript);
    console.log(`Saved transcript to ${outputPath}`);
  } finally {
    if (cleanupDir) {
      await fsp.rm(cleanupDir, { recursive: true, force: true });
    }
  }
};

const runWithConcurrency = async (items, limit, fn) => {
  const queue = [...items];
  const results = [];

  const worker = async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      // eslint-disable-next-line no-await-in-loop
      const res = await fn(item);
      results.push(res);
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
};

const main = async () => {
  const { folderPath, languageCode, concurrency } = parseArgs();
  const stat = await ensurePath(folderPath);

  const audioFiles = await collectAudioFiles(folderPath, stat);
  if (audioFiles.length === 0) {
    console.log(`No .mp3 or .mp4 files found in ${folderPath}`);
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  const openai = new OpenAI({ apiKey });

  await ensureFfmpegForMp4(audioFiles);

  await runWithConcurrency(audioFiles, concurrency, (filePath) =>
    processFile({ openai }, { languageCode }, filePath)
  );

  console.log("All files processed.");
};

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
