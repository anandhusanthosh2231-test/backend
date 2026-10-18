import { randomUUID } from "node:crypto";
import {
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const imageTypes = {
  "image/jpeg": { extension: "jpg", matches: (data: Buffer) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  "image/png": { extension: "png", matches: (data: Buffer) => data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  "image/webp": { extension: "webp", matches: (data: Buffer) => data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP" },
  "image/avif": { extension: "avif", matches: (data: Buffer) => data.toString("ascii", 4, 8) === "ftyp" && /^(avif|avis)$/.test(data.toString("ascii", 8, 12)) },
} as const;

export type RecipeImageContentType = keyof typeof imageTypes;

export interface RecipeMediaItem {
  key: string;
  url: string;
  contentType: RecipeImageContentType;
  size: number;
}

interface R2Config {
  bucket: string;
  publicBaseUrl: string;
  client: S3Client;
}

let cachedConfig: R2Config | null | undefined;

export function getRecipeMediaConfig(): R2Config | undefined {
  if (cachedConfig !== undefined) return cachedConfig ?? undefined;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    cachedConfig = null;
    return undefined;
  }

  try {
    const publicUrl = new URL(publicBaseUrl);
    if (publicUrl.protocol !== "https:" && publicUrl.protocol !== "http:") throw new Error("Invalid public URL protocol.");
  } catch {
    cachedConfig = null;
    return undefined;
  }

  cachedConfig = {
    bucket,
    publicBaseUrl,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
  return cachedConfig;
}

export function getRecipeMediaMaxBytes(): number {
  const configured = Number(process.env.R2_MAX_FILE_SIZE_BYTES ?? 8 * 1024 * 1024);
  if (!Number.isSafeInteger(configured) || configured < 1024) return 8 * 1024 * 1024;
  return Math.min(configured, 20 * 1024 * 1024);
}

export function validateRecipeImage(bytes: Buffer, contentType: string): RecipeImageContentType {
  const type = imageTypes[contentType as RecipeImageContentType];
  if (!type || bytes.length === 0 || bytes.length > getRecipeMediaMaxBytes() || !type.matches(bytes)) {
    throw new Error("Image content does not match an allowed image format or size.");
  }
  return contentType as RecipeImageContentType;
}

function mediaUrl(config: R2Config, key: string): string {
  return `${config.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function listRecipeMedia(prefix: string): Promise<RecipeMediaItem[]> {
  const config = getRecipeMediaConfig();
  if (!config) return [];
  const response = await config.client.send(new ListObjectsV2Command({
    Bucket: config.bucket,
    Prefix: prefix,
    MaxKeys: 100,
  }));
  return (response.Contents ?? []).flatMap((object) => {
    if (!object.Key || !object.Size) return [];
    const extension = object.Key.split(".").at(-1)?.toLowerCase();
    const contentType = Object.entries(imageTypes).find(([, value]) => value.extension === extension)?.[0] as RecipeImageContentType | undefined;
    if (!contentType) return [];
    return [{ key: object.Key, url: mediaUrl(config, object.Key), contentType, size: object.Size }];
  });
}

export async function uploadRecipeMedia(options: {
  bytes: Buffer;
  contentType: string;
  recipeId?: number;
  purpose: "cover" | "sections";
}): Promise<RecipeMediaItem | undefined> {
  const config = getRecipeMediaConfig();
  if (!config) return undefined;
  const contentType = validateRecipeImage(options.bytes, options.contentType);
  const type = imageTypes[contentType];
  const prefix = options.recipeId ? `recipes/${options.recipeId}` : "recipes/drafts";
  const key = `${prefix}/${options.purpose}/${randomUUID()}.${type.extension}`;
  await config.client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: options.bytes,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return { key, url: mediaUrl(config, key), contentType, size: options.bytes.length };
}