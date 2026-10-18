import { useEffect, useState } from 'react';
import type { RecipeCard, RecipeGuide, RecipeLayoutBlock, RecipeLayoutConfig } from '@workspace/api-client-react';
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, ImagePlus, Plus, RotateCcw, Trash2 } from 'lucide-react';
import './recipe-layout.css';

export interface RecipeLayoutData {
  title: string;
  shortDescription: string;
  category: string;
  categorySlug?: string;
  audience: string;
  difficulty: string;
  estimatedTime: string;
  language: string;
  problem: string;
  aiTools: string[];
  requiredInputs: string[];
  steps: string[];
  prompt: string;
  exampleInput: string;
  exampleOutput: string;
  verificationNotes: string;
  guide?: RecipeGuide | null;
}

const blockKinds: RecipeLayoutBlock['type'][] = [
  'hero', 'overview', 'richText', 'inputs', 'workflow', 'prompt', 'example', 'image',
  'callout', 'tools', 'useCases', 'mistakes', 'verification', 'related',
];

const blockLabels: Record<RecipeLayoutBlock['type'], string> = {
  hero: 'Hero', overview: 'Quick overview', richText: 'Rich text', inputs: 'Inputs',
  workflow: 'Workflow', prompt: 'AI prompt', example: 'Example', image: 'Image',
  callout: 'Callout', tools: 'Tools and models', useCases: 'Use cases',
  mistakes: 'Mistakes and best practices', verification: 'Verification and safety', related: 'Related recipes',
};

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `block-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createDefaultRecipeLayout(): RecipeLayoutConfig {
  const types: RecipeLayoutBlock['type'][] = ['hero', 'overview', 'inputs', 'workflow', 'prompt', 'example', 'verification', 'related'];
  return { version: 1, blocks: types.map((type) => ({ id: newId(), type, visible: true, align: 'left', width: 'standard', background: 'plain' })) };
}

export function isValidRecipeLayout(value: unknown): value is RecipeLayoutConfig {
  if (!value || typeof value !== 'object') return false;
  const layout = value as { version?: unknown; blocks?: unknown };
  if (layout.version !== 1 || !Array.isArray(layout.blocks) || layout.blocks.length > 50) return false;
  if (Object.keys(layout).some((key) => key !== 'version' && key !== 'blocks')) return false;
  const ids = new Set<string>();
  return layout.blocks.every((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const block = candidate as Record<string, unknown>;
    if (typeof block.id !== 'string' || !block.id || block.id.length > 100 || ids.has(block.id) || !blockKinds.includes(block.type as RecipeLayoutBlock['type']) || typeof block.visible !== 'boolean') return false;
    const allowedKeys = ['id', 'type', 'visible', 'heading', 'subtitle', 'align', 'width', 'background', 'title', 'description', 'content', 'imageUrl', 'alt', 'caption', 'variant'];
    if (Object.keys(block).some((key) => !allowedKeys.includes(key))) return false;
    ids.add(block.id);
    if (block.heading !== undefined && (typeof block.heading !== 'string' || block.heading.length > 200)) return false;
    if (block.subtitle !== undefined && (typeof block.subtitle !== 'string' || block.subtitle.length > 500)) return false;
    if (block.title !== undefined && (typeof block.title !== 'string' || block.title.length > 300)) return false;
    if (block.description !== undefined && (typeof block.description !== 'string' || block.description.length > 4000)) return false;
    if (block.content !== undefined && (typeof block.content !== 'string' || block.content.length > 20000)) return false;
    if (block.alt !== undefined && (typeof block.alt !== 'string' || block.alt.length > 500)) return false;
    if (block.caption !== undefined && (typeof block.caption !== 'string' || block.caption.length > 500)) return false;
    if (block.align !== undefined && block.align !== 'left' && block.align !== 'center') return false;
    if (block.width !== undefined && block.width !== 'standard' && block.width !== 'wide') return false;
    if (block.background !== undefined && !['plain', 'tint', 'dark'].includes(block.background as string)) return false;
    if (block.variant !== undefined && !['tip', 'warning', 'info'].includes(block.variant as string)) return false;
    if (typeof block.imageUrl === 'string' && block.imageUrl) {
      try {
        const protocol = new URL(block.imageUrl).protocol;
        if (protocol !== 'https:' && protocol !== 'http:') return false;
      } catch { return false; }
    }
    return true;
  });
}

function LayoutSection({ block, children }: { block: RecipeLayoutBlock; children: React.ReactNode }) {
  const heading = block.heading || blockLabels[block.type];
  return <section className={`layout-block layout-width-${block.width ?? 'standard'} layout-align-${block.align ?? 'left'} layout-bg-${block.background ?? 'plain'}`}>
    {block.type !== 'hero' && (heading || block.subtitle) && <header className="layout-block-heading">{heading && <h2>{heading}</h2>}{block.subtitle && <p>{block.subtitle}</p>}</header>}
    {children}
  </section>;
}

function RichText({ content }: { content: string }) {
  const groups = content.split(/\n\s*\n/).map((group) => group.trim()).filter(Boolean);
  return <div className="layout-rich-text">{groups.map((group, index) => {
    const lines = group.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const heading = lines[0]?.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const Tag = `h${heading[1].length + 1}` as 'h2' | 'h3' | 'h4';
      return <Tag key={index}>{heading[2]}</Tag>;
    }
    if (lines.every((line) => /^[-*]\s+/.test(line))) return <ul key={index}>{lines.map((line, lineIndex) => <li key={lineIndex}>{line.replace(/^[-*]\s+/, '')}</li>)}</ul>;
    if (lines.every((line) => /^\d+[.)]\s+/.test(line))) return <ol key={index}>{lines.map((line, lineIndex) => <li key={lineIndex}>{line.replace(/^\d+[.)]\s+/, '')}</li>)}</ol>;
    return <p key={index}>{lines.join(' ')}</p>;
  })}</div>;
}

function ImageBlock({ block, eager = false }: { block: RecipeLayoutBlock; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [block.imageUrl]);
  if (!block.imageUrl || failed) return <div className="layout-image-placeholder">{failed ? 'Image unavailable' : 'Image not selected'}</div>;
  return <figure className="layout-image">
    <img src={block.imageUrl} alt={block.alt ?? ''} loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(true)} />
    {block.caption && <figcaption>{block.caption}</figcaption>}
  </figure>;
}

export function RecipeLayoutRenderer({ recipe, config, related = [] }: {
  recipe: RecipeLayoutData;
  config: RecipeLayoutConfig;
  related?: RecipeCard[];
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const guide = recipe.guide;
  const copyPrompt = async (id: string) => {
    try {
      await navigator.clipboard.writeText(recipe.prompt);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch { setCopiedId(null); }
  };

  return <div className="custom-recipe-layout">{config.blocks.filter((block) => block.visible).map((block) => {
    let content: React.ReactNode = null;
    switch (block.type) {
      case 'hero':
        content = <div className="layout-hero-content"><ImageBlock block={block} eager /><div><p className="kicker">{block.heading || recipe.category}</p><h1>{block.title || recipe.title}</h1><p>{block.description || block.subtitle || recipe.shortDescription}</p><div className="layout-hero-meta"><span>{recipe.estimatedTime}</span><span>{recipe.difficulty}</span><span>{recipe.language}</span></div></div></div>;
        break;
      case 'overview':
        content = <dl className="layout-overview-grid"><div><dt>Audience</dt><dd>{recipe.audience}</dd></div><div><dt>Difficulty</dt><dd>{guide?.snapshot?.skillLevel || recipe.difficulty}</dd></div><div><dt>Time</dt><dd>{guide?.timeToResult || recipe.estimatedTime}</dd></div><div><dt>Expected output</dt><dd>{guide?.expectedOutput?.description || guide?.snapshot?.output || 'A practical result you can review.'}</dd></div></dl>;
        break;
      case 'richText':
        content = <RichText content={block.content ?? ''} />;
        break;
      case 'inputs':
        content = <div className="layout-two-columns">{(guide?.inputs?.required?.length || recipe.requiredInputs.length) > 0 && <div><h3>Required</h3><ul>{(guide?.inputs?.required?.length ? guide.inputs.required : recipe.requiredInputs).map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}{!!guide?.inputs?.optional?.length && <div><h3>Optional</h3><ul>{guide.inputs.optional.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}</div>;
        break;
      case 'workflow':
        content = <ol className="layout-steps">{recipe.steps.map((step, index) => <li key={`${index}-${step}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{step}</p></li>)}</ol>;
        break;
      case 'prompt':
        content = <div className="layout-prompt"><pre>{recipe.prompt || 'Prompt not added yet.'}</pre><button type="button" className="button button-dark" onClick={() => void copyPrompt(block.id)}><Copy size={15} />{copiedId === block.id ? 'Copied' : 'Copy prompt'}</button></div>;
        break;
      case 'example':
        content = <div className="layout-two-columns"><div><h3>Example input</h3><p>{recipe.exampleInput || 'No example input added.'}</p></div><div><h3>Example output</h3><p>{recipe.exampleOutput || 'No example output added.'}</p></div></div>;
        break;
      case 'image':
        content = <ImageBlock block={block} />;
        break;
      case 'callout':
        content = <aside className={`layout-callout layout-callout-${block.variant ?? 'info'}`}><strong>{block.title || (block.variant === 'warning' ? 'Please note' : block.variant === 'tip' ? 'Practical tip' : 'Good to know')}</strong><RichText content={block.content ?? ''} /></aside>;
        break;
      case 'tools':
        content = <div className="layout-chips">{(guide?.tools?.length ? guide.tools.map((tool) => tool.name) : recipe.aiTools).map((tool) => <span key={tool}>{tool}</span>)}</div>;
        break;
      case 'useCases':
        content = <ul className="layout-list">{(guide?.useCases ?? []).map((item) => <li key={item.name}><strong>{item.name}</strong><span>{item.description}</span></li>)}</ul>;
        break;
      case 'mistakes':
        content = <div>{guide?.betterApproach && <p>{guide.betterApproach}</p>}<ul className="layout-list">{(guide?.commonMistakes ?? []).map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>;
        break;
      case 'verification':
        content = <div className="layout-verification"><p>{recipe.verificationNotes}</p>{!!guide?.safetyNotes?.length && <ul>{guide.safetyNotes.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>}</div>;
        break;
      case 'related':
        content = related.length ? <div className="layout-related-grid">{related.map((item) => <a key={item.id} href={`/recipes/${item.slug}`}><strong>{item.title}</strong><span>{item.shortDescription}</span></a>)}</div> : <p className="layout-muted">Related recipes will appear here.</p>;
        break;
    }
    return <LayoutSection key={block.id} block={block}>{content}</LayoutSection>;
  })}</div>;
}

