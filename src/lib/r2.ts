import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("File storage is not configured");
  }
}

export function r2Storage() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new StorageNotConfiguredError();
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return {
    async createUploadUrl({
      key,
      contentLength,
      expiresInSeconds,
    }: {
      key: string;
      contentLength: number;
      expiresInSeconds: number;
    }) {
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentLength: contentLength,
        }),
        { expiresIn: expiresInSeconds },
      );
      return { url, expiresInSeconds };
    },
    async statObject(key: string) {
      try {
        const head = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (head.ContentLength == null) return null;
        return { contentLength: head.ContentLength };
      } catch (error) {
        if (isMissingObject(error)) return null;
        throw error;
      }
    },
    async readObject(key: string) {
      try {
        const response = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (!response.Body) return null;
        return response.Body.transformToByteArray();
      } catch (error) {
        if (isMissingObject(error)) return null;
        throw error;
      }
    },
    async deleteObject(key: string) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch (error) {
        if (isMissingObject(error)) return;
        throw error;
      }
    },
  };
}

function isMissingObject(error: unknown) {
  return (
    error instanceof NotFound ||
    error instanceof NoSuchKey ||
    (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)
  );
}
