import { access } from "node:fs/promises";
import { resolve } from "node:path";

import { APIClient } from "./http.js";
import { PrivacyBlurError } from "./errors.js";
import { buildPublicApiRequest, detectMediaKind, extractNestedValue, sleep } from "./utils.js";

const DEFAULTS = {
  baseUrl: "https://www.bgblur.com",
  timeout: 300,
  pollInterval: 2,
  maxPollTime: 1800,
  maxRetries: 3,
  backoffFactor: 0.5,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504]
};

export class PrivacyBlur {
  constructor(options = {}) {
    const apiKey = options.apiKey ?? options.api_key;
    if (!apiKey || !String(apiKey).trim()) {
      throw new TypeError("apiKey must not be empty.");
    }

    this.config = {
      ...DEFAULTS,
      ...options,
      apiKey: String(apiKey),
      baseUrl: options.baseUrl ?? options.base_url ?? DEFAULTS.baseUrl,
      pollInterval: options.pollInterval ?? options.poll_interval ?? DEFAULTS.pollInterval,
      maxPollTime: options.maxPollTime ?? options.max_poll_time ?? DEFAULTS.maxPollTime,
      maxRetries: options.maxRetries ?? options.max_retries ?? DEFAULTS.maxRetries,
      retryableStatusCodes: options.retryableStatusCodes ?? DEFAULTS.retryableStatusCodes
    };
    this.api = options.apiClient ?? new APIClient(this.config);
  }

  async faceBlur({ input, output, blurType = "gaussian", blur_type }) {
    return this.process({
      operation: "face_blur",
      input,
      output,
      options: { blurType: blur_type ?? blurType }
    });
  }

  async faceAnonymize({ input, output }) {
    return this.process({ operation: "face_anonymize", input, output, options: {} });
  }

  async licensePlateBlur({ input, output }) {
    return this.process({ operation: "license_plate_blur", input, output, options: {} });
  }

  async blurAnything({ input, prompt, output, blurType = "gaussian", blur_type }) {
    if (!prompt || !String(prompt).trim()) {
      throw new TypeError("prompt must not be empty.");
    }
    return this.process({
      operation: "blur_anything",
      input,
      output,
      options: { prompt: String(prompt), blurType: blur_type ?? blurType }
    });
  }

  async process({ operation, input, output, options }) {
    const inputPath = resolve(String(input));
    const outputPath = resolve(String(output));
    await access(inputPath);

    const mediaKind = detectMediaKind(inputPath);
    if (operation === "face_anonymize" && mediaKind !== "video") {
      throw new PrivacyBlurError("faceAnonymize is only supported for videos in the current BGBlur API.");
    }

    const uploadTarget = await this.api.createUploadTarget(inputPath, mediaKind);
    const mediaUrl = await this.api.uploadFile(inputPath, uploadTarget);
    const payload = await this.submitPublicOperation({ operation, mediaKind, mediaUrl, options });

    const status = String(extractNestedValue(payload, ["status"]) ?? "").toLowerCase();
    const outputUrl = extractNestedValue(payload, ["output_url", "result.output_url", "result.file_url", "file_url", "url"]);
    const jobId = extractNestedValue(payload, ["job_id", "jobId", "id", "batch_request_id"]);

    if (outputUrl) {
      return this.api.downloadFile(String(outputUrl), outputPath);
    }
    if (jobId && ["queued", "processing", "pending", "unknown"].includes(status)) {
      const result = await this.waitForJob(String(jobId));
      return this.api.downloadFile(result.downloadUrl, outputPath);
    }
    throw new PrivacyBlurError("Operation did not return an output URL or a pollable job ID.");
  }

  async submitPublicOperation({ operation, mediaKind, mediaUrl, options }) {
    const [endpoint, payload] = buildPublicApiRequest({ operation, mediaKind, mediaUrl, options });
    return this.api.submitOperation(endpoint, payload);
  }

  async waitForJob(jobId) {
    const start = Date.now();

    while (true) {
      const payload = await this.api.getJob(jobId);
      const status = String(extractNestedValue(payload, ["status", "job.status"]) ?? "").toLowerCase();

      if (["completed", "succeeded", "success"].includes(status)) {
        const downloadUrl = extractNestedValue(payload, [
          "output_url",
          "download_url",
          "result.output_url",
          "result.file_url",
          "result.url",
          "output.url"
        ]);
        if (!downloadUrl) {
          throw new PrivacyBlurError("Completed job response did not include a download URL.");
        }
        return { jobId, status, downloadUrl: String(downloadUrl), rawResponse: payload };
      }

      if (["failed", "error", "cancelled", "canceled"].includes(status)) {
        const message = extractNestedValue(payload, ["message", "error", "detail", "result.error"]);
        throw new PrivacyBlurError(`Remote job failed: ${message ?? "unknown error"}`);
      }

      if ((Date.now() - start) / 1000 > this.config.maxPollTime) {
        throw new PrivacyBlurError(`Timed out waiting for job ${jobId} after ${this.config.maxPollTime} seconds.`);
      }

      await sleep(this.config.pollInterval * 1000);
    }
  }
}
