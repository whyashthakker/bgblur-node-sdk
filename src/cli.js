#!/usr/bin/env node
import { DatasetProcessor, PrivacyBlur } from "./index.js";

const COMMANDS = new Set(["face-blur", "face-anonymize", "license-plate-blur", "blur-anything", "dataset-process"]);

async function main(argv) {
  const [command, input, output, ...rest] = argv;
  if (!COMMANDS.has(command) || !input || !output) {
    usage();
    process.exitCode = 2;
    return;
  }

  const flags = parseFlags(rest);
  const apiKey = flags.apiKey ?? process.env.BGBLUR_AI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing API key. Set BGBLUR_AI_API_KEY or pass --api-key.");
  }

  const clientOptions = {
    apiKey,
    baseUrl: flags.baseUrl ?? process.env.BGBLUR_AI_BASE_URL,
    pollInterval: flags.pollInterval ? Number(flags.pollInterval) : undefined,
    maxPollTime: flags.maxPollTime ? Number(flags.maxPollTime) : undefined
  };

  if (command === "dataset-process") {
    const processor = new DatasetProcessor({ ...clientOptions, maxWorkers: flags.maxWorkers ? Number(flags.maxWorkers) : undefined });
    const report = await processor.processDataset({
      datasetPath: input,
      outputPath: output,
      faceBlur: flags.faceBlur === "true",
      plateBlur: flags.plateBlur === "true",
      blurAnything: flags.blurAnything === "true",
      prompt: flags.prompt,
      blurType: flags.blurType ?? "gaussian"
    });
    console.log(JSON.stringify(report.toJSON(), null, 2));
    return;
  }

  const client = new PrivacyBlur(clientOptions);

  let result;
  if (command === "face-blur") {
    result = await client.faceBlur({ input, output, blurType: flags.blurType ?? "gaussian" });
  } else if (command === "face-anonymize") {
    result = await client.faceAnonymize({ input, output });
  } else if (command === "license-plate-blur") {
    result = await client.licensePlateBlur({ input, output });
  } else {
    result = await client.blurAnything({ input, output, prompt: flags.prompt, blurType: flags.blurType ?? "gaussian" });
  }

  console.log(result);
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = "true";
    } else {
      flags[key] = next;
      i += 1;
    }
  }
  return flags;
}

function usage() {
  console.error(`Usage:
  privacy-blur face-blur <input> <output> [--blur-type gaussian|pixelated]
  privacy-blur face-anonymize <input.mp4> <output.mp4>
  privacy-blur license-plate-blur <input> <output>
  privacy-blur blur-anything <input> <output> --prompt "person"
  privacy-blur dataset-process <input-dir> <output-dir> --face-blur --plate-blur

Options:
  --api-key <key>          Defaults to BGBLUR_AI_API_KEY
  --base-url <url>         Defaults to BGBLUR_AI_BASE_URL or https://www.bgblur.com
  --poll-interval <sec>    Job polling interval
  --max-poll-time <sec>    Maximum wait time for async jobs
  --max-workers <count>    Dataset concurrency`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
