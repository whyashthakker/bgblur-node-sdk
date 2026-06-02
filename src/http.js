import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  AuthenticationError,
  InsufficientCreditsError,
  PrivacyBlurError,
  RateLimitError,
  ServerError
} from "./errors.js";
import { extractNestedValue, guessContentType, sleep } from "./utils.js";

export class APIClient {
  constructor(config) {
    this.config = config;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.fetch = config.fetch ?? globalThis.fetch;
    if (typeof this.fetch !== "function") {
      throw new PrivacyBlurError("A fetch implementation is required. Use Node.js 18.17+ or pass fetch in the client options.");
    }
  }

  async createUploadTarget(filePath, mediaKind) {
    const info = await stat(filePath);
    const payload = await this.requestJson("POST", `/api/v1/uploads/${mediaKind}`, {
      json: {
        file_name: filePath.split(/[\\/]/).pop(),
        file_type: guessContentType(filePath, mediaKind),
        file_size: info.size
      }
    });

    const uploadUrl = extractNestedValue(payload, ["upload_url", "uploadUrl"]);
    const mediaUrl = extractNestedValue(payload, ["media_url", "image_url", "video_url"]);
    if (!uploadUrl || !mediaUrl) {
      throw new PrivacyBlurError("Upload target response did not include upload_url and media_url.");
    }
    return {
      uploadUrl: String(uploadUrl),
      mediaUrl: String(mediaUrl),
      mediaKind,
      uploadObjectUrl: String(uploadUrl).split("?", 1)[0]
    };
  }

  async uploadFile(filePath, target) {
    const response = await this.request("PUT", target.uploadUrl, {
      body: createReadStream(filePath),
      headers: { "Content-Type": guessContentType(filePath, target.mediaKind) },
      includeAuth: false
    });
    await this.raiseForStatus(response);
    return target.uploadObjectUrl ?? target.mediaUrl;
  }

  async submitOperation(endpoint, payload) {
    return this.requestJson("POST", endpoint, { json: payload });
  }

  async getJob(jobId) {
    return this.requestJson("GET", `/api/v1/jobs/${jobId}`);
  }

  async downloadFile(url, destination) {
    await mkdir(dirname(destination), { recursive: true });
    const response = await this.request("GET", url, { includeAuth: false });
    await this.raiseForStatus(response);
    if (!response.body) {
      throw new PrivacyBlurError("Download response did not include a body.");
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
    return destination;
  }

  async requestJson(method, url, options = {}) {
    const response = await this.request(method, url, options);
    await this.raiseForStatus(response);
    try {
      const payload = await response.json();
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new PrivacyBlurError("API returned an unexpected response payload.");
      }
      return payload;
    } catch (error) {
      if (error instanceof PrivacyBlurError) throw error;
      throw new PrivacyBlurError("API returned invalid JSON.", { cause: error });
    }
  }

  async request(method, url, options = {}) {
    const includeAuth = options.includeAuth ?? true;
    const attempts = this.config.maxRetries;
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeout * 1000);
      try {
        const headers = new Headers(options.headers ?? {});
        if (includeAuth) headers.set("Authorization", `Bearer ${this.config.apiKey}`);
        if (includeAuth) headers.set("Accept", "application/json");
        if (options.json !== undefined) headers.set("Content-Type", "application/json");

        const requestOptions = {
          method,
          headers,
          body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
          signal: controller.signal
        };
        if (options.body && options.json === undefined) {
          requestOptions.duplex = "half";
        }

        const response = await this.fetch(this.resolveUrl(url), requestOptions);

        if (this.config.retryableStatusCodes.includes(response.status) && attempt < attempts) {
          await response.body?.cancel();
          await sleep(this.config.backoffFactor * attempt * 1000);
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await sleep(this.config.backoffFactor * attempt * 1000);
          continue;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    if (lastError?.name === "AbortError") {
      throw new PrivacyBlurError(`Request timed out after ${this.config.timeout} seconds.`, { cause: lastError });
    }
    throw new PrivacyBlurError(`HTTP request failed: ${lastError?.message ?? "unknown error"}`, { cause: lastError });
  }

  resolveUrl(url) {
    if (/^https?:\/\//i.test(url)) return url;
    return `${this.baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  async raiseForStatus(response) {
    if (response.status < 400) return;

    if (await isInsufficientCredits(response)) {
      throw new InsufficientCreditsError("Not enough credits to process this request. Buy more credits at https://www.bgblur.com/en/pricing");
    }

    const message = await extractErrorMessage(response);
    if (response.status === 401 || response.status === 403) throw new AuthenticationError(message);
    if (response.status === 429) throw new RateLimitError(message);
    if (response.status >= 500) throw new ServerError(message);
    throw new PrivacyBlurError(message);
  }
}

async function isInsufficientCredits(response) {
  if (response.status === 402) return true;
  const payload = await cloneJson(response);
  if (!payload || typeof payload !== "object") return false;
  const code = extractNestedValue(payload, ["error.code", "code"]);
  const message = extractNestedValue(payload, ["error.message", "message", "detail"]);
  const normalized = [code, message].filter(Boolean).join(" ").toLowerCase();
  return normalized.includes("insufficient_credits") || normalized.includes("not enough credits");
}

async function extractErrorMessage(response) {
  const parts = [`API request failed with status ${response.status}`];
  const requestId = extractRequestId(response);
  if (requestId) parts.push(`request_id=${requestId}`);

  const payload = await cloneJson(response);
  if (payload && typeof payload === "object") {
    const message = extractNestedValue(payload, ["message", "error.message", "error_description", "detail", "error", "code"]);
    if (message) parts.push(`message=${message}`);
    const code = extractNestedValue(payload, ["error.code", "code"]);
    if (code && String(code) !== String(message)) parts.push(`code=${code}`);
    parts.push(`response=${JSON.stringify(payload).slice(0, 1000)}`);
    return `${parts.join("; ")}.`;
  }

  const body = await response.clone().text().catch(() => "");
  if (body.trim()) parts.push(`body=${body.trim().slice(0, 1000)}`);
  return `${parts.join("; ")}.`;
}

async function cloneJson(response) {
  try {
    return await response.clone().json();
  } catch {
    return undefined;
  }
}

function extractRequestId(response) {
  for (const header of ["x-request-id", "x-vercel-id", "cf-ray", "x-amz-request-id", "x-amz-id-2"]) {
    const value = response.headers.get(header);
    if (value) return value;
  }
  return undefined;
}
