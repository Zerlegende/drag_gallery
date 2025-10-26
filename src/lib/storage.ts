import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

import { env } from "@/lib/env";

const { MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_ENDPOINT, MINIO_REGION, MINIO_BUCKET, MINIO_USE_SSL } =
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
  return createPresignedPost(s3Client, {
    Bucket: MINIO_BUCKET,
    Key: key,
    Conditions: [["content-length-range", 0, maxSize], ["eq", "$Content-Type", contentType]],
    Fields: {
      "Content-Type": contentType,
    },
    Expires: expiresInSeconds,
  });
}

export async function deleteObject(key: string) {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: key,
    }),
  );
}
