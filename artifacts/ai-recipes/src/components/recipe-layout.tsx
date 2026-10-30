import { useEffect, useId, useState } from 'react';
import type { RecipeCard, RecipeGuide, RecipeLayoutBlock, RecipeLayoutConfig } from '@workspace/api-client-react';
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Plus, RotateCcw, Trash2 } from 'lucide-react';
import './recipe-layout.css';
import { RecipePromptInputs } from '@/components/recipe-prompt-inputs';
import { MediaPicker } from '@/components/admin/MediaPicker';
import { getRecipePromptFields, getRecipePromptInputErrors, resolveRecipePrompt } from '@/lib/recipe-prompt';
import { blockKinds, blockLabels, createDefaultRecipeLayout, newId, prioritizePromptWorkflow } from '@/lib/recipe-layout-utils';
import { CustomRecipeExperience } from '@/components/custom-recipe-experience';

export { createDefaultRecipeLayout, isValidRecipeLayout } from '@/lib/recipe-layout-utils';

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
  refinementPrompts: string[];
  verificationNotes: string;
  tags: string[];
  guide?: RecipeGuide | null;
}

function LayoutSection({ block, children }: { block: RecipeLayoutBlock; children: React.ReactNode }) {
  const defaultHeading = block.type === 'prompt'
    ? 'Prompt Studio & Interactive Inputs'
    : block.type === 'workflow'
      ? 'Execution Steps & Workflow Guide'
      : blockLabels[block.type];
  const heading = block.heading || defaultHeading;
  const sectionNumber = block.type === 'prompt' ? '01' : block.type === 'workflow' ? '02' : null;
  return <section className={`layout-block layout-width-${block.width ?? 'standard'} layout-align-${block.align ?? 'left'} layout-bg-${block.background ?? 'plain'}`}>
    {block.type !== 'hero' && (heading || block.subtitle) && <header className="layout-block-heading">{sectionNumber && <span className="kicker">Section {sectionNumber}</span>}{heading && <h2>{heading}</h2>}{block.subtitle && <p>{block.subtitle}</p>}</header>}
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
  if (!block.imageUrl) return null;
  if (failed) return <div className="layout-image-placeholder">Image unavailable</div>;
  return <figure className="layout-image">
    <img src={block.imageUrl} width="1600" height="900" alt={block.alt ?? ''} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" onError={() => setFailed(true)} />
    {block.caption && <figcaption>{block.caption}</figcaption>}
  </figure>;
}

