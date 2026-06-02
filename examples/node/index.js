import {
  DatasetProcessor,
  InsufficientCreditsError,
  PrivacyBlur,
  PrivacyBlurError
} from "@bgblur/privacy-blur";

const [command, input, output, prompt] = process.argv.slice(2);

if (!process.env.BGBLUR_AI_API_KEY) {
  console.error("Missing BGBLUR_AI_API_KEY. Set it before running this example.");
  process.exit(1);
}

if (!command || !input || !output) {
  printUsage();
  process.exit(2);
}

const clientOptions = {
  apiKey: process.env.BGBLUR_AI_API_KEY,
  baseUrl: process.env.BGBLUR_AI_BASE_URL
};

try {
  if (command === "dataset") {
    const processor = new DatasetProcessor({
      ...clientOptions,
      maxWorkers: Number(process.env.BGBLUR_MAX_WORKERS ?? 4)
    });

    const report = await processor.processDataset({
      datasetPath: input,
      outputPath: output,
      faceBlur: true,
      plateBlur: true,
      blurType: "pixelated"
    });

    console.log(JSON.stringify(report.toJSON(), null, 2));
    process.exit(0);
  }

  const client = new PrivacyBlur(clientOptions);
  let result;

  if (command === "face-blur") {
    result = await client.faceBlur({
      input,
      output,
      blurType: process.env.BGBLUR_BLUR_TYPE ?? "gaussian"
    });
  } else if (command === "license-plate-blur") {
    result = await client.licensePlateBlur({ input, output });
  } else if (command === "blur-anything") {
    result = await client.blurAnything({
      input,
      output,
      prompt: prompt ?? process.env.BGBLUR_PROMPT ?? "person",
      blurType: process.env.BGBLUR_BLUR_TYPE ?? "gaussian"
    });
  } else if (command === "face-anonymize") {
    result = await client.faceAnonymize({ input, output });
  } else {
    printUsage();
    process.exit(2);
  }

  console.log(`Saved processed media to ${result}`);
} catch (error) {
  if (error instanceof InsufficientCreditsError) {
    console.error(error.message);
  } else if (error instanceof PrivacyBlurError) {
    console.error(`PrivacyBlur error: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
}

function printUsage() {
  console.error(`Usage:
  node index.js face-blur <input-image-or-video> <output>
  node index.js license-plate-blur <input-image-or-video> <output>
  node index.js blur-anything <input-image-or-video> <output> <prompt>
  node index.js face-anonymize <input-video> <output-video>
  node index.js dataset <input-directory> <output-directory>`);
}
