import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AuthenticationError,
  DatasetProcessor,
  InsufficientCreditsError,
  PrivacyBlur,
  PrivacyBlurError,
  RateLimitError,
  ServerError
} from "../src/index.js";

function createMockFetch({ mediaKind = "image", jobStatuses = ["completed"], uploadStatus = 200 } = {}) {
  const seenUploadAuthHeaders = [];
  const seenUploadContentLengthHeaders = [];
  const seenDownloadAuthHeaders = [];
  const seenSubmittedImageUrls = [];
  const statuses = [...jobStatuses];

  const mockFetch = async (url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers ?? {});

    if (parsed.pathname === `/api/v1/uploads/${mediaKind}` && method === "POST") {
      return jsonResponse(uploadStatus, {
        upload_url: "https://uploads.example.com/presigned?signature=abc",
        media_url: `https://cdn.example.com/input.${mediaKind === "image" ? "jpg" : "mp4"}`
      });
    }
    if (parsed.host === "uploads.example.com" && method === "PUT") {
      seenUploadAuthHeaders.push(headers.get("Authorization"));
      seenUploadContentLengthHeaders.push(headers.get("Content-Length"));
      return new Response("");
    }
    if (parsed.pathname === "/api/v1/images/face-blur" && method === "POST") {
      const submitted = JSON.parse(init.body);
      seenSubmittedImageUrls.push(submitted.image_url);
      return jsonResponse(200, { success: true, status: "completed", output_url: "https://files.example.com/output.jpg" });
    }
    if (parsed.pathname === "/api/v1/images/license-plate-blur" && method === "POST") {
      return jsonResponse(200, { success: true, status: "completed", output_url: "https://files.example.com/output.jpg" });
    }
    if (parsed.pathname === "/api/v1/images/blur-anything" && method === "POST") {
      return jsonResponse(200, { success: true, status: "completed", output_url: "https://files.example.com/output.jpg" });
    }
    if (parsed.pathname === "/api/v1/videos/face-blur" && method === "POST") {
      return jsonResponse(200, { success: true, status: "queued", job_id: "job_123" });
    }
    if (parsed.pathname === "/api/v1/videos/face-anonymization" && method === "POST") {
      return jsonResponse(200, { success: true, status: "queued", job_id: "job_123" });
    }
    if (parsed.pathname === "/api/v1/jobs/job_123") {
      const status = statuses.shift();
      if (status === "failed") {
        return jsonResponse(200, { success: true, status: "failed", message: "GPU failure" });
      }
      return jsonResponse(200, {
        success: true,
        status,
        output_url: "https://files.example.com/download/result.bin"
      });
    }
    if (parsed.host === "files.example.com") {
      seenDownloadAuthHeaders.push(headers.get("Authorization"));
      return new Response("processed");
    }
    return jsonResponse(404, { message: "not found" });
  };

  mockFetch.seenUploadAuthHeaders = seenUploadAuthHeaders;
  mockFetch.seenUploadContentLengthHeaders = seenUploadContentLengthHeaders;
  mockFetch.seenDownloadAuthHeaders = seenDownloadAuthHeaders;
  mockFetch.seenSubmittedImageUrls = seenSubmittedImageUrls;
  return mockFetch;
}

test("faceBlur downloads a processed image", async (t) => {
  const dir = await t.mock.fn(async () => {
    const path = join(process.cwd(), ".tmp-tests");
    await mkdir(path, { recursive: true });
    return path;
  })();
  const input = join(dir, "input.jpg");
  const output = join(dir, "output.jpg");
  await writeFile(input, "raw");

  const fetch = createMockFetch();
  const client = new PrivacyBlur({ apiKey: "test-key", fetch, pollInterval: 0 });

  const result = await client.faceBlur({ input, output, blurType: "gaussian" });

  assert.equal(result, output);
  assert.equal(await readFile(output, "utf8"), "processed");
  assert.deepEqual(fetch.seenUploadAuthHeaders, [null]);
  assert.deepEqual(fetch.seenUploadContentLengthHeaders, ["3"]);
  assert.deepEqual(fetch.seenDownloadAuthHeaders, [null]);
  assert.deepEqual(fetch.seenSubmittedImageUrls, ["https://uploads.example.com/presigned"]);
});

