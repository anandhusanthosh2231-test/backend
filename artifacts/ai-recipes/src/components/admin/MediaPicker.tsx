import { useEffect, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import './media-picker.css';

interface RecipeMediaItem {
  key: string;
  url: string;
  contentType: string;
  size: number;
}

export function MediaPicker({
  recipeId,
  purpose,
  value,
  onSelect,
}: {
  recipeId?: number;
  purpose: 'cover' | 'sections';
  value?: string;
  onSelect: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [items, setItems] = useState<RecipeMediaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [retryFile, setRetryFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setBusy(true);
    const query = recipeId ? `?recipeId=${recipeId}` : '';
    fetch(`/api/admin/media${query}`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load recipe images.');
        return response.json();
      })
      .then((data: { configured: boolean; items: RecipeMediaItem[] }) => {
        setConfigured(data.configured);
        setItems(data.items);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load recipe images.'))
      .finally(() => setBusy(false));
  }, [open, recipeId]);

  const upload = async (file: File) => {
    setRetryFile(file);
    setError('');
    setBusy(true);
    setProgress(0);
    try {
      const query = new URLSearchParams({ purpose, ...(recipeId ? { recipeId: String(recipeId) } : {}) });
      const item = await new Promise<RecipeMediaItem>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('POST', `/api/admin/media/upload?${query}`);
        request.withCredentials = true;
        request.setRequestHeader('Content-Type', file.type);
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
        };
        request.onerror = () => reject(new Error('Image upload failed. Check your connection and retry.'));
        request.onload = () => {
          let response: { error?: string } & Partial<RecipeMediaItem> = {};
          try { response = JSON.parse(request.responseText) as typeof response; } catch { /* Use the status fallback below. */ }
          if (request.status < 200 || request.status >= 300) {
            reject(new Error(response.error ?? 'Image upload failed.'));
          } else if (!response.key || !response.url || !response.contentType || typeof response.size !== 'number') {
            reject(new Error('Image upload returned an invalid response.'));
          } else {
            resolve(response as RecipeMediaItem);
          }
        };
        request.send(file);
      });
      setItems((current) => [item, ...current]);
      onSelect(item.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Image upload failed.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="layout-media-picker">
    <button type="button" className="button button-outline" onClick={() => { setOpen((current) => !current); setError(''); }}><ImagePlus size={15} />{open ? 'Close image library' : value ? 'Replace image' : 'Choose image'}</button>
    {value && <button type="button" className="layout-remove-image" onClick={() => onSelect('')}>Remove image reference</button>}
    {open && <div className="layout-media-panel">
      <label className="layout-upload-drop" onDragOver={(event) => { event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file && !busy) void upload(file); }}>
        {busy ? 'Working…' : 'Drop an image here or choose a file'}
        <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ''; }} />
      </label>
      {error && <div className="layout-media-error" role="alert">{error}{retryFile && <button type="button" onClick={() => void upload(retryFile)}>Retry upload</button>}</div>}
      {configured === false && <p className="layout-media-note">Cloudflare image storage is not configured. You can still use an image URL or publish without images.</p>}
      {busy && <progress aria-label="Image upload progress" max={100} value={progress || undefined} />}
      {busy && progress > 0 && <span>{progress}% uploaded</span>}
      {!busy && <div className="layout-media-grid">{items.map((item) => <button type="button" key={item.key} onClick={() => onSelect(item.url)} aria-label={`Use image ${item.key.split('/').at(-1)}`}><img src={item.url} alt="" loading="lazy" /></button>)}</div>}
      {configured && !busy && !items.length && <p className="layout-media-note">No images uploaded yet.</p>}
    </div>}
  </div>;
}
