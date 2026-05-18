import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export function createR2Client({
  accountId,
  accessKeyId,
  secretAccessKey
}: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey
    },
    forcePathStyle: true
  });
}

export async function uploadPngToR2({
  client,
  bucket,
  key,
  body
}: {
  client: S3Client;
  bucket: string;
  key: string;
  body: Buffer;
}): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000, immutable"
    })
  );
}