test("blurAnything requires a prompt", async () => {
  const client = new PrivacyBlur({ apiKey: "test-key", fetch: createMockFetch() });
  await assert.rejects(
    client.blurAnything({ input: "input.jpg", output: "out.jpg", prompt: " " }),
    /prompt must not be empty/
  );
});

test("video faceBlur polls a queued job until completion", async (t) => {
  const dir = join(process.cwd(), ".tmp-tests");
  await mkdir(dir, { recursive: true });
  const input = join(dir, "input.mp4");
  const output = join(dir, "output.mp4");
  await writeFile(input, "raw");

  const client = new PrivacyBlur({
    apiKey: "test-key",
    fetch: createMockFetch({ mediaKind: "video", jobStatuses: ["queued", "processing", "completed"] }),
    pollInterval: 0
  });

  const result = await client.faceBlur({ input, output, blurType: "pixelated" });

  assert.equal(result, output);
  assert.equal(await readFile(output, "utf8"), "processed");
});

test("failed video jobs raise SDK errors", async () => {
  const dir = join(process.cwd(), ".tmp-tests");
  await mkdir(dir, { recursive: true });
  const input = join(dir, "failed.mp4");
  await writeFile(input, "raw");

  const client = new PrivacyBlur({
    apiKey: "test-key",
    fetch: createMockFetch({ mediaKind: "video", jobStatuses: ["failed"] }),
    pollInterval: 0
  });

  await assert.rejects(client.faceAnonymize({ input, output: join(dir, "failed-output.mp4") }), PrivacyBlurError);
});

test("HTTP errors are normalized", async () => {
  for (const [status, expected] of [
    [401, AuthenticationError],
    [429, RateLimitError],
    [500, ServerError],
    [402, InsufficientCreditsError]
  ]) {
    const dir = join(process.cwd(), ".tmp-tests");
    await mkdir(dir, { recursive: true });
    const input = join(dir, `error-${status}.jpg`);
    await writeFile(input, "raw");

    const payload = status === 402
      ? { error: { code: "insufficient_credits", message: "Not enough credits" } }
      : { message: "boom" };
    const fetch = async () => jsonResponse(status, payload);
    const client = new PrivacyBlur({ apiKey: "test-key", fetch });

    await assert.rejects(client.licensePlateBlur({ input, output: join(dir, `error-${status}-out.jpg`) }), expected);
  }
});

test("DatasetProcessor preserves structure and reports applied operations", async () => {
  const dir = join(process.cwd(), ".tmp-tests", `dataset-${Date.now()}`);
  const dataset = join(dir, "input");
  const output = join(dir, "output");
  await mkdir(join(dataset, "nested"), { recursive: true });
  await writeFile(join(dataset, "nested", "image.jpg"), "raw-image");
  await writeFile(join(dataset, "labels.txt"), "metadata");

  const processor = new DatasetProcessor({
    apiKey: "test-key",
    maxWorkers: 1,
    clientFactory: () => ({
      async faceBlur({ input, output }) {
        await copyOperation(input, output, "face");
      },
      async licensePlateBlur({ input, output }) {
        await copyOperation(input, output, "plate");
      },
      async blurAnything({ input, output }) {
        await copyOperation(input, output, "prompt");
      }
    })
  });

  const report = await processor.processDataset({
    datasetPath: dataset,
    outputPath: output,
    faceBlur: true,
    plateBlur: true,
    blurAnything: true,
    prompt: "person"
  });

  assert.deepEqual(report.toJSON(), {
    images_processed: 1,
    faces_blurred: 1,
    license_plates_blurred: 1,
    objects_blurred: 1,
    errors: 0,
    processing_time_seconds: report.processingTimeSeconds
  });
  assert.equal(await readFile(join(output, "nested", "image.jpg"), "utf8"), "raw-image\nface\nplate\nprompt");
  assert.equal(await readFile(join(output, "labels.txt"), "utf8"), "metadata");
});

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function copyOperation(input, output, label) {
  const current = await readFile(input, "utf8");
  await writeFile(output, `${current}\n${label}`);
}
