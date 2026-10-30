import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, ImagePlus, LoaderCircle, Pencil, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import './imagekit-media-library.css';

export type ImageKitAsset = {
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

type LibraryResponse = { items: ImageKitAsset[]; page: number; pageSize: number; total: number };
type UploadAuth = { token: string; expire: number; signature: string; publicKey: string; urlEndpoint: string };
type ImageKitConfig = { configured: boolean; publicKey?: string; urlEndpoint?: string; maxFileSizeBytes?: number };
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm', 'video/quicktime']);

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body as T;
}

export function ImageKitMediaLibrary() {
  const [config, setConfig] = useState<ImageKitConfig | null>(null);
  const [items, setItems] = useState<ImageKitAsset[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draftAlt, setDraftAlt] = useState('');
  const [draftTags, setDraftTags] = useState('');
  const [replacement, setReplacement] = useState<ImageKitAsset | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadAssets = useCallback(async (nextPage = page, search = query) => {
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: '24' });
      if (search.trim()) params.set('q', search.trim());
      const data = await readJson<LibraryResponse>(await fetch(`/api/admin/imagekit/assets?${params}`, { credentials: 'include' }));
      setItems(data.items);
      setTotal(data.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load ImageKit assets.');
    } finally {
      setBusy(false);
    }
  }, [page, query]);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/imagekit/config', { credentials: 'include' })
      .then(readJson<ImageKitConfig>)
      .then((value) => { if (active) setConfig(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not read ImageKit configuration.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => { void loadAssets(page, query); }, [page, query, loadAssets]);

  const uploadFile = async (file: File, replace?: ImageKitAsset) => {
    setError('');
    setNotice('');
    if (!allowedTypes.has(file.type)) {
      setError('Choose a JPEG, PNG, WebP, AVIF image, or MP4, WebM, or MOV video.');
      return;
    }
    if (replace) {
      const currentExtension = replace.filePath.split('.').at(-1)?.toLowerCase();
      const selectedExtension = file.name.split('.').at(-1)?.toLowerCase();
      if (!currentExtension || currentExtension !== selectedExtension) {
        setError('Choose a replacement with the same file extension to preserve its CDN path.');
        return;
      }
    }
    if (config?.maxFileSizeBytes && file.size > config.maxFileSizeBytes) {
      setError(`This image exceeds the ${Math.round(config.maxFileSizeBytes / 1024 / 1024)} MB upload limit.`);
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const auth = await readJson<UploadAuth>(await fetch('/api/admin/imagekit/auth', { credentials: 'include' }));
      const remote = await new Promise<ImageKitAsset>((resolve, reject) => {
        const data = new FormData();
        data.append('file', file);
        data.append('fileName', replace?.fileName ?? file.name);
        data.append('publicKey', auth.publicKey);
        data.append('signature', auth.signature);
        data.append('expire', String(auth.expire));
        data.append('token', auth.token);
        if (replace) {
          data.append('folder', replace.filePath.slice(0, replace.filePath.lastIndexOf('/')) || '/');
          data.append('useUniqueFileName', 'false');
          data.append('overwriteFile', 'true');
        } else {
          data.append('folder', '/recipes');
          data.append('useUniqueFileName', 'true');
          data.append('overwriteFile', 'false');
        }
        data.append('tags', (replace?.tags ?? []).join(','));
        const request = new XMLHttpRequest();
        request.open('POST', 'https://upload.imagekit.io/api/v1/files/upload');
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
        };
        request.onerror = () => reject(new Error('Upload failed. Check your connection and retry.'));
        request.onload = () => {
          let result: Record<string, unknown> = {};
          try { result = JSON.parse(request.responseText) as Record<string, unknown>; } catch { /* Response validation below reports malformed replies. */ }
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
              alt: replace?.alt ?? '',
              tags: replace?.tags ?? [],
              createdAt: new Date().toISOString(),
            });
          }
        };
        request.send(data);
      });
      await readJson<ImageKitAsset>(await fetch('/api/admin/imagekit/assets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...remote, name: remote.fileName }),
      }));
      setNotice(replace ? 'Image replaced successfully.' : 'Image uploaded and added to the library.');
      setPage(1);
      await loadAssets(1, query);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Image upload failed.');
    } finally {
      setBusy(false);
      setProgress(0);
      setReplacement(null);
    }
  };

  const saveMetadata = async (asset: ImageKitAsset) => {
    setError('');
    try {
      const updated = await readJson<ImageKitAsset>(await fetch(`/api/admin/imagekit/assets/${encodeURIComponent(asset.fileId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alt: draftAlt, tags: draftTags.split(',').map((tag) => tag.trim()).filter(Boolean) }),
      }));
      setItems((current) => current.map((item) => item.fileId === updated.fileId ? updated : item));
      setEditing(null);
      setNotice('Image details saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save image details.');
    }
  };

  const deleteAsset = async (asset: ImageKitAsset) => {
    if (!window.confirm(`Permanently delete "${asset.fileName}" from ImageKit? This cannot be undone.`)) return;
    setError('');
    try {
      await readJson<{ deleted: boolean }>(await fetch(`/api/admin/imagekit/assets/${encodeURIComponent(asset.fileId)}`, { method: 'DELETE', credentials: 'include' }));
      setNotice('Image deleted.');
      await loadAssets(page, query);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete the image.');
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setNotice('CDN URL copied.');
    } catch {
      setError('Clipboard access failed. Copy the CDN URL from the image details.');
    }
  };

  const chooseFile = (asset?: ImageKitAsset) => {
    setReplacement(asset ?? null);
    fileInput.current?.click();
  };

  return <section className="imagekit-library" aria-labelledby="imagekit-library-title">
    <header className="imagekit-library__header">
      <div><span className="kicker">Admin / Media</span><h1 id="imagekit-library-title">ImageKit Media Library</h1><p>Upload, organize, and manage the images used across TaskBakeAI recipes.</p></div>
      <button type="button" className="button button-dark" onClick={() => chooseFile()} disabled={busy || config?.configured !== true}><Upload size={16} /> Upload media</button>
    </header>
    <input ref={fileInput} className="imagekit-visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file, replacement ?? undefined); event.currentTarget.value = ''; }} />
    {config?.configured === false && <div className="imagekit-not-configured" role="status"><strong>ImageKit is not connected yet.</strong><p>Add <code>IMAGEKIT_PUBLIC_KEY</code>, <code>IMAGEKIT_PRIVATE_KEY</code>, and <code>IMAGEKIT_URL_ENDPOINT</code> to the API server environment, then restart or redeploy the API. This library’s upload and replace actions will be enabled once it reports ImageKit as configured.</p><a href="https://imagekit.io/dashboard" target="_blank" rel="noreferrer">Open ImageKit dashboard</a></div>}
    {error && <p className="imagekit-error" role="alert">{error}</p>}
    {notice && <p className="imagekit-notice" role="status">{notice}</p>}
    {busy && <div className="imagekit-progress"><span>{progress > 0 ? `Uploading ${progress}%` : 'Working…'}</span><progress max={100} value={progress || undefined} aria-label="ImageKit upload progress" /></div>}
    <div className="imagekit-library__toolbar">
      <label className="imagekit-search"><Search size={16} /><input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder="Search filename, alt text, folder, or tags" aria-label="Search media assets" /><button type="button" onClick={() => { setQuery(''); setPage(1); }} aria-label="Clear search">{query && <X size={15} />}</button></label>
      <span>{total} {total === 1 ? 'asset' : 'assets'}</span>
    </div>
    {busy && !items.length ? <div className="imagekit-loading"><LoaderCircle size={20} /> Loading media library…</div>
      : items.length ? <div className="imagekit-grid">{items.map((asset) => <article className="imagekit-asset" key={asset.fileId}>
        <div className="imagekit-asset__preview">{asset.fileType === 'image' ? <img src={asset.url} alt={asset.alt} loading="lazy" /> : <video src={asset.url} aria-label={asset.alt || asset.fileName} controls preload="metadata" />}<button type="button" onClick={() => void copyUrl(asset.url)} aria-label={`Copy CDN URL for ${asset.fileName}`}><Copy size={15} /></button></div>
        <div className="imagekit-asset__body">
          <strong title={asset.fileName}>{asset.fileName}</strong>
          <span className="imagekit-asset__path">{asset.filePath} · {(asset.size / 1024 / 1024).toFixed(2)} MB</span>
          <a className="imagekit-asset__url" href={asset.url} target="_blank" rel="noreferrer" title={asset.url}>{asset.url}</a>
          {editing === asset.fileId ? <div className="imagekit-asset__edit">
            <label>Alt text<input maxLength={500} value={draftAlt} onChange={(event) => setDraftAlt(event.target.value)} /></label>
            <label>Tags, comma separated<input maxLength={1000} value={draftTags} onChange={(event) => setDraftTags(event.target.value)} /></label>
            <div><button type="button" className="button button-small button-dark" onClick={() => void saveMetadata(asset)}><Check size={14} /> Save</button><button type="button" className="button button-small button-outline" onClick={() => setEditing(null)}>Cancel</button></div>
          </div> : <>
            <p className="imagekit-asset__alt">{asset.alt || 'Alt text not set'}</p>
            {!!asset.tags.length && <div className="imagekit-asset__tags">{asset.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
            <div className="imagekit-asset__actions">
              <button type="button" onClick={() => { setEditing(asset.fileId); setDraftAlt(asset.alt); setDraftTags(asset.tags.join(', ')); }}><Pencil size={14} /> Edit details</button>
              <button type="button" onClick={() => chooseFile(asset)} disabled={busy || config?.configured !== true}><RefreshCw size={14} /> Replace</button>
              <button type="button" className="danger" onClick={() => void deleteAsset(asset)}><Trash2 size={14} /> Delete</button>
            </div>
          </>}
        </div>
      </article>)}</div>
        : !busy && <div className="imagekit-empty"><ImagePlus size={24} /><h2>No media found</h2><p>Upload an image or change your search.</p></div>}
    {total > 24 && <nav className="imagekit-pagination" aria-label="Media pages"><button type="button" disabled={page <= 1 || busy} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} /> Previous</button><span>Page {page} of {Math.ceil(total / 24)}</span><button type="button" disabled={page >= Math.ceil(total / 24) || busy} onClick={() => setPage((current) => current + 1)}>Next <ChevronRight size={16} /></button></nav>}
  </section>;
}

export function ImageKitPicker({ value, onSelect }: { value?: string; onSelect: (asset: ImageKitAsset) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ImageKitAsset[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '18', fileType: 'image' });
    if (query.trim()) params.set('q', query.trim());
    fetch(`/api/admin/imagekit/assets?${params}`, { credentials: 'include' })
      .then(readJson<LibraryResponse>)
      .then((data) => { if (active) { setItems(data.items); setTotal(data.total); setError(''); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load ImageKit assets.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, query, page]);

  return <div className="imagekit-picker">
    <button type="button" className="button button-outline" onClick={() => setOpen((current) => !current)}><ImagePlus size={15} />{open ? 'Close ImageKit library' : value ? 'Choose from ImageKit' : 'Choose ImageKit image'}</button>
    {open && <div className="imagekit-picker__panel">
      <div className="imagekit-picker__top"><strong>Select an image</strong><button type="button" onClick={() => setOpen(false)} aria-label="Close image picker"><X size={16} /></button></div>
      <label className="imagekit-search"><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search assets" aria-label="Search ImageKit assets" /></label>
      {error && <p className="imagekit-error" role="alert">{error}</p>}
      {loading ? <p className="imagekit-picker__empty">Loading images…</p> : items.length ? <div className="imagekit-picker__grid">{items.map((asset) => <button type="button" key={asset.fileId} className={value === asset.url ? 'selected' : ''} onClick={() => { onSelect(asset); setOpen(false); }} aria-label={`Select ${asset.fileName}`}><img src={asset.url} alt={asset.alt} loading="lazy" /><span>{asset.fileName}</span></button>)}</div> : !error && <p className="imagekit-picker__empty">No ImageKit assets found. Upload one in the Media Library.</p>}
      {total > 18 && <div className="imagekit-picker__pages"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>{page} / {Math.ceil(total / 18)}</span><button type="button" disabled={page >= Math.ceil(total / 18)} onClick={() => setPage((current) => current + 1)}>Next</button></div>}
    </div>}
  </div>;
}