function MediaPicker({ recipeId, purpose, value, onSelect }: {
  recipeId?: number;
  purpose: 'cover' | 'sections';
  value?: string;
  onSelect: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [items, setItems] = useState<Array<{ key: string; url: string; contentType: string; size: number }>>([]);
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
      .then((data) => { setConfigured(Boolean(data.configured)); setItems(data.items ?? []); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load recipe images.'))
      .finally(() => setBusy(false));
  }, [open, recipeId]);

  const upload = async (file: File) => {
    setRetryFile(file);
    setError('');
    setBusy(true);
    setProgress(0);
    try {
      const query = new URLSearchParams({ purpose, ...(recipeId ? { recipeId: String(recipeId) } : {}) });
      const data = await new Promise<{ key: string; url: string; contentType: string; size: number }>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('POST', `/api/admin/media/upload?${query}`);
        request.withCredentials = true;
        request.setRequestHeader('Content-Type', file.type);
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
        };
        request.onerror = () => reject(new Error('Image upload failed. Check your connection and retry.'));
        request.onload = () => {
          let response: Record<string, unknown> = {};
          try { response = JSON.parse(request.responseText) as Record<string, unknown>; } catch { /* Use the status fallback below. */ }
          if (request.status < 200 || request.status >= 300) reject(new Error(typeof response.error === 'string' ? response.error : 'Image upload failed.'));
          else resolve(response as { key: string; url: string; contentType: string; size: number });
        };
        request.send(file);
      });
      setItems((current) => [data, ...current]);
      onSelect(data.url);
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
      {configured === false && <p className="layout-media-note">R2 image storage is not configured. You can still use an image URL or publish without images.</p>}
      {busy && <progress aria-label="Image upload progress" max={100} value={progress || undefined} />}
      {busy && progress > 0 && <span>{progress}% uploaded</span>}
      {!busy && <div className="layout-media-grid">{items.map((item) => <button type="button" key={item.key} onClick={() => onSelect(item.url)} aria-label={`Use image ${item.key.split('/').at(-1)}`}><img src={item.url} alt="" loading="lazy" /></button>)}</div>}
      {configured && !busy && !items.length && <p className="layout-media-note">No images uploaded yet.</p>}
    </div>}
  </div>;
}

