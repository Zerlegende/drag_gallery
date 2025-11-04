import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

import { env } from "@/lib/env";
import { withStorageRetry } from "@/lib/retry";

const { MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_ENDPOINT, MINIO_PUBLIC_ENDPOINT, MINIO_REGION, MINIO_BUCKET, MINIO_USE_SSL } =
  env.server();

export const s3Client = new S3Client({
  credentials: {
    accessKeyId: MINIO_ACCESS_KEY,
    secretAccessKey: MINIO_SECRET_KEY,
  },
  region: MINIO_REGION,
  endpoint: MINIO_ENDPOINT,
  forcePathStyle: true,
  tls: MINIO_USE_SSL === "true",
});

export async function createPresignedUpload({
  key,
  contentType,
  maxSize,
  expiresInSeconds = 300,
}: {
  key: string;
  contentType: string;
  maxSize: number;
  expiresInSeconds?: number;
}) {
  return withStorageRetry(async () => {
    const presignedPost = await createPresignedPost(s3Client, {
      Bucket: MINIO_BUCKET,
      Key: key,
      Conditions: [["content-length-range", 0, maxSize], ["eq", "$Content-Type", contentType]],
      Fields: {
        "Content-Type": contentType,
      },
      Expires: expiresInSeconds,
    });

    // Wenn eine öffentliche URL konfiguriert ist, ersetze die interne URL
    if (MINIO_PUBLIC_ENDPOINT) {
      const internalUrl = new URL(presignedPost.url);
      const publicUrl = new URL(MINIO_PUBLIC_ENDPOINT);
      presignedPost.url = presignedPost.url.replace(internalUrl.origin, publicUrl.origin);
    }

    return presignedPost;
  });
}

export async function deleteObject(key: string) {
  return withStorageRetry(async () => {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: MINIO_BUCKET,
        Key: key,
      }),
    );
  });
}

export function getPublicUrl(key: string): string {
  const endpoint = MINIO_PUBLIC_ENDPOINT || MINIO_ENDPOINT;
  const bucket = MINIO_BUCKET;
  return `${endpoint}/${bucket}/${key}`;
}
