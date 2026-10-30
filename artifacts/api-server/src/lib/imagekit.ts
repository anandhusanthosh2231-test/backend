import { createHmac, randomUUID } from "node:crypto";

const IMAGEKIT_API_BASE = "https://api.imagekit.io/v1";
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const allowedImageExtensions = new Set(["jpg", "jpeg", "png", "webp", "avif"]);
const allowedVideoExtensions = new Set(["mp4", "webm", "mov"]);

export interface ImageKitConfig {
  publicKey: string;
  privateKey: string;
  urlEndpoint: string;
  maxFileSizeBytes: number;
}

export interface ImageKitUploadAuth {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
  urlEndpoint: string;
}

export interface ImageKitRemoteFile {
  fileId: string;
  filePath: string;
  url: string;
  name: string;
  size: number;
  fileType: string;
}

export interface ImageKitAssetInput extends ImageKitRemoteFile {
  alt: string;
  tags: string[];
}

export function getImageKitConfig(): ImageKitConfig | undefined {
  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY?.trim();
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY?.trim();
  const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT?.trim().replace(/\/+$/, "");
  const configuredMaxBytes = Number(process.env.IMAGEKIT_MAX_FILE_SIZE_BYTES ?? DEFAULT_MAX_BYTES);

  if (!publicKey || !privateKey || !urlEndpoint) return undefined;
  if (!Number.isSafeInteger(configuredMaxBytes) || configuredMaxBytes < 1024) {
    throw new Error("IMAGEKIT_MAX_FILE_SIZE_BYTES must be an integer of at least 1024.");
  }
  const endpoint = new URL(urlEndpoint);
  if (endpoint.protocol !== "https:") {
    throw new Error("IMAGEKIT_URL_ENDPOINT must use HTTPS.");
  }

  return {
    publicKey,
    privateKey,
    urlEndpoint,
    maxFileSizeBytes: Math.min(configuredMaxBytes, 50 * 1024 * 1024),
  };
}

export function createImageKitUploadAuth(
  config: ImageKitConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): ImageKitUploadAuth {
  const token = randomUUID();
  const expire = nowSeconds + 30 * 60;
  const signature = createHmac("sha1", config.privateKey)
    .update(`${token}${expire}`)
    .digest("hex");
  return {
    token,
    expire,
    signature,
    publicKey: config.publicKey,
    urlEndpoint: config.urlEndpoint,
  };
}

export function normalizeImageKitFolder(value: unknown): string {
  if (typeof value !== "string" || value.length > 500) {
    throw new Error("Image folder must be a string of at most 500 characters.");
  }
  const folder = value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const segments = folder.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === ".." || /[\u0000-\u001f]/.test(segment))) {
    throw new Error("Image folder contains an invalid path.");
  }
  return `/${segments.join("/")}`;
}

function imageKitAuthorization(config: ImageKitConfig): string {
  return `Basic ${Buffer.from(`${config.privateKey}:`).toString("base64")}`;
}

export async function fetchImageKitFile(
  config: ImageKitConfig,
  fileId: string,
): Promise<ImageKitRemoteFile> {
  const response = await fetch(`${IMAGEKIT_API_BASE}/files/${encodeURIComponent(fileId)}/details`, {
    headers: { Authorization: imageKitAuthorization(config) },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ImageKit file verification failed (${response.status}): ${body.slice(0, 500)}`);
  }
  const file = await response.json() as Partial<ImageKitRemoteFile>;
  if (
    file.fileId !== fileId
    || typeof file.filePath !== "string"
    || typeof file.url !== "string"
    || typeof file.name !== "string"
    || typeof file.size !== "number"
    || (file.fileType !== "image" && file.fileType !== "non-image")
  ) {
    throw new Error("ImageKit returned incomplete or unsupported image metadata.");
  }
  const extension = file.filePath.split(".").at(-1)?.toLowerCase();
  const allowedExtensions = file.fileType === "image" ? allowedImageExtensions : allowedVideoExtensions;
  if (!extension || !allowedExtensions.has(extension)) {
    throw new Error("Only JPEG, PNG, WebP, AVIF images and MP4, WebM, or MOV videos are supported.");
  }
  if (file.size < 1 || file.size > config.maxFileSizeBytes) {
    throw new Error("Image exceeds the configured ImageKit upload size limit.");
  }
  const expectedEndpoint = `${config.urlEndpoint}/`;
  if (!file.url.startsWith(expectedEndpoint)) {
    throw new Error("ImageKit returned an image URL outside the configured URL endpoint.");
  }
  return file as ImageKitRemoteFile;
}

export async function deleteImageKitFile(config: ImageKitConfig, fileId: string): Promise<void> {
  const response = await fetch(`${IMAGEKIT_API_BASE}/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: imageKitAuthorization(config) },
  });
  if (!response.ok && response.status !== 404) {
    const body = await response.text();
    throw new Error(`ImageKit deletion failed (${response.status}): ${body.slice(0, 500)}`);
  }
}

export function validateImageKitAssetInput(value: unknown): ImageKitAssetInput | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (
    typeof item.fileId !== "string"
    || !/^[A-Za-z0-9_-]{1,200}$/.test(item.fileId)
    || typeof item.filePath !== "string"
    || typeof item.url !== "string"
    || typeof item.name !== "string"
    || typeof item.size !== "number"
    || (item.fileType !== "image" && item.fileType !== "non-image")
    || typeof item.alt !== "string"
    || !Array.isArray(item.tags)
    || !item.tags.every((tag) => typeof tag === "string")
  ) return undefined;

  let url: URL;
  try {
    url = new URL(item.url);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || !item.name.trim() || item.name.length > 255) return undefined;
  if (item.filePath.length < 1 || item.filePath.length > 500 || !item.filePath.startsWith("/")) return undefined;
  if (item.alt.length > 500 || item.tags.length > 20 || item.tags.some((tag) => !tag.trim() || tag.length > 50)) return undefined;
  if (!Number.isSafeInteger(item.size) || item.size < 1) return undefined;
  const extension = item.filePath.split(".").at(-1)?.toLowerCase();
  const allowedExtensions = item.fileType === "image" ? allowedImageExtensions : allowedVideoExtensions;
  if (!extension || !allowedExtensions.has(extension)) return undefined;

  return {
    fileId: item.fileId,
    filePath: item.filePath,
    url: url.toString(),
    name: item.name.trim(),
    size: item.size,
    fileType: item.fileType,
    alt: item.alt.trim(),
    tags: [...new Set(item.tags.map((tag) => tag.trim()))],
  };
}
