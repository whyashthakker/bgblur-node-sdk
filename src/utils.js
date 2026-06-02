import { extname } from "node:path";

import { PrivacyBlurError } from "./errors.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv", ".avi"]);

const MIME_BY_EXTENSION = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".heic", "image/heic"],
  [".heif", "image/heif"],
  [".mp4", "video/mp4"],
  [".mov", "video/quicktime"],
  [".webm", "video/webm"],
  [".mkv", "video/x-matroska"],
  [".avi", "video/x-msvideo"]
]);

export function detectMediaKind(filePath) {
  const suffix = extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(suffix)) return "image";
  if (VIDEO_EXTENSIONS.has(suffix)) return "video";
  throw new PrivacyBlurError(`Unsupported media type for file: ${filePath}`);
}

export function guessContentType(filePath, mediaKind) {
  return MIME_BY_EXTENSION.get(extname(filePath).toLowerCase()) ?? (mediaKind === "image" ? "image/jpeg" : "video/mp4");
}

export function extractNestedValue(payload, candidates) {
  for (const candidate of candidates) {
    let current = payload;
    let found = true;
    for (const part of candidate.split(".")) {
      if (current && typeof current === "object" && part in current) {
        current = current[part];
      } else {
        found = false;
        break;
      }
    }
    if (found && current !== null && current !== undefined && current !== "") {
      return current;
    }
  }
  return undefined;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildPublicApiRequest({ operation, mediaKind, mediaUrl, options }) {
  const pixelated = options.blurType === "pixelated" || options.blur_type === "pixelated";
  const blurStrength = options.blurStrength ?? options.blur_strength ?? 0.7;

  if (mediaKind === "image") {
    if (operation === "face_blur") {
      return ["/api/v1/images/face-blur", { image_url: mediaUrl, blur_strength: blurStrength, pixelated }];
    }
    if (operation === "license_plate_blur") {
      return ["/api/v1/images/license-plate-blur", { image_url: mediaUrl, blur_strength: blurStrength, pixelated }];
    }
    if (operation === "blur_anything") {
      return ["/api/v1/images/blur-anything", { image_url: mediaUrl, prompt: options.prompt, blur_strength: blurStrength, pixelated }];
    }
    throw new PrivacyBlurError(`Unsupported image operation: ${operation}`);
  }

  if (operation === "face_blur") {
    return ["/api/v1/videos/face-blur", { video_url: mediaUrl, blur_strength: blurStrength, pixelated }];
  }
  if (operation === "license_plate_blur") {
    return ["/api/v1/videos/license-plate-blur", { video_url: mediaUrl, blur_strength: blurStrength, pixelated }];
  }
  if (operation === "blur_anything") {
    return ["/api/v1/videos/blur-anything", { video_url: mediaUrl, prompt: options.prompt, blur_strength: blurStrength, pixelated }];
  }
  if (operation === "face_anonymize") {
    return ["/api/v1/videos/face-anonymization", { video_url: mediaUrl }];
  }
  throw new PrivacyBlurError(`Unsupported video operation: ${operation}`);
}
