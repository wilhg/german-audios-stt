#!/usr/bin/env node
import fs from "fs";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";
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

const collectMp3Files = async (targetPath, stat) => {
  if (stat.isFile()) {
    if (!targetPath.toLowerCase().endsWith(".mp3")) {
      throw new Error("Provided file is not an .mp3");
    }
    return [targetPath];
  }

  const entries = await fsp.readdir(targetPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp3"))
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

const processFile = async (clients, options, filePath) => {
  const { openai } = clients;
  const { languageCode } = options;

  console.log(`Processing ${filePath}...`);

  const transcript = await transcribeWithOpenAI(openai, filePath, languageCode);
  const outputPath = await saveTranscript(filePath, transcript);
  console.log(`Saved transcript to ${outputPath}`);
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

  const mp3Files = await collectMp3Files(folderPath, stat);
  if (mp3Files.length === 0) {
    console.log(`No .mp3 files found in ${folderPath}`);
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  const openai = new OpenAI({ apiKey });

  await runWithConcurrency(mp3Files, concurrency, (filePath) =>
    processFile({ openai }, { languageCode }, filePath)
  );

  console.log("All files processed.");
};

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