export function RecipeLayoutBuilder({ value, onChange, recipe, recipeId }: {
  value: RecipeLayoutConfig;
  onChange: (config: RecipeLayoutConfig) => void;
  recipe: RecipeLayoutData;
  recipeId?: number;
}) {
  const [newType, setNewType] = useState<RecipeLayoutBlock['type']>('richText');
  const updateBlock = (id: string, patch: Partial<RecipeLayoutBlock>) => onChange({ ...value, blocks: value.blocks.map((block) => block.id === id ? { ...block, ...patch } : block) });
  const moveBlock = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= value.blocks.length) return;
    const blocks = [...value.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    onChange({ ...value, blocks });
  };
  const addBlock = () => {
    if (value.blocks.length >= 50) return;
    onChange({ ...value, blocks: [...value.blocks, { id: newId(), type: newType, visible: true, align: 'left', width: 'standard', background: 'plain' }] });
  };
  const duplicateBlock = (block: RecipeLayoutBlock) => {
    const index = value.blocks.findIndex((item) => item.id === block.id);
    const blocks = [...value.blocks];
    blocks.splice(index + 1, 0, { ...block, id: newId() });
    onChange({ ...value, blocks });
  };
  const removeBlock = (block: RecipeLayoutBlock) => {
    if (window.confirm(`Remove the ${blockLabels[block.type]} block?`)) onChange({ ...value, blocks: value.blocks.filter((item) => item.id !== block.id) });
  };
  const [draggedId, setDraggedId] = useState<string | null>(null);

  return <div className="recipe-layout-builder">
    <section className="layout-builder-controls" aria-label="Custom layout blocks">
      <div className="layout-builder-heading"><div><span className="kicker">Custom layout</span><h2>Arrange the page</h2></div><button type="button" className="button button-outline" onClick={() => { if (window.confirm('Reset the layout to the default blocks?')) onChange(createDefaultRecipeLayout()); }}><RotateCcw size={14} />Reset</button></div>
      <p className="layout-builder-description">Blocks draw from the recipe fields below. Switching layouts never deletes recipe content.</p>
      <div className="layout-add-row"><label htmlFor="layout-block-type">Add block</label><select id="layout-block-type" value={newType} onChange={(event) => setNewType(event.target.value as RecipeLayoutBlock['type'])}>{blockKinds.map((type) => <option key={type} value={type}>{blockLabels[type]}</option>)}</select><button type="button" className="button button-dark" onClick={addBlock} disabled={value.blocks.length >= 50}><Plus size={15} />{value.blocks.length >= 50 ? 'Limit reached' : 'Add'}</button></div>
      {!value.blocks.length && <p className="layout-empty">No blocks yet. Add one to start building this recipe page.</p>}
      <div className="layout-block-list">{value.blocks.map((block, index) => <article key={block.id} className="layout-block-editor" draggable onDragStart={() => setDraggedId(block.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => {
        if (!draggedId || draggedId === block.id) return;
        const from = value.blocks.findIndex((item) => item.id === draggedId);
        const blocks = [...value.blocks];
        const [moved] = blocks.splice(from, 1);
        blocks.splice(index, 0, moved);
        onChange({ ...value, blocks });
        setDraggedId(null);
      }} onDragEnd={() => setDraggedId(null)}>
        <div className="layout-block-toolbar"><span className="layout-drag-handle" aria-hidden="true">::</span><strong>{blockLabels[block.type]}</strong><button type="button" title="Move up" aria-label={`Move ${blockLabels[block.type]} up`} disabled={index === 0} onClick={() => moveBlock(index, -1)}><ArrowUp size={15} /></button><button type="button" title="Move down" aria-label={`Move ${blockLabels[block.type]} down`} disabled={index === value.blocks.length - 1} onClick={() => moveBlock(index, 1)}><ArrowDown size={15} /></button><button type="button" title={block.visible ? 'Hide block' : 'Show block'} aria-label={block.visible ? 'Hide block' : 'Show block'} onClick={() => updateBlock(block.id, { visible: !block.visible })}>{block.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button><button type="button" title="Duplicate block" aria-label="Duplicate block" onClick={() => duplicateBlock(block)}><Copy size={15} /></button><button type="button" title="Remove block" aria-label="Remove block" onClick={() => removeBlock(block)}><Trash2 size={15} /></button></div>
        <div className="layout-block-fields">
          <label>Section heading<input value={block.heading ?? ''} onChange={(event) => updateBlock(block.id, { heading: event.target.value })} maxLength={200} /></label>
          <label>Subtitle<input value={block.subtitle ?? ''} onChange={(event) => updateBlock(block.id, { subtitle: event.target.value })} maxLength={500} /></label>
          <label>Alignment<select value={block.align ?? 'left'} onChange={(event) => updateBlock(block.id, { align: event.target.value as RecipeLayoutBlock['align'] })}><option value="left">Left</option><option value="center">Center</option></select></label>
          <label>Width<select value={block.width ?? 'standard'} onChange={(event) => updateBlock(block.id, { width: event.target.value as RecipeLayoutBlock['width'] })}><option value="standard">Standard</option><option value="wide">Wide</option></select></label>
          <label>Background<select value={block.background ?? 'plain'} onChange={(event) => updateBlock(block.id, { background: event.target.value as RecipeLayoutBlock['background'] })}><option value="plain">Plain</option><option value="tint">Soft tint</option><option value="dark">Dark</option></select></label>
          {(block.type === 'hero' || block.type === 'callout') && <label>Title<input value={block.title ?? ''} onChange={(event) => updateBlock(block.id, { title: event.target.value })} maxLength={300} /></label>}
          {block.type === 'hero' && <label>Description<textarea value={block.description ?? ''} onChange={(event) => updateBlock(block.id, { description: event.target.value })} maxLength={4000} rows={3} /></label>}
          {(block.type === 'richText' || block.type === 'callout') && <label className="layout-field-wide">Content<textarea value={block.content ?? ''} onChange={(event) => updateBlock(block.id, { content: event.target.value })} maxLength={20000} rows={6} placeholder={'## Heading\nA paragraph of recipe content.\n\n- A list item'} /></label>}
          {(block.type === 'image' || block.type === 'hero') && <div className="layout-field-wide"><MediaPicker recipeId={recipeId} purpose={block.type === 'hero' ? 'cover' : 'sections'} value={block.imageUrl} onSelect={(imageUrl) => updateBlock(block.id, { imageUrl: imageUrl || undefined })} /><label>Image URL<input type="url" value={block.imageUrl ?? ''} onChange={(event) => updateBlock(block.id, { imageUrl: event.target.value })} placeholder="https://…" /></label><label>Alt text<input value={block.alt ?? ''} onChange={(event) => updateBlock(block.id, { alt: event.target.value })} maxLength={500} /></label>{block.imageUrl && !block.alt?.trim() && <small className="form-error">Add alt text before saving this image.</small>}<label>Caption<input value={block.caption ?? ''} onChange={(event) => updateBlock(block.id, { caption: event.target.value })} maxLength={500} /></label></div>}
          {block.type === 'callout' && <label>Callout style<select value={block.variant ?? 'info'} onChange={(event) => updateBlock(block.id, { variant: event.target.value as RecipeLayoutBlock['variant'] })}><option value="info">Information</option><option value="tip">Tip</option><option value="warning">Warning</option></select></label>}
        </div>
      </article>)}</div>
    </section>
    <aside className="layout-builder-preview"><div className="layout-preview-sticky"><span className="kicker">Live preview</span><RecipeLayoutRenderer recipe={recipe} config={value} /></div></aside>
  </div>;
}