# PrivacyBlur Express Server With S3

This example accepts a media upload, processes it with `@bgblur/privacy-blur`, uploads the processed result to your S3 bucket, and returns a presigned result URL.

## Flow

1. Client uploads media to this Express server.
2. Server stores the upload temporarily on local disk.
3. Server calls BGBlur through `@bgblur/privacy-blur`.
4. SDK downloads the processed result to local disk.
5. Server uploads the processed result to your S3 bucket.
6. Server returns a presigned S3 URL.

## Setup

```bash
cd examples/express-server-with-s3
npm install
```

Set environment variables:

```bash
export BGBLUR_AI_API_KEY="YOUR_BGBLUR_API_KEY"
export AWS_REGION="us-east-1"
export S3_BUCKET="your-result-bucket"
```

AWS credentials should be available through the normal AWS SDK provider chain, for example `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, an AWS profile, an ECS task role, or an EC2 instance role.

For local development:

```bash
export AWS_ACCESS_KEY_ID="YOUR_AWS_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="YOUR_AWS_SECRET_ACCESS_KEY"
```

## Run

```bash
npm start
```

Health check:

```bash
curl http://localhost:3000/health
```

## Upload Media

Blur faces:

```bash
curl -X POST http://localhost:3000/privacy-blur \
  -F "operation=face-blur" \
  -F "media=@./input.jpg"
```

Blur license plates:

```bash
curl -X POST http://localhost:3000/privacy-blur \
  -F "operation=license-plate-blur" \
  -F "media=@./car.jpg"
```

Blur anything with a prompt:

```bash
curl -X POST http://localhost:3000/privacy-blur \
  -F "operation=blur-anything" \
  -F "prompt=person" \
  -F "media=@./street.jpg"
```

Anonymize faces in video:

```bash
curl -X POST http://localhost:3000/privacy-blur \
  -F "operation=face-anonymize" \
  -F "media=@./interview.mp4"
```

Example response:

```json
{
  "operation": "face-blur",
  "bucket": "your-result-bucket",
  "key": "privacy-blur/results/1710000000000-id-input.jpg",
  "resultUrl": "https://your-result-bucket.s3.amazonaws.com/...",
  "expiresIn": 3600
}
```

## S3 Permissions

The AWS identity used by this server needs permission to upload and presign reads for your result bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::your-result-bucket/privacy-blur/results/*"
    }
  ]
}
```

## Notes

- This example uploads only the processed output to your S3 bucket.
- The original upload is deleted from local disk after processing.
- The processed local output is deleted after it is uploaded to S3.
- For production, add authentication, request limits, logging, and persistent job tracking.
