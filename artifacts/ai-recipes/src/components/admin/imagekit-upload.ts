export type ImageKitLibraryAsset = {
  fileId: string;
  filePath: string;
  url: string;
  fileName: string;
  fileType: string;
  size: number;
  alt: string;
  tags: string[];
  createdAt: string;
};

type UploadAuth = { token: string; expire: number; signature: string; publicKey: string };
type ImageKitConfig = { configured: boolean; maxFileSizeBytes?: number };

async function requestJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body as T;
}

export async function uploadImageKitAsset(
  file: File,
  folder: string,
  onProgress: (progress: number) => void,
): Promise<ImageKitLibraryAsset> {
  const config = await requestJson<ImageKitConfig>(await fetch('/api/admin/imagekit/config', { credentials: 'include' }));
  if (!config.configured) throw new Error('ImageKit is not configured on the API server.');
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG, WebP, AVIF image, or MP4, WebM, or MOV video.');
  }
  if (config.maxFileSizeBytes && file.size > config.maxFileSizeBytes) {
    throw new Error(`This image exceeds the ${Math.round(config.maxFileSizeBytes / 1024 / 1024)} MB upload limit.`);
  }
  const auth = await requestJson<UploadAuth>(await fetch('/api/admin/imagekit/auth', { credentials: 'include' }));
  const remote = await new Promise<ImageKitLibraryAsset>((resolve, reject) => {
    const data = new FormData();
    data.append('file', file);
    data.append('fileName', file.name);
    data.append('publicKey', auth.publicKey);
    data.append('signature', auth.signature);
    data.append('expire', String(auth.expire));
    data.append('token', auth.token);
    data.append('folder', folder);
    data.append('useUniqueFileName', 'true');
    data.append('overwriteFile', 'false');
    const request = new XMLHttpRequest();
    request.open('POST', 'https://upload.imagekit.io/api/v1/files/upload');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error('Upload failed. Check your connection and retry.'));
    request.onload = () => {
      let result: Record<string, unknown> = {};
      try { result = JSON.parse(request.responseText) as Record<string, unknown>; } catch { /* Report invalid response below. */ }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(typeof result.message === 'string' ? result.message : 'ImageKit rejected the upload.'));
      } else if (
        typeof result.fileId !== 'string' || typeof result.filePath !== 'string'
        || typeof result.url !== 'string' || typeof result.name !== 'string'
        || typeof result.size !== 'number' || (result.fileType !== 'image' && result.fileType !== 'non-image')
        || (file.type.startsWith('image/') && result.fileType !== 'image')
        || (file.type.startsWith('video/') && result.fileType !== 'non-image')
      ) {
        reject(new Error('ImageKit returned incomplete file metadata.'));
      } else {
        resolve({
          fileId: result.fileId,
          filePath: result.filePath,
          url: result.url,
          fileName: result.name,
          fileType: result.fileType,
          size: result.size,
          alt: '',
          tags: [],
          createdAt: new Date().toISOString(),
        });
      }
    };
    request.send(data);
  });
  return await requestJson<ImageKitLibraryAsset>(await fetch('/api/admin/imagekit/assets', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...remote, name: remote.fileName }),
  }));
}
