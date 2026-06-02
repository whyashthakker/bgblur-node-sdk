# PrivacyBlur Node Example

This is a small Node.js application that uses `@bgblur/privacy-blur`.

## Setup

From this directory:

```bash
npm install
export BGBLUR_AI_API_KEY="YOUR_API_KEY"
```

For local SDK development, this example installs the SDK from the repository root through:

```json
"@bgblur/privacy-blur": "file:../.."
```

After the package is published, you can change that dependency to:

```json
"@bgblur/privacy-blur": "^0.1.0"
```

## Run Examples

Blur faces:

```bash
node index.js face-blur ./input.jpg ./output/face-blurred.jpg
```

Blur license plates:

```bash
node index.js license-plate-blur ./car.jpg ./output/plates-blurred.jpg
```

Blur anything with a prompt:

```bash
node index.js blur-anything ./street.jpg ./output/objects-blurred.jpg person
```

Anonymize faces in a video:

```bash
node index.js face-anonymize ./interview.mp4 ./output/anonymous-video.mp4
```

Process an image dataset:

```bash
node index.js dataset ./dataset ./output/dataset-private
```

You can also use npm scripts:

```bash
npm run face-blur
npm run license-plate-blur
npm run blur-anything
npm run face-anonymize
npm run dataset
```

## Environment

Copy `.env.example` for reference. This example reads environment variables directly, so export them in your shell or load them with your preferred dotenv tool.
