import { copyFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

import { PrivacyBlur } from "./client.js";
import { PrivacyBlurError } from "./errors.js";

const DATASET_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

export class DatasetProcessReport {
  constructor(values) {
    this.imagesProcessed = values.imagesProcessed;
    this.facesBlurred = values.facesBlurred;
    this.licensePlatesBlurred = values.licensePlatesBlurred;
    this.objectsBlurred = values.objectsBlurred;
    this.errors = values.errors;
    this.processingTimeSeconds = values.processingTimeSeconds;
  }

  toJSON() {
    return {
      images_processed: this.imagesProcessed,
      faces_blurred: this.facesBlurred,
      license_plates_blurred: this.licensePlatesBlurred,
      objects_blurred: this.objectsBlurred,
      errors: this.errors,
      processing_time_seconds: this.processingTimeSeconds
    };
  }
}

export class DatasetProcessor {
  constructor(options = {}) {
    const apiKey = options.apiKey ?? options.api_key;
    if (!apiKey || !String(apiKey).trim()) {
      throw new TypeError("apiKey must not be empty.");
    }
    this.clientOptions = {
      apiKey,
      baseUrl: options.baseUrl ?? options.base_url,
      timeout: options.timeout,
      pollInterval: options.pollInterval ?? options.poll_interval,
      maxPollTime: options.maxPollTime ?? options.max_poll_time,
      maxRetries: options.maxRetries ?? options.max_retries,
      fetch: options.fetch
    };
    this.maxWorkers = options.maxWorkers ?? options.max_workers;
    this.clientFactory = options.clientFactory ?? ((clientOptions) => new PrivacyBlur(clientOptions));
  }

  async processDataset(options) {
    this.validateOptions(options);

    const datasetRoot = resolve(String(options.datasetPath ?? options.dataset_path));
    const outputRoot = resolve(String(options.outputPath ?? options.output_path));
    const scan = await scanDataset(datasetRoot);

    await mkdir(outputRoot, { recursive: true });
    await Promise.all(scan.passthroughFiles.map((item) => copyScanItem(item, outputRoot)));

    const started = Date.now();
    const totals = {
      imagesProcessed: 0,
      facesBlurred: 0,
      licensePlatesBlurred: 0,
      objectsBlurred: 0,
      errors: 0
    };

    const workerCount = resolveWorkerCount(scan.images.length, this.maxWorkers);
    let nextIndex = 0;
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < scan.images.length) {
        const item = scan.images[nextIndex];
        nextIndex += 1;
        try {
          const result = await this.processImage(item, outputRoot, options);
          totals.imagesProcessed += 1;
          totals.facesBlurred += result.facesBlurred;
          totals.licensePlatesBlurred += result.licensePlatesBlurred;
          totals.objectsBlurred += result.objectsBlurred;
        } catch {
          totals.errors += 1;
        }
      }
    });
    await Promise.all(workers);

    return new DatasetProcessReport({
      ...totals,
      processingTimeSeconds: (Date.now() - started) / 1000
    });
  }

  async processImage(item, outputRoot, options) {
    const destination = join(outputRoot, item.relativePath);
    await mkdir(dirname(destination), { recursive: true });
    const client = this.clientFactory(this.clientOptions);
    const tempRoot = await mkdtemp(join(tmpdir(), "privacy-blur-dataset-"));
    const metrics = { facesBlurred: 0, licensePlatesBlurred: 0, objectsBlurred: 0 };
    let currentInput = item.sourcePath;

    try {
      if (options.faceBlur ?? options.face_blur) {
        const nextOutput = join(tempRoot, withStepSuffix(item.sourcePath, "face"));
        await client.faceBlur({ input: currentInput, output: nextOutput, blurType: options.blurType ?? options.blur_type ?? "gaussian" });
        currentInput = nextOutput;
        metrics.facesBlurred += 1;
      }
      if (options.plateBlur ?? options.plate_blur) {
        const nextOutput = join(tempRoot, withStepSuffix(item.sourcePath, "plate"));
        await client.licensePlateBlur({ input: currentInput, output: nextOutput });
        currentInput = nextOutput;
        metrics.licensePlatesBlurred += 1;
      }
      if (options.blurAnything ?? options.blur_anything) {
        const nextOutput = join(tempRoot, withStepSuffix(item.sourcePath, "prompt"));
        await client.blurAnything({ input: currentInput, output: nextOutput, prompt: options.prompt });
        currentInput = nextOutput;
        metrics.objectsBlurred += 1;
      }
      await copyFile(currentInput, destination);
      return metrics;
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  validateOptions(options) {
    const faceBlur = options.faceBlur ?? options.face_blur ?? false;
    const plateBlur = options.plateBlur ?? options.plate_blur ?? false;
    const blurAnything = options.blurAnything ?? options.blur_anything ?? false;
    const plateMode = options.plateMode ?? options.plate_mode ?? "blur";

    if (!options.datasetPath && !options.dataset_path) throw new TypeError("datasetPath is required.");
    if (!options.outputPath && !options.output_path) throw new TypeError("outputPath is required.");
    if (!faceBlur && !plateBlur && !blurAnything) {
      throw new TypeError("At least one dataset privacy operation must be enabled.");
    }
    if (blurAnything && !(options.prompt && String(options.prompt).trim())) {
      throw new TypeError("prompt is required when blurAnything is enabled.");
    }
    if (!["blur", "replace"].includes(plateMode)) {
      throw new TypeError("plateMode must be either 'blur' or 'replace'.");
    }
    if (plateMode === "replace") {
      throw new PrivacyBlurError("plateMode='replace' is not exposed by the current public BGBlur API.");
    }
  }
}

export async function scanDataset(datasetPath) {
  const root = resolve(String(datasetPath));
  const images = [];
  const passthroughFiles = [];

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(sourcePath);
        continue;
      }
      if (!entry.isFile()) continue;

      const item = { sourcePath, relativePath: relative(root, sourcePath) };
      if (DATASET_IMAGE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase())) {
        images.push(item);
      } else {
        passthroughFiles.push(item);
      }
    }
  }

  await walk(root);
  return { images, passthroughFiles };
}

async function copyScanItem(item, outputRoot) {
  const destination = join(outputRoot, item.relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(item.sourcePath, destination);
}

function resolveWorkerCount(imageCount, maxWorkers) {
  if (imageCount <= 1) return 1;
  if (maxWorkers !== undefined && maxWorkers !== null) return Math.max(1, Number(maxWorkers));
  return Math.min(32, imageCount);
}

function withStepSuffix(filePath, step) {
  const extension = extname(filePath);
  const name = basename(filePath, extension);
  return `${name}.${step}${extension}`;
}
