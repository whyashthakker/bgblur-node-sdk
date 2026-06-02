# privacy-blur

Official Node.js SDK and CLI for [BGBlur.com](https://www.bgblur.com/en), the PrivacyBlur AI visual privacy platform for blurring and anonymizing faces, license plates, and custom objects in images and videos.

`privacy-blur` is the npm SDK for BGBlur.com. Use it to add automated privacy protection, visual redaction, and dataset anonymization workflows to Node.js apps, backend jobs, scripts, and command-line pipelines.

BGBlur.com helps creators, developers, businesses, and AI teams protect visual privacy in photos and videos. It is built for workflows where faces, license plates, people, vehicles, backgrounds, or sensitive objects need to be blurred before sharing, publishing, reviewing, or using media in datasets.


## Installation

```bash
npm install privacy-blur
```

The npm package name is `privacy-blur`.

## Authentication

Create an API key from your BGBlur developer dashboard:

```text
https://www.bgblur.com/developers/api-keys
```

Set it as an environment variable:

```bash
export BGBLUR_AI_API_KEY="YOUR_API_KEY"
```

Or pass it directly when creating a client.

## Quick Start

```js
import { PrivacyBlur } from "privacy-blur";

const client = new PrivacyBlur({
  apiKey: process.env.BGBLUR_AI_API_KEY
});

await client.faceBlur({
  input: "image.jpg",
  output: "result.jpg",
  blurType: "gaussian"
});
```

## JavaScript Examples

Blur faces:

```js
import { PrivacyBlur } from "privacy-blur";

const client = new PrivacyBlur({
  apiKey: process.env.BGBLUR_AI_API_KEY
});

await client.faceBlur({
  input: "image.jpg",
  output: "face-blurred.jpg",
  blurType: "gaussian"
});
```

Blur license plates:

```js
import { PrivacyBlur } from "privacy-blur";

const client = new PrivacyBlur({
  apiKey: process.env.BGBLUR_AI_API_KEY
});

await client.licensePlateBlur({
  input: "car.jpg",
  output: "plates-blurred.jpg"
});
```

Blur anything with a prompt:

```js
import { PrivacyBlur } from "privacy-blur";

const client = new PrivacyBlur({
  apiKey: process.env.BGBLUR_AI_API_KEY
});

await client.blurAnything({
  input: "street.jpg",
  prompt: "person",
  output: "objects-blurred.jpg"
});
```

Anonymize faces in video:

```js
import { PrivacyBlur } from "privacy-blur";

const client = new PrivacyBlur({
  apiKey: process.env.BGBLUR_AI_API_KEY
});

await client.faceAnonymize({
  input: "interview.mp4",
  output: "anonymous-video.mp4"
});
```

## Dataset Processing

`DatasetProcessor` helps prepare privacy-safe image datasets by applying BGBlur operations across a folder while preserving folder structure.

```js
import { DatasetProcessor } from "privacy-blur";

const processor = new DatasetProcessor({
  apiKey: process.env.BGBLUR_AI_API_KEY,
  maxWorkers: 4
});

const report = await processor.processDataset({
  datasetPath: "dataset",
  outputPath: "dataset_private",
  faceBlur: true,
  plateBlur: true,
  blurType: "pixelated"
});

console.log(report.toJSON());
```

## CLI Usage

You can also run PrivacyBlur from the command line.

```bash
privacy-blur face-blur input.jpg output.jpg --blur-type gaussian
privacy-blur face-anonymize input.mp4 output.mp4
privacy-blur license-plate-blur car.jpg result.jpg
privacy-blur blur-anything image.jpg result.jpg --prompt "person"
privacy-blur dataset-process dataset dataset_private --face-blur --plate-blur --blur-type pixelated
```

API key resolution order:

1. `--api-key`
2. `BGBLUR_AI_API_KEY`

Base URL resolution order:

1. `--base-url`
2. `BGBLUR_AI_BASE_URL`
3. `https://www.bgblur.com`

## Errors

The SDK raises typed exceptions that can be caught in your application:

- `PrivacyBlurError`
- `AuthenticationError`
- `InsufficientCreditsError`
- `RateLimitError`
- `ServerError`

Example:

```js
import {
  InsufficientCreditsError,
  PrivacyBlur,
  PrivacyBlurError
} from "privacy-blur";

try {
  const client = new PrivacyBlur({
    apiKey: process.env.BGBLUR_AI_API_KEY
  });

  await client.faceBlur({
    input: "image.jpg",
    output: "result.jpg"
  });
} catch (error) {
  if (error instanceof InsufficientCreditsError) {
    console.error(error.message);
  } else if (error instanceof PrivacyBlurError) {
    console.error(`PrivacyBlur error: ${error.message}`);
  } else {
    throw error;
  }
}
```

## TypeScript

Type declarations are included with the package.

```ts
import { PrivacyBlur, type BlurType } from "privacy-blur";

const blurType: BlurType = "pixelated";
const client = new PrivacyBlur({
  apiKey: process.env.BGBLUR_AI_API_KEY
});

await client.faceBlur({
  input: "image.jpg",
  output: "result.jpg",
  blurType
});
```

## What You Can Do

- Blur faces in images and videos for privacy protection.
- Anonymize faces in videos for identity protection.
- Blur license plates in vehicle images, dashcam footage, CCTV, and street scenes.
- Blur custom objects with a text prompt using BGBlur's blur-anything workflow.
- Prepare privacy-safe datasets for AI training, computer vision, and content review.
- Automate video redaction and image redaction from JavaScript, TypeScript, or the `privacy-blur` CLI.

## Why BGBlur.com

BGBlur.com focuses on practical visual privacy automation. Manual video redaction and image editing can be slow, repetitive, and hard to scale. BGBlur helps teams process privacy-sensitive media faster by combining AI face blur, license plate blur, prompt-based object blur, and video anonymization in one platform.

Common use cases include:

- Privacy-safe social media publishing.
- CCTV, dashcam, bodycam, and street footage redaction.
- AI dataset anonymization before model training.
- Customer support, legal, security, and compliance media review.
- Creator, journalist, researcher, and business privacy workflows.

## Keywords

AI face blur, video anonymization, license plate blur, image redaction, video redaction, privacy SDK, Node.js SDK, JavaScript SDK, TypeScript SDK, dataset anonymization, blur anything, object blur, visual privacy automation.

## Development

```bash
npm test
npm run check
npm --cache ./.npm-cache pack --dry-run
```
