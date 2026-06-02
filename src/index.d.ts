export type BlurType = "gaussian" | "pixelated";

export interface PrivacyBlurOptions {
  apiKey?: string;
  api_key?: string;
  baseUrl?: string;
  base_url?: string;
  timeout?: number;
  pollInterval?: number;
  poll_interval?: number;
  maxPollTime?: number;
  max_poll_time?: number;
  maxRetries?: number;
  max_retries?: number;
  retryableStatusCodes?: number[];
  fetch?: typeof fetch;
}

export interface FileOperationOptions {
  input: string;
  output: string;
}

export interface FaceBlurOptions extends FileOperationOptions {
  blurType?: BlurType;
  blur_type?: BlurType;
}

export interface BlurAnythingOptions extends FaceBlurOptions {
  prompt: string;
}

export interface JobResult {
  jobId: string;
  status: string;
  downloadUrl: string;
  rawResponse: Record<string, unknown>;
}

export class PrivacyBlur {
  constructor(options: PrivacyBlurOptions);
  faceBlur(options: FaceBlurOptions): Promise<string>;
  faceAnonymize(options: FileOperationOptions): Promise<string>;
  licensePlateBlur(options: FileOperationOptions): Promise<string>;
  blurAnything(options: BlurAnythingOptions): Promise<string>;
  waitForJob(jobId: string): Promise<JobResult>;
}

export interface DatasetProcessorOptions extends PrivacyBlurOptions {
  maxWorkers?: number;
  max_workers?: number;
  clientFactory?: (options: PrivacyBlurOptions) => PrivacyBlur;
}

export interface DatasetProcessOptions {
  datasetPath?: string;
  dataset_path?: string;
  outputPath?: string;
  output_path?: string;
  faceBlur?: boolean;
  face_blur?: boolean;
  plateBlur?: boolean;
  plate_blur?: boolean;
  blurAnything?: boolean;
  blur_anything?: boolean;
  prompt?: string;
  blurType?: BlurType;
  blur_type?: BlurType;
  plateMode?: "blur" | "replace";
  plate_mode?: "blur" | "replace";
}

export class DatasetProcessReport {
  imagesProcessed: number;
  facesBlurred: number;
  licensePlatesBlurred: number;
  objectsBlurred: number;
  errors: number;
  processingTimeSeconds: number;
  toJSON(): {
    images_processed: number;
    faces_blurred: number;
    license_plates_blurred: number;
    objects_blurred: number;
    errors: number;
    processing_time_seconds: number;
  };
}

export class DatasetProcessor {
  constructor(options: DatasetProcessorOptions);
  processDataset(options: DatasetProcessOptions): Promise<DatasetProcessReport>;
}

export function scanDataset(datasetPath: string): Promise<{
  images: Array<{ sourcePath: string; relativePath: string }>;
  passthroughFiles: Array<{ sourcePath: string; relativePath: string }>;
}>;

export class PrivacyBlurError extends Error {}
export class AuthenticationError extends PrivacyBlurError {}
export class InsufficientCreditsError extends PrivacyBlurError {}
export class RateLimitError extends PrivacyBlurError {}
export class ServerError extends PrivacyBlurError {}
