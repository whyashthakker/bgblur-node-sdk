import { createReadStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { randomUUID } from "node:crypto";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PrivacyBlur, PrivacyBlurError } from "@bgblur/privacy-blur";
import express from "express";
import multer from "multer";

const port = Number(process.env.PORT ?? 3000);
const uploadDir = process.env.UPLOAD_DIR ?? "tmp/uploads";
const outputDir = process.env.OUTPUT_DIR ?? "tmp/outputs";

const requiredEnv = [
  "BGBLUR_AI_API_KEY",
  "AWS_REGION",
  "S3_BUCKET"
];

for (const name of requiredEnv) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

await mkdir(uploadDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

const app = express();
const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_BYTES ?? 1024 * 1024 * 1024)
  }
});

const privacyBlur = new PrivacyBlur({
  apiKey: process.env.BGBLUR_AI_API_KEY,
  baseUrl: process.env.BGBLUR_AI_BASE_URL
});

const s3 = new S3Client({
  region: process.env.AWS_REGION
});

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/privacy-blur", upload.single("media"), async (request, response) => {
  if (!request.file) {
    response.status(400).json({ error: "Upload a file with form field name 'media'." });
    return;
  }

  const operation = String(request.body.operation ?? "face-blur");
  const prompt = request.body.prompt ? String(request.body.prompt) : undefined;
  const blurType = request.body.blurType ? String(request.body.blurType) : "gaussian";
  const originalExtension = extname(request.file.originalname);
  const inputPath = request.file.path;
  const outputPath = join(outputDir, `${randomUUID()}${originalExtension || ".bin"}`);

  try {
    await runPrivacyOperation({
      operation,
      inputPath,
      outputPath,
      prompt,
      blurType
    });

    const s3Key = buildResultKey({
      originalName: request.file.originalname,
      extension: extname(outputPath)
    });

    await uploadFileToS3({
      filePath: outputPath,
      bucket: process.env.S3_BUCKET,
      key: s3Key,
      contentType: request.file.mimetype
    });

    const expiresIn = Number(process.env.RESULT_URL_EXPIRES_SECONDS ?? 3600);
    const resultUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: s3Key
      }),
      { expiresIn }
    );

    response.json({
      operation,
      bucket: process.env.S3_BUCKET,
      key: s3Key,
      resultUrl,
      expiresIn
    });
  } catch (error) {
    const status = error instanceof PrivacyBlurError ? 502 : 500;
    response.status(status).json({
      error: error.message ?? "Unknown error"
    });
  } finally {
    await rm(inputPath, { force: true });
    await rm(outputPath, { force: true });
  }
});

app.listen(port, () => {
  console.log(`PrivacyBlur Express S3 example listening on http://localhost:${port}`);
});

async function runPrivacyOperation({ operation, inputPath, outputPath, prompt, blurType }) {
  if (operation === "face-blur") {
    return privacyBlur.faceBlur({
      input: inputPath,
      output: outputPath,
      blurType
    });
  }

  if (operation === "license-plate-blur") {
    return privacyBlur.licensePlateBlur({
      input: inputPath,
      output: outputPath
    });
  }

  if (operation === "blur-anything") {
    if (!prompt) {
      throw new Error("prompt is required when operation is blur-anything.");
    }
    return privacyBlur.blurAnything({
      input: inputPath,
      output: outputPath,
      prompt,
      blurType
    });
  }

  if (operation === "face-anonymize") {
    return privacyBlur.faceAnonymize({
      input: inputPath,
      output: outputPath
    });
  }

  throw new Error(`Unsupported operation: ${operation}`);
}

async function uploadFileToS3({ filePath, bucket, key, contentType }) {
  const body = createReadStream(filePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream"
    })
  );
}

function buildResultKey({ originalName, extension }) {
  const folder = process.env.S3_RESULT_PREFIX ?? "privacy-blur/results";
  const safeName = basename(originalName, extname(originalName))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${folder}/${Date.now()}-${randomUUID()}-${safeName || "media"}${extension}`;
}