function MermaidDiagram({ source }: { source: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [image, setImage] = useState('');
  const [failed, setFailed] = useState(false);
  const normalizedSource = source.replace(
    /^([ \t]*(?:graph|flowchart)[ \t]+(?:TB|TD|BT|RL|LR))[ \t]+(?=\S)/i,
    '$1\n  ',
  );

  useEffect(() => {
    let active = true;
    void import('mermaid').then(({ default: mermaid }) => {
      if (!active) return undefined;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
      return mermaid.render(`recipe-diagram-${id}`, normalizedSource);
    }).then((result) => {
      if (result && active) {
        setImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`);
        setFailed(false);
      }
    }).catch(() => {
      if (active) {
        setImage('');
        setFailed(true);
      }
    });
    return () => { active = false; };
  }, [id, normalizedSource]);

  if (failed) return <div className="layout-diagram-error" role="status">Diagram syntax could not be rendered. Review the Mermaid source.</div>;
  if (!image) return <div className="layout-diagram-loading" role="status">Rendering workflow diagram…</div>;
  return <img className="layout-diagram" src={image} width="1600" height="900" alt="Workflow diagram" decoding="async" />;
}

export function RecipePromptInputEditor({
  fields,
  onChange,
}: {
  fields: NonNullable<RecipeGuide['promptVariables']>;
  onChange: (fields: NonNullable<RecipeGuide['promptVariables']>) => void;
}) {
  const change = (index: number, patch: Partial<NonNullable<RecipeGuide['promptVariables']>[number]>) => {
    onChange(fields.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return <div className="repeatable-object-list custom-prompt-input-editor">
    <div className="repeatable-object-heading">
      <strong>Prompt inputs</strong>
      <button type="button" className="repeatable-add" onClick={() => onChange([...fields, { name: '', label: '', required: false, type: 'text' }])}>
        <Plus size={14} /> Add input
      </button>
    </div>
    {fields.map((item, index) => <div className="repeatable-object-card" key={`custom-variable-${index}`}>
      <div className="repeatable-object-heading">
        <span>Input {index + 1}</span>
        <div className="repeatable-actions">
          <button type="button" className="repeatable-remove" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move input ${index + 1} up`}><ArrowUp size={15} /></button>
          <button type="button" className="repeatable-remove" disabled={index === fields.length - 1} onClick={() => move(index, 1)} aria-label={`Move input ${index + 1} down`}><ArrowDown size={15} /></button>
          <button type="button" className="repeatable-remove" onClick={() => onChange(fields.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove input ${index + 1}`}><Trash2 size={15} /></button>
        </div>
      </div>
      <div className="editor-split">
        <label>Variable name<input aria-label={`Input ${index + 1} variable name`} value={item.name} onChange={(event) => change(index, { name: event.target.value })} placeholder="target_role" /></label>
        <label>User-facing label<input aria-label={`Input ${index + 1} display label`} value={item.label} onChange={(event) => change(index, { label: event.target.value })} placeholder="Target role" /></label>
      </div>
      <div className="editor-split">
        <label>Input type<select aria-label={`Input ${index + 1} type`} value={item.type ?? 'text'} onChange={(event) => change(index, { type: event.target.value as NonNullable<typeof item.type>, options: event.target.value === 'select' || event.target.value === 'dropdown' ? item.options ?? [] : undefined })}>
          <option value="text">Text</option><option value="textarea">Long text</option><option value="select">Select</option><option value="number">Number</option><option value="url">URL</option><option value="date">Date</option><option value="file">File name only</option><option value="checkbox">Checkbox</option><option value="dropdown">Legacy dropdown</option>
        </select></label>
        <label className="toggle-line"><input type="checkbox" aria-label={`Input ${index + 1} required`} checked={item.required ?? false} onChange={(event) => change(index, { required: event.target.checked })} /> Required</label>
      </div>
      <div className="editor-split">
        <label>Placeholder<input value={item.placeholder ?? ''} onChange={(event) => change(index, { placeholder: event.target.value })} placeholder="Paste relevant details" /></label>
        <label>Default value<input value={item.defaultValue ?? ''} onChange={(event) => change(index, { defaultValue: event.target.value })} /></label>
      </div>
      <label>Help text<textarea value={item.helpText ?? ''} onChange={(event) => change(index, { helpText: event.target.value })} rows={2} /></label>
      {(item.type === 'select' || item.type === 'dropdown') && <label>Select options (one per line)<textarea value={(item.options ?? []).join('\n')} onChange={(event) => change(index, { options: event.target.value.split('\n').map((option) => option.trim()).filter(Boolean) })} rows={3} /></label>}
    </div>)}
  </div>;
}

export function RecipeLayoutRenderer({
  recipe,
  config,
  related = [],
  promptValues: providedPromptValues,
  promptInputErrors: providedPromptInputErrors,
  resolvedPrompt: providedResolvedPrompt,
  onPromptValueChange,
  onCopyPrompt,
  copied = false,
  copyAttempted = false,
  copyError = false,
  onShare,
  saveAction,
  onRefinementSelect,
  editorPreview = false,
  recipeBasePath = '/recipes',
}: {
  recipe: RecipeLayoutData;
  config: RecipeLayoutConfig;
  related?: RecipeCard[];
  promptValues?: Record<string, string>;
  promptInputErrors?: Record<string, string>;
  resolvedPrompt?: string;
  onPromptValueChange?: (name: string, value: string) => void;
  onCopyPrompt?: (prompt?: string) => void;
  copied?: boolean;
  copyAttempted?: boolean;
  copyError?: boolean;
  onShare?: () => void;
  saveAction?: React.ReactNode;
  onRefinementSelect?: (prompt: string, index: number) => void;
  editorPreview?: boolean;
  recipeBasePath?: string;
}) {
  const guide = recipe.guide;
  const promptVariables = getRecipePromptFields(recipe.prompt, guide?.promptVariables ?? []);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [localCopyError, setLocalCopyError] = useState(false);
  const [localPromptValues, setLocalPromptValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(promptVariables.map((field) => [field.name, field.defaultValue ?? ''])),
  );
  const customContent = guide?.customContent;
  const promptValues = providedPromptValues ?? localPromptValues;
  const promptInputErrors = providedPromptInputErrors ?? getRecipePromptInputErrors(promptVariables, promptValues);
  const resolvedPrompt = providedResolvedPrompt ?? resolveRecipePrompt(recipe.prompt, promptVariables, promptValues);
  const updatePromptValue = onPromptValueChange
    ?? ((name: string, value: string) => setLocalPromptValues((current) => ({ ...current, [name]: value })));
  const copyPrompt = async (id: string, text = resolvedPrompt, validatePrompt = true) => {
    if (validatePrompt && Object.keys(promptInputErrors).length) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setLocalCopyError(false);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch { setCopiedId(null); setLocalCopyError(true); }
  };
  const recipeField = (reference: string | undefined): unknown => {
    if (!reference) return '';
    if (reference === 'guide.expectedOutput.description') return guide?.expectedOutput?.description ?? '';
    if (reference === 'guide.proTips') return guide?.proTips ?? [];
    if (reference === 'guide.safetyNotes') return guide?.safetyNotes ?? [];
    return recipe[reference as keyof RecipeLayoutData] ?? '';
  };

  if (!editorPreview) {
    return <CustomRecipeExperience
      key={`${recipe.title}:${recipe.prompt}`}
      recipe={recipe}
      config={config}
      related={related}
      promptValues={promptValues}
      promptInputErrors={promptInputErrors}
      resolvedPrompt={resolvedPrompt}
      onPromptValueChange={updatePromptValue}
      onCopyPrompt={onCopyPrompt ?? ((text) => void copyPrompt('main', text))}
      copied={copied || copiedId === 'main'}
      copyAttempted={copyAttempted}
      copyError={copyError || localCopyError}
      onShare={onShare}
      saveAction={saveAction}
      onRefinementSelect={onRefinementSelect}
    />;
  }

  const visibleBlocks = config.blocks.filter((block) => block.visible);
  const renderBlocks = editorPreview ? visibleBlocks : prioritizePromptWorkflow(visibleBlocks);

  return <div className="custom-recipe-layout">{renderBlocks.map((block) => {
    let content: React.ReactNode = null;
    switch (block.type) {
      case 'hero':
        content = <div className="layout-hero-content"><ImageBlock block={block} eager /><div><p className="kicker">{block.heading || recipe.category}</p><h1>{block.title || recipe.title}</h1><p>{block.description || block.subtitle || recipe.shortDescription}</p><div className="layout-hero-meta"><span>{recipe.estimatedTime}</span><span>{recipe.difficulty}</span><span>{recipe.language}</span></div></div></div>;
        break;
      case 'overview':
        content = <dl className="layout-overview-grid">{[['Audience', recipe.audience], ['Difficulty', guide?.snapshot?.skillLevel || recipe.difficulty], ['Time', guide?.timeToResult || recipe.estimatedTime]].filter(([, value]) => Boolean(value)).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
        break;
      case 'richText':
        content = block.content?.trim() ? <RichText content={block.content} /> : null;
        break;
      case 'field': {
        const value = recipeField(block.fieldRef);
        content = Array.isArray(value)
          ? <ul className="layout-list">{value.map((item, index) => <li key={`${index}-${String(item)}`}>{String(item)}</li>)}</ul>
          : block.fieldRef === 'prompt'
            ? <pre className="layout-field-prompt">{String(value)}</pre>
            : <p className="layout-field-content">{String(value)}</p>;
        break;
      }
      case 'inputs':
        content = (guide?.inputs?.required?.length || recipe.requiredInputs.length || guide?.inputs?.optional?.length || recipe.aiTools.length)
          ? <div className="layout-two-columns">{(recipe.aiTools.length > 0 || (guide?.tools?.length ?? 0) > 0) && <div><h3>Required tools</h3><ul>{(guide?.tools?.length ? guide.tools.map((tool) => tool.name) : recipe.aiTools).map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}{(guide?.inputs?.required?.length || recipe.requiredInputs.length) > 0 && <div><h3>Required inputs</h3><ul>{(guide?.inputs?.required?.length ? guide.inputs.required : recipe.requiredInputs).map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}{!!guide?.inputs?.optional?.length && <div><h3>Optional inputs</h3><ul>{guide.inputs.optional.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}</div>
          : null;
        break;
      case 'workflow':
        content = recipe.steps.length ? <ol className="layout-steps">{recipe.steps.map((step, index) => <li key={`${index}-${step}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{step}</p></li>)}</ol> : null;
        break;
      case 'prompt':
        if (!recipe.prompt.trim()) break;
        content = <div className="layout-prompt">
          {!!promptVariables.length && <RecipePromptInputs fields={promptVariables} values={promptValues} errors={promptInputErrors} onChange={updatePromptValue} idPrefix={`layout-${block.id}`} nativeRequired={!editorPreview} />}
          {Object.keys(promptInputErrors).length > 0 && <p className="form-error" role="alert">Complete the required fields and correct invalid values before copying.</p>}
          <div className="layout-prompt-toolbar">
            <span>Prompt preview</span>
            <button type="button" className="button button-dark" disabled={Object.keys(promptInputErrors).length > 0} onClick={() => void copyPrompt(block.id)}><Copy size={15} />{copiedId === block.id ? 'Copied' : 'Copy prompt'}</button>
          </div>
          <pre>{resolvedPrompt}</pre>
          {localCopyError && <p className="form-error" role="alert">Clipboard access failed. Select and copy the prompt text above.</p>}
        </div>;
        break;
      case 'example':
        content = recipe.exampleInput.trim() || recipe.exampleOutput.trim()
          ? <div className="layout-two-columns">{recipe.exampleInput.trim() && <div><h3>Example input</h3><p>{recipe.exampleInput}</p></div>}{recipe.exampleOutput.trim() && <div><h3>Example output</h3><p>{recipe.exampleOutput}</p></div>}</div>
          : null;
        break;
      case 'output':
        content = guide?.outputConfig
          ? <div className="layout-output-config"><strong>{guide.outputConfig.format.toUpperCase()} format</strong>{guide.outputConfig.description && <p>{guide.outputConfig.description}</p>}{!!guide.outputConfig.fields?.length && <ul>{guide.outputConfig.fields.map((field) => <li key={field}>{field}</li>)}</ul>}</div>
          : null;
        break;
      case 'outcome': {
        const outcome = guide?.expectedOutput?.description || guide?.snapshot?.output;
        content = outcome?.trim() ? <p className="layout-outcome">{outcome}</p> : null;
        break;
      }
      case 'image':
        content = block.imageUrl ? <ImageBlock block={block} /> : null;
        break;
      case 'images':
        content = customContent?.images?.length ? <div className="layout-image-gallery">{customContent.images.map((image, index) => <figure className="layout-image" key={`${image.url}-${index}`}><img src={image.url} width="1600" height="900" alt={image.alt} loading="lazy" decoding="async" />{image.caption && <figcaption>{image.caption}</figcaption>}</figure>)}</div> : null;
        break;
      case 'diagram':
        content = customContent?.workflowDiagram?.trim() ? <MermaidDiagram source={customContent.workflowDiagram} /> : null;
        break;
      case 'refinements':
        content = recipe.refinementPrompts.length ? <div className="layout-refinement-list">{recipe.refinementPrompts.map((prompt, index) => <button type="button" key={`${index}-${prompt}`} onClick={() => void copyPrompt(`refinement-${index}`, prompt, false)}><span>{copiedId === `refinement-${index}` ? 'Copied' : 'Copy'}</span>{prompt}</button>)}</div> : null;
        break;
      case 'troubleshooting': {
        const items = customContent?.troubleshooting?.length ? customContent.troubleshooting : guide?.commonMistakes ?? [];
        content = items.length || guide?.betterApproach
          ? <div>{guide?.betterApproach && <p>{guide.betterApproach}</p>}{items.length > 0 && <ul className="layout-list">{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>}</div>
          : null;
        break;
      }
      case 'callout':
        content = <aside className={`layout-callout layout-callout-${block.variant ?? 'info'}`}><strong>{block.title || (block.variant === 'warning' ? 'Please note' : block.variant === 'tip' ? 'Practical tip' : 'Good to know')}</strong><RichText content={block.content ?? ''} /></aside>;
        break;
      case 'tools':
        content = (guide?.tools?.length ? guide.tools.map((tool) => tool.name) : recipe.aiTools).length
          ? <div className="layout-chips">{(guide?.tools?.length ? guide.tools.map((tool) => tool.name) : recipe.aiTools).map((tool) => <span key={tool}>{tool}</span>)}</div>
          : null;
        break;
      case 'useCases':
        content = guide?.useCases?.length ? <ul className="layout-list">{guide.useCases.map((item) => <li key={item.name}><strong>{item.name}</strong><span>{item.description}</span></li>)}</ul> : null;
        break;
      case 'mistakes':
        content = guide?.betterApproach || guide?.commonMistakes?.length ? <div>{guide?.betterApproach && <p>{guide.betterApproach}</p>}{!!guide?.commonMistakes?.length && <ul className="layout-list">{guide.commonMistakes.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>}</div> : null;
        break;
      case 'verification':
        content = customContent?.verificationChecklist?.length
          ? <ul className="layout-verification-checklist">{customContent.verificationChecklist.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
          : recipe.verificationNotes.trim() || guide?.safetyNotes?.length
            ? <div className="layout-verification">{recipe.verificationNotes.trim() && <p>{recipe.verificationNotes}</p>}{!!guide?.safetyNotes?.length && <ul>{guide.safetyNotes.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>}</div>
            : null;
        break;
      case 'related':
        content = related.length ? <div className="layout-related-grid">{related.map((item) => <a key={item.id} href={`${recipeBasePath}/${item.slug}`}><strong>{item.title}</strong><span>{item.shortDescription}</span></a>)}</div> : null;
        break;
    }
    if (content === null || content === undefined) return null;
    return <LayoutSection key={block.id} block={block}>{content}</LayoutSection>;
  })}</div>;
}

export function RecipeLayoutBuilder({ value, onChange, recipe, recipeId }: {
  value: RecipeLayoutConfig;
  onChange: (config: RecipeLayoutConfig) => void;
  recipe: RecipeLayoutData;
  recipeId?: number;
}) {
  const [newType, setNewType] = useState<RecipeLayoutBlock['type']>('workflow');
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
          {block.type === 'field' && <label>Recipe data field<select value={block.fieldRef ?? ''} onChange={(event) => updateBlock(block.id, { fieldRef: event.target.value || undefined })}><option value="">Choose a field</option>{['title', 'shortDescription', 'problem', 'requiredInputs', 'steps', 'prompt', 'exampleInput', 'exampleOutput', 'verificationNotes', 'aiTools', 'tags', 'guide.expectedOutput.description', 'guide.proTips', 'guide.safetyNotes'].map((field) => <option key={field} value={field}>{field}</option>)}</select></label>}
          {(block.type === 'richText' || block.type === 'callout') && <label className="layout-field-wide">Content<textarea value={block.content ?? ''} onChange={(event) => updateBlock(block.id, { content: event.target.value })} maxLength={20000} rows={6} placeholder={'## Heading\nA paragraph of recipe content.\n\n- A list item'} /></label>}
          {(block.type === 'image' || block.type === 'hero') && <div className="layout-field-wide"><MediaPicker recipeId={recipeId} purpose={block.type === 'hero' ? 'cover' : 'sections'} value={block.imageUrl} onSelect={(imageUrl) => updateBlock(block.id, { imageUrl: imageUrl || undefined })} /><label>Image URL<input type="url" value={block.imageUrl ?? ''} onChange={(event) => updateBlock(block.id, { imageUrl: event.target.value })} placeholder="https://…" /></label><label>Alt text<input value={block.alt ?? ''} onChange={(event) => updateBlock(block.id, { alt: event.target.value })} maxLength={500} /></label>{block.imageUrl && !block.alt?.trim() && <small className="form-error">Add alt text before saving this image.</small>}<label>Caption<input value={block.caption ?? ''} onChange={(event) => updateBlock(block.id, { caption: event.target.value })} maxLength={500} /></label></div>}
          {block.type === 'callout' && <label>Callout style<select value={block.variant ?? 'info'} onChange={(event) => updateBlock(block.id, { variant: event.target.value as RecipeLayoutBlock['variant'] })}><option value="info">Information</option><option value="tip">Tip</option><option value="warning">Warning</option></select></label>}
        </div>
      </article>)}</div>
    </section>
    <aside className="layout-builder-preview"><div className="layout-preview-sticky"><span className="kicker">Live preview</span><RecipeLayoutRenderer recipe={recipe} config={value} editorPreview /></div></aside>
  </div>;
}