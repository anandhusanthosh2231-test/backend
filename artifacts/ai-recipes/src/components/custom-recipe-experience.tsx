import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import {
  ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown, ClipboardCheck,
  Copy, Flame, RotateCcw, Share2, Sparkles,
} from "lucide-react";
import { Link } from "wouter";
import type { RecipeCard, RecipeGuidePromptVariablesItem, RecipeLayoutBlock, RecipeLayoutConfig } from "@workspace/api-client-react";
import { RecipePromptInputs } from "@/components/recipe-prompt-inputs";
import { RecipeContextInputs } from "@/components/recipe-context-inputs";
import type { RecipeContext } from "@/lib/recipe-context";
import { getRecipePromptFields } from "@/lib/recipe-prompt";
import type { RecipeLayoutData } from "@/components/recipe-layout";
import "./custom-recipe-experience.css";

type CustomRecipeExperienceProps = {
  recipe: RecipeLayoutData;
  config: RecipeLayoutConfig;
  related: RecipeCard[];
  promptValues: Record<string, string>;
  promptInputErrors: Record<string, string>;
  resolvedPrompt: string;
  recipeContext?: RecipeContext;
  onRecipeContextChange?: (value: RecipeContext) => void;
  onPromptValueChange: (name: string, value: string) => void;
  onCopyPrompt?: (prompt?: string) => void;
  copied?: boolean;
  copyAttempted?: boolean;
  copyError?: boolean;
  onShare?: () => void;
  saveAction?: ReactNode;
  onRefinementSelect?: (prompt: string, index: number) => void;
};

type IngredientKind = "sources" | "keywords" | "date" | "notion" | "schedule" | "standard";
type ModelTab = "Claude" | "ChatGPT" | "Gemini" | "Perplexity";

const modelTabs: ModelTab[] = ["Claude", "ChatGPT", "Gemini", "Perplexity"];
const sharedModelGuidance: Record<ModelTab, string> = {
  Claude: "Work carefully from the supplied context. Separate observed facts from interpretation.",
  ChatGPT: "Follow the requested structure. Be concise, specific, and actionable.",
  Gemini: "Connect relevant details while retaining the supplied context.",
  Perplexity: "Prioritize verifiable claims and make uncertainty and source limits explicit.",
};
const sharedModelTips: Record<ModelTab, string> = {
  Claude: "Give Claude the relevant source material and ask it to separate evidence from interpretation.",
  ChatGPT: "Ask ChatGPT to follow the requested structure and make each recommendation actionable.",
  Gemini: "Ask Gemini to connect relevant details while preserving the original context.",
  Perplexity: "Ask Perplexity to prioritize reliable sources and flag claims that need checking.",
};
const defaultChecklist = [
  "The result answers the original task.",
  "Important dates, figures, and names are checked.",
  "Claims and sources are independently verified.",
  "Sensitive or confidential details are removed.",
  "Links, quotations, and attributions are accurate.",
  "A person has reviewed the result before sharing.",
];

type CustomRecipeConfig = {
  title: string;
  description: string;
  category: string;
  time: string;
  difficulty: string;
  language: string;
  audience: string;
  fields: RecipeGuidePromptVariablesItem[];
  promptLines: string;
  modelTips: Record<ModelTab, string>;
  modelGuidance: Record<ModelTab, string>;
  steps: string[];
  refinements: string[];
  troubleshooting: Array<{ question: string; answer: string }>;
  checklist: string[];
  related: Array<{ title: string; description: string; url: string }>;
};

function classifyIngredient(field: RecipeGuidePromptVariablesItem): IngredientKind {
  const key = `${field.name} ${field.label}`.toLowerCase().replace(/[_-]+/g, " ");
  if (/\b(source|account|channel|platform|feed)\b/.test(key)) return "sources";
  if (/\b(keyword|keywords|topic|topics|term|terms)\b/.test(key)) return "keywords";
  if (/\b(date window|date range|time window|timeframe|date period)\b/.test(key)) return "date";
  if (/\bnotion\b/.test(key) && /\b(database|db|url|link)\b/.test(key)) return "notion";
  if (/\b(schedule|cadence|frequency|run time)\b/.test(key)) return "schedule";
  return "standard";
}

function getChips(value: string) {
  return value.split(/[,\n;]/).map((part) => part.trim()).filter(Boolean);
}

function excerpt(value: string, limit = 170) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  return normalized.length > limit ? `${normalized.slice(0, limit).trimEnd()}…` : normalized;
}

function modelAdaptation(prompt: string, model: ModelTab, guidance: Record<ModelTab, string>) {
  return `${prompt.trim()}\n\n${model} guidance:\n${guidance[model]}`;
}

function SectionHeading({ kicker, title, accent }: { kicker: string; title: string; accent?: string }) {
  return <header className="custom-bake-heading">
    <span className="custom-bake-kicker">{kicker}</span>
    <h2>{title}{accent && <> <em>{accent}</em></>}</h2>
  </header>;
}

function ChipField({
  field, value, onChange, suggestions = [], error, showError,
}: {
  field: RecipeGuidePromptVariablesItem;
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[];
  error?: string;
  showError: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [touched, setTouched] = useState(false);
  const chips = getChips(value);
  const displayError = showError || touched;
  const addChip = (raw: string) => {
    const next = raw.trim().replace(/,$/, "");
    if (!next || chips.some((chip) => chip.toLowerCase() === next.toLowerCase())) return;
    onChange([...chips, next].join(", "));
    setDraft("");
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addChip(draft);
    } else if (event.key === "Backspace" && !draft && chips.length) {
      onChange(chips.slice(0, -1).join(", "));
    }
  };
  const describedBy = displayError && error ? `${field.name}-ingredient-error` : undefined;

  return <div className="custom-ingredient-field">
    <div className="custom-ingredient-label">
      <label htmlFor={`ingredient-${field.name}`}>{field.label}</label>
      <span className={field.required ? "custom-badge-required" : "custom-badge-optional"}>{field.required ? "Required" : "Optional"}</span>
    </div>
    {field.helpText && <p className="custom-ingredient-help">{field.helpText}</p>}
    <div className={`custom-chipbox${displayError && error ? " is-invalid" : ""}`}>
      {chips.map((chip) => <span className="custom-chip" key={chip}>{chip}<button type="button" aria-label={`Remove ${chip}`} onClick={() => onChange(chips.filter((item) => item !== chip).join(", "))}>×</button></span>)}
      <input
        id={`ingredient-${field.name}`}
        value={draft}
        placeholder={field.placeholder || `Add ${field.label.toLowerCase()} and press Enter`}
        aria-invalid={Boolean(displayError && error)}
        aria-describedby={describedBy}
        onChange={(event) => {
          if (event.target.value.includes(",")) {
            const parts = event.target.value.split(",");
            const additions = parts.slice(0, -1).map((part) => part.trim()).filter(Boolean);
            onChange([...new Set([...chips, ...additions])].join(", "));
            setDraft(parts.at(-1) ?? "");
          } else setDraft(event.target.value);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => { addChip(draft); setTouched(true); }}
      />
    </div>
    {displayError && error && <small className="custom-field-error" id={describedBy} role="alert">{error}</small>}
    {suggestions.length > 0 && <div className="custom-suggestions" aria-label={`Suggestions for ${field.label}`}>{suggestions.filter((item) => !chips.includes(item)).slice(0, 5).map((item) => <button type="button" key={item} onClick={() => addChip(item)}>+ {item}</button>)}</div>}
  </div>;
}

function DateWindowField({ field, value, onChange, error, showError }: {
  field: RecipeGuidePromptVariablesItem;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  showError: boolean;
}) {
  const presets = ["Last 24h", "7 days", "30 days"];
  const existingCustom = value !== "" && !presets.includes(value);
  const [custom, setCustom] = useState(existingCustom);
  const [touched, setTouched] = useState(false);
  const displayError = showError || touched;
  return <fieldset className="custom-ingredient-field custom-segment-field">
    <legend>{field.label} <span className={field.required ? "custom-badge-required" : "custom-badge-optional"}>{field.required ? "Required" : "Optional"}</span></legend>
    <div className="custom-segments">{[...presets, "Custom"].map((preset) => <button type="button" key={preset} className={(preset === "Custom" ? custom : value === preset) ? "is-selected" : ""} aria-pressed={preset === "Custom" ? custom : value === preset} onClick={() => { setTouched(true); setCustom(preset === "Custom"); if (preset !== "Custom") onChange(preset); }}>{preset}</button>)}</div>
    {custom && <input className="custom-text-input" aria-label={`Custom ${field.label.toLowerCase()}`} placeholder={field.placeholder || "Enter a date range"} value={value} onChange={(event) => onChange(event.target.value)} onBlur={() => setTouched(true)} />}
    {displayError && error && <small className="custom-field-error" role="alert">{error}</small>}
  </fieldset>;
}

function ScheduleField({ field, value, onChange, error, showError }: {
  field: RecipeGuidePromptVariablesItem;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  showError: boolean;
}) {
  const presets = ["Daily 8 AM", "Weekly Monday", "Manual"];
  const existingCustom = value !== "" && !presets.includes(value);
  const [custom, setCustom] = useState(existingCustom);
  const [touched, setTouched] = useState(false);
  const displayError = showError || touched;
  return <fieldset className="custom-ingredient-field custom-segment-field">
    <legend>{field.label} <span className={field.required ? "custom-badge-required" : "custom-badge-optional"}>{field.required ? "Required" : "Optional"}</span></legend>
    <div className="custom-segments">{[...presets, "Custom"].map((preset) => <button type="button" key={preset} className={(preset === "Custom" ? custom : value === preset) ? "is-selected" : ""} aria-pressed={preset === "Custom" ? custom : value === preset} onClick={() => { setTouched(true); setCustom(preset === "Custom"); if (preset !== "Custom") onChange(preset); }}>{preset}</button>)}</div>
    {custom && <input className="custom-text-input" aria-label={`Custom ${field.label.toLowerCase()}`} placeholder="Describe a schedule" value={value} onChange={(event) => onChange(event.target.value)} onBlur={() => setTouched(true)} />}
    {displayError && error && <small className="custom-field-error" role="alert">{error}</small>}
  </fieldset>;
}

function NotionField({ field, value, onChange, error, showError }: {
  field: RecipeGuidePromptVariablesItem;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  showError: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const displayError = showError || touched;
  return <div className="custom-ingredient-field">
    <div className="custom-ingredient-label"><label htmlFor={`ingredient-${field.name}`}>{field.label}</label><span className={field.required ? "custom-badge-required" : "custom-badge-optional"}>{field.required ? "Required" : "Optional"}</span></div>
    {field.helpText && <p className="custom-ingredient-help">{field.helpText}</p>}
    <div className="custom-notion-input"><BookOpen size={17} aria-hidden="true" /><input id={`ingredient-${field.name}`} type="url" value={value} onChange={(event) => onChange(event.target.value)} onBlur={() => setTouched(true)} placeholder={field.placeholder || "Paste a Notion database link"} aria-invalid={Boolean(displayError && error)} /></div>
    {displayError && error && <small className="custom-field-error" role="alert">{error}</small>}
  </div>;
}

function IngredientTray({
  fields, values, errors, onChange, attempted,
  tags, tools,
}: {
  fields: RecipeGuidePromptVariablesItem[];
  values: Record<string, string>;
  errors: Record<string, string>;
  onChange: (name: string, value: string) => void;
  attempted: boolean;
  tags: string[];
  tools: string[];
}) {
  const requiredFields = fields.filter((field) => field.required === true);
  const ready = requiredFields.filter((field) => Boolean((values[field.name] ?? field.defaultValue ?? "").trim())).length;
  const readyRatio = requiredFields.length ? ready / requiredFields.length : 1;
  const ringCircumference = 2 * Math.PI * 15;
  const [pulseComplete, setPulseComplete] = useState(false);
  const hasPulsed = useRef(false);
  useEffect(() => {
    if (requiredFields.length && ready === requiredFields.length && !hasPulsed.current) {
      hasPulsed.current = true;
      setPulseComplete(true);
    }
  }, [ready, requiredFields.length]);
  const groups = fields.map((field) => ({ field, kind: classifyIngredient(field) }));
  const ordinary = groups.filter(({ kind }) => kind === "standard").map(({ field }) => field);
  return <section className="custom-bake-section custom-ingredients" id="custom-ingredients" aria-labelledby="custom-ingredients-title">
    <SectionHeading kicker="01 / Ingredients tray" title="Gather your" accent="ingredients." />
    <div className="custom-pantry">
      <div className="custom-pantry-copy">
        <span>Pantry check</span>
        <span className="custom-pantry-progress">
          <svg viewBox="0 0 34 34" aria-hidden="true">
            <circle className="custom-pantry-ring-track" cx="17" cy="17" r="15" style={{ strokeDasharray: ringCircumference }} />
            <circle className={`custom-pantry-ring-fill${pulseComplete ? " is-complete" : ""}`} cx="17" cy="17" r="15" style={{ strokeDasharray: ringCircumference, strokeDashoffset: `${ringCircumference * (1 - readyRatio)}` }} />
          </svg>
          <strong aria-live="polite" aria-atomic="true">{requiredFields.length ? `${ready}/${requiredFields.length} required ready` : "No required inputs"}</strong>
        </span>
      </div>
      <div className="custom-pantry-track" role="progressbar" aria-label="Required ingredients ready" aria-valuemin={0} aria-valuemax={requiredFields.length} aria-valuenow={ready}><span style={{ width: `${readyRatio * 100}%` }} /></div>
      <p>{requiredFields.length ? "A few details help the AI make this recipe yours." : "This recipe is ready to copy as-is."}</p>
    </div>
    {!!ordinary.length && <RecipePromptInputs fields={ordinary} values={values} errors={errors} onChange={onChange} idPrefix="custom-ingredient" nativeRequired={false} deferErrors />}
    {groups.filter(({ kind }) => kind !== "standard").map(({ field, kind }) => {
      const value = values[field.name] ?? field.defaultValue ?? "";
      const error = errors[field.name];
      if (kind === "sources" || kind === "keywords") {
        return <ChipField key={field.name} field={field} value={value} onChange={(next) => onChange(field.name, next)} suggestions={kind === "keywords" ? tags : tools} error={error} showError={attempted} />;
      }
      if (kind === "date") return <DateWindowField key={field.name} field={field} value={value} onChange={(next) => onChange(field.name, next)} error={error} showError={attempted} />;
      if (kind === "schedule") return <ScheduleField key={field.name} field={field} value={value} onChange={(next) => onChange(field.name, next)} error={error} showError={attempted} />;
      return <NotionField key={field.name} field={field} value={value} onChange={(next) => onChange(field.name, next)} error={error} showError={attempted} />;
    })}
    {attempted && Object.keys(errors).length > 0 && <p className="custom-form-error" role="alert" aria-live="polite">A couple of ingredients are missing. Add them above to bake this prompt.</p>}
    <div className="custom-ingredient-footer"><span><CalendarDays size={15} /> Inputs stay in this browser session.</span><button type="button" onClick={() => fields.forEach((field) => onChange(field.name, field.defaultValue ?? ""))} disabled={!fields.some((field) => values[field.name] && values[field.name] !== (field.defaultValue ?? ""))}><RotateCcw size={14} />Reset inputs</button></div>
  </section>;
}

function PromptStudio({
  prompt, fields, values, errors, onCopy, copied, attempted, onAttempt, valid, copyError,
  model, onModelChange, modelTips, modelGuidance,
}: {
  prompt: string;
  fields: RecipeGuidePromptVariablesItem[];
  values: Record<string, string>;
  errors: Record<string, string>;
  onCopy: (prompt: string) => void;
  copied: boolean;
  attempted: boolean;
  onAttempt: () => void;
  valid: boolean;
  copyError: boolean;
  model: ModelTab;
  onModelChange: (model: ModelTab) => void;
  modelTips: Record<ModelTab, string>;
  modelGuidance: Record<ModelTab, string>;
}) {
  const [changedValues, setChangedValues] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 961px)").matches);
  const previousValues = useRef(values);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const adapted = useMemo(() => modelAdaptation(prompt, model, modelGuidance), [prompt, model, modelGuidance]);
  useEffect(() => {
    const changed = fields.filter((field) => previousValues.current[field.name] !== values[field.name] && values[field.name]?.trim()).map((field) => field.name);
    if (changed.length) {
      setChangedValues(changed);
      const timer = window.setTimeout(() => setChangedValues([]), 1100);
      previousValues.current = values;
      return () => window.clearTimeout(timer);
    }
    previousValues.current = values;
    return undefined;
  }, [fields, values]);
  const activeValues = fields.map((field) => values[field.name]?.trim()).filter((value): value is string => Boolean(value)).sort((left, right) => right.length - left.length);
  const valuePattern = activeValues.length
    ? new RegExp(`(${activeValues.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g")
    : null;
  const tooltip = Object.keys(errors).length
    ? `Add: ${fields.filter((field) => errors[field.name]).map((field) => field.label).join(", ")}`
    : undefined;
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % modelTabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + modelTabs.length) % modelTabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = modelTabs.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextModel = modelTabs[nextIndex];
    if (!nextModel) return;
    onModelChange(nextModel);
    tabRefs.current[nextIndex]?.focus();
  };
  const panelId = `${id}-panel`;

  return <section className="custom-bake-section custom-prompt-studio" id="custom-prompt" aria-labelledby="custom-prompt-title">
    <SectionHeading kicker="02 / The oven" title="Your prompt is" accent="cooking." />
    <div className="custom-model-tabs" role="tablist" aria-label="Adapt the prompt for an AI model">
      {modelTabs.map((tab, index) => <button
        key={tab}
        ref={(element) => { tabRefs.current[index] = element; }}
        type="button"
        role="tab"
        id={`${id}-tab-${tab.toLowerCase()}`}
        aria-selected={model === tab}
        aria-controls={panelId}
        tabIndex={model === tab ? 0 : -1}
        onClick={() => onModelChange(tab)}
        onKeyDown={(event) => onTabKeyDown(event, index)}
      >{tab}</button>)}
    </div>
    <p className="custom-model-tip"><Sparkles size={14} />{modelTips[model]}</p>
    <details className="custom-prompt-preview-details" open={previewOpen} onToggle={(event) => setPreviewOpen(event.currentTarget.open)}>
      <summary>Preview prompt <ChevronDown size={16} aria-hidden="true" /></summary>
      <div key={model} className={`layout-prompt custom-prompt-code${copied ? " is-baked" : ""}`} id={panelId} role="tabpanel" aria-labelledby={`${id}-tab-${model.toLowerCase()}`} tabIndex={0}>
        <div className="layout-prompt-toolbar custom-prompt-toolbar"><span><span className="custom-live-dot" /> LIVE PROMPT PREVIEW · {model}</span>
          <button type="button" className="custom-primary-button" disabled={!valid} title={!valid ? tooltip : undefined} aria-describedby={!valid && tooltip ? `${id}-copy-requirements` : undefined} onClick={() => { onAttempt(); if (valid) onCopy(adapted); }}>{copied ? <><Check className="custom-copied-check" size={15} />Copied</> : <><Copy size={15} />{valid ? "Bake it" : "Copy prompt"}</>}</button>
        </div>
        {!valid && tooltip && <span className="custom-sr-only" id={`${id}-copy-requirements`}>{tooltip}</span>}
        <pre key={model} aria-label="Live prompt text">{adapted.split(/\r?\n/).map((line, lineIndex) => <span className="custom-prompt-line" key={`${lineIndex}-${line}`}>{(valuePattern ? line.split(valuePattern) : [line]).map((part, index) => activeValues.includes(part) ? <mark className={`custom-prompt-value${changedValues.some((name) => values[name]?.trim() === part) ? " is-new" : ""}`} key={`${index}-${part}`}>{part}</mark> : part)}</span>)}</pre>
      </div>
    </details>
    <p className="custom-privacy-note"><ClipboardCheck size={15} /> Remove confidential or personal information before pasting into an AI tool.</p>
    {attempted && Object.keys(errors).length > 0 && <p className="custom-form-error" role="alert" aria-live="polite">Complete the required ingredients before copying your prompt.</p>}
    {copyError && <p className="custom-form-error" role="alert" aria-live="polite">Clipboard access failed. Select and copy the prompt text above.</p>}
    <div className="custom-copy-toast" role="status" aria-live="polite" aria-atomic="true">{copied && <><span aria-hidden="true">✦</span> Prompt copied.</>}</div>
  </section>;
}

function SampleBake({ recipe }: { recipe: RecipeLayoutData }) {
  const examples = recipe.guide?.examples?.length
    ? recipe.guide.examples
    : recipe.exampleInput || recipe.exampleOutput
      ? [{ scenario: "Recipe example", input: recipe.exampleInput, output: recipe.exampleOutput, whyItWorks: [] }]
      : [];
  if (!examples.length) return null;
  return <section className="custom-bake-section custom-sample-bake" id="custom-sample" aria-labelledby="custom-sample-title">
    <details className="custom-sample-details">
      <summary><span className="custom-sample-icon"><BookOpen size={18} /></span><span><small>EXAMPLE OUTPUT · NOT LIVE DATA</small><strong id="custom-sample-title">See a finished bake</strong></span><ChevronDown size={18} /></summary>
      <div className="custom-example-list">
        {examples.map((example, index) => <article className="custom-example-card" key={`${example.scenario}-${index}`}>
          <span className="custom-bake-kicker">{example.scenario || `Example ${index + 1}`}</span>
          {example.input && <div><h3>Input</h3><p>{example.input}</p></div>}
          <div><h3>Output</h3><p>{example.output}</p></div>
          {!!example.whyItWorks?.length && <div><h3>Why it works</h3><ul>{example.whyItWorks.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>{item}</li>)}</ul></div>}
        </article>)}
      </div>
    </details>
  </section>;
}

function WorkflowPipeline({ config }: { config: CustomRecipeConfig }) {
  const timelineRef = useRef<HTMLOListElement>(null);
  const steps = config.steps;
  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    let frame = 0;
    const updateProgress = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = timeline.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, (window.innerHeight * 0.72 - bounds.top) / Math.max(bounds.height, 1)));
        timeline.style.setProperty("--step-progress", `${progress * 100}%`);
      });
    };
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, [steps.length]);
  if (!steps.length) return null;
  return <section className="custom-bake-section custom-pipeline-section" id="custom-workflow" aria-labelledby="custom-workflow-title">
    <SectionHeading kicker="03 / The method" title="How this recipe" accent="comes together." />
    <div className="custom-pipeline-intro"><span className="custom-bake-kicker">Execution steps</span><p>{config.description}</p></div>
    <ol className="custom-authored-steps" ref={timelineRef}>{steps.map((step, index) => <li key={`${step}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol>
  </section>;
}

function RefinementPills({ prompts, onSelect }: { prompts: string[]; onSelect?: (prompt: string, index: number) => void }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  if (!prompts.length) return null;
  const categoryFor = (prompt: string) => {
    const value = prompt.toLowerCase();
    if (/risk|assumption|edge case|verify|verification/.test(value)) return "Add risks";
    if (/checklist|check list|steps to check/.test(value)) return "Checklist";
    if (/plan|implement|action|roadmap/.test(value)) return "Implementation plan";
    return "More specific";
  };
  const copy = async (prompt: string, index: number) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedIndex(index);
      onSelect?.(prompt, index);
      window.setTimeout(() => setCopiedIndex(null), 1800);
    } catch {
      setCopiedIndex(null);
    }
  };
  return <section className="custom-bake-section custom-refinements" id="custom-refinements" aria-labelledby="custom-refinements-title">
    <SectionHeading kicker="04 / A second helping" title="Refine the" accent="flavour." />
    <div className="custom-refinement-pills">{prompts.map((prompt, index) => <button type="button" key={`${index}-${prompt}`} onClick={() => void copy(prompt, index)}><span>{copiedIndex === index ? "Copied" : categoryFor(prompt)}</span><strong>{prompt}</strong><Copy size={14} /></button>)}</div>
  </section>;
}

function TroubleshootAccordion({ items, betterApproach }: { items: CustomRecipeConfig["troubleshooting"]; betterApproach?: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (!items.length && !betterApproach) return null;
  return <section className="custom-bake-section custom-troubleshooting" id="custom-troubleshoot" aria-labelledby="custom-troubleshoot-title">
    <SectionHeading kicker="05 / If the batch is off" title="It didn’t" accent="rise?" />
    {betterApproach && <p className="custom-better-approach">{betterApproach}</p>}
    <div className="custom-troubleshoot-list">{items.map((item, index) => <article key={`${index}-${item.question}`} className={openIndex === index ? "is-open" : ""}><button type="button" aria-expanded={openIndex === index} aria-controls={`custom-troubleshooting-${index}`} onClick={() => setOpenIndex(openIndex === index ? null : index)}><span>{item.question}</span><ChevronDown size={17} /></button>{openIndex === index && <p id={`custom-troubleshooting-${index}`}>{item.answer}</p>}</article>)}</div>
  </section>;
}

function SafetyChecklist({ recipe, checklist, onCompleteChange }: { recipe: RecipeLayoutData; checklist: string[]; onCompleteChange: (complete: boolean) => void }) {
  const [checked, setChecked] = useState<boolean[]>(() => checklist.map(() => false));
  const complete = checked.filter(Boolean).length;
  const progress = (index: number, value: boolean) => setChecked((current) => {
    const next = current.map((item, itemIndex) => itemIndex === index ? value : item);
    onCompleteChange(next.length > 0 && next.every(Boolean));
    return next;
  });
  return <section className="custom-bake-section custom-safety" id="custom-review" aria-labelledby="custom-review-title">
    <SectionHeading kicker="06 / Taste test" title="Review before you" accent="serve." />
    <div className="custom-safety-card"><p>{recipe.verificationNotes || "A quick human review helps catch details AI can miss."}</p><div className="custom-safety-list">{checklist.map((item, index) => <label key={`${index}-${item}`} className={checked[index] ? "is-checked" : ""}><input type="checkbox" checked={checked[index] ?? false} onChange={(event) => progress(index, event.target.checked)} /><span className="custom-checkmark"><Check size={14} /></span><span>{item}</span></label>)}</div><div className="custom-safety-state"><span aria-live="polite" aria-atomic="true">{complete}/{checklist.length} checked</span><strong>{complete === checklist.length ? "Safe to apply" : "A little review goes a long way"}</strong></div></div>
    {!!recipe.guide?.safetyNotes?.length && <ul className="custom-safety-notes">{recipe.guide.safetyNotes.map((note) => <li key={note}>{note}</li>)}</ul>}
  </section>;
}

function ProgressRail({ fields, values, copied, safetyComplete }: { fields: RecipeGuidePromptVariablesItem[]; values: Record<string, string>; copied: boolean; safetyComplete: boolean }) {
  const [active, setActive] = useState("custom-ingredients");
  const requiredFields = fields.filter((field) => field.required);
  const hasIngredients = requiredFields.every((field) => Boolean((values[field.name] ?? field.defaultValue ?? "").trim()));
  const entries = [
    { id: "custom-ingredients", label: "Add ingredients", done: hasIngredients },
    { id: "custom-prompt", label: "Copy the prompt", done: copied },
    { id: "custom-workflow", label: "Run it", done: false },
    { id: "custom-sample", label: "Review", done: safetyComplete },
    { id: "custom-review", label: "Approve", done: safetyComplete },
  ];
  useEffect(() => {
    const update = () => {
      let current = entries[0].id;
      for (const entry of entries) {
        const section = document.getElementById(entry.id);
        if (section && section.getBoundingClientRect().top <= 170) current = entry.id;
      }
      setActive(current);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [fields.length, copied, safetyComplete, values]);
  return <nav className="custom-progress-rail" aria-label="Recipe progress">
    <span className="custom-progress-title">YOUR BAKE</span>{entries.map((entry, index) => <a key={entry.id} href={`#${entry.id}`} aria-label={`${entry.label}${entry.done ? ", complete" : ""}`} aria-current={active === entry.id ? "step" : undefined} className={`${active === entry.id ? "is-active" : ""}${entry.done ? " is-done" : ""}`}><span>{entry.done ? <Check size={13} /> : String(index + 1).padStart(2, "0")}</span>{entry.label}</a>)}
  </nav>;
}

function RelatedRecipes({ recipes }: { recipes: CustomRecipeConfig["related"] }) {
  if (!recipes.length) return null;
  return <section className="custom-bake-section custom-related" id="custom-related" aria-labelledby="custom-related-title">
    <SectionHeading kicker="07 / Keep the oven warm" title="Bake this" accent="next." />
    <div className="custom-related-grid">{recipes.slice(0, 3).map((item) => <Link key={item.url} href={item.url} className="custom-related-card"><Sparkles size={18} /><strong>{item.title}</strong><span>{item.description}</span><i>Bake this next <ArrowRight size={15} /></i></Link>)}</div>
  </section>;
}

function createCustomRecipeConfig(
  recipe: RecipeLayoutData,
  promptLines: string,
  fields: RecipeGuidePromptVariablesItem[],
  related: RecipeCard[],
): CustomRecipeConfig {
  const rawTroubleshooting = recipe.guide?.customContent?.troubleshooting?.length
    ? recipe.guide.customContent.troubleshooting
    : recipe.guide?.commonMistakes ?? [];
  const troubleshooting = rawTroubleshooting.map((item, index) => {
    const separator = item.indexOf("?");
    return separator >= 0
      ? { question: item.slice(0, separator + 1).trim(), answer: item.slice(separator + 1).trim() || item }
      : { question: `Troubleshooting note ${index + 1}`, answer: item };
  });
  return {
    title: recipe.title,
    description: recipe.shortDescription,
    category: recipe.category,
    time: recipe.guide?.timeToResult || recipe.estimatedTime,
    difficulty: recipe.guide?.snapshot?.skillLevel || recipe.difficulty,
    language: recipe.language,
    audience: recipe.audience,
    fields,
    promptLines,
    modelTips: sharedModelTips,
    modelGuidance: sharedModelGuidance,
    steps: recipe.steps.map((step) => step.replace(/^\s*\d+\s*[.)]\s*/, "")),
    refinements: recipe.refinementPrompts,
    troubleshooting,
    checklist: recipe.guide?.customContent?.verificationChecklist?.length
      ? recipe.guide.customContent.verificationChecklist
      : defaultChecklist,
    related: related.map((item) => ({
      title: item.title,
      description: item.shortDescription,
      url: `/recipes/${item.slug}`,
    })),
  };
}

export function CustomRecipeExperience({
  recipe, config, related, promptValues, promptInputErrors, resolvedPrompt, recipeContext, onRecipeContextChange, onPromptValueChange,
  onCopyPrompt, copied = false, copyAttempted = false, onShare, saveAction, onRefinementSelect,
  copyError = false,
}: CustomRecipeExperienceProps) {
  const [safetyComplete, setSafetyComplete] = useState(false);
  const [attemptedCopy, setAttemptedCopy] = useState(copyAttempted);
  const [hideMobileCopy, setHideMobileCopy] = useState(false);
  const [model, setModel] = useState<ModelTab>("Claude");
  const promptFields = useMemo(() => getRecipePromptFields(recipe.prompt, recipe.guide?.promptVariables ?? []), [recipe.prompt, recipe.guide?.promptVariables]);
  const hasErrors = Object.keys(promptInputErrors).length > 0;
  const basePrompt = resolvedPrompt || recipe.prompt;
  const RECIPE = useMemo(
    () => createCustomRecipeConfig(recipe, basePrompt, promptFields, related),
    [recipe, basePrompt, promptFields, related],
  );
  const checklistKey = RECIPE.checklist.join("\u0000");
  const visible = new Set(config.blocks.filter((block: RecipeLayoutBlock) => block.visible).map((block) => block.type));
  const verificationVisible = visible.has("verification");
  useEffect(() => setAttemptedCopy(copyAttempted), [copyAttempted]);
  useEffect(() => {
    if (!verificationVisible) setSafetyComplete(false);
  }, [verificationVisible]);
  useEffect(() => setSafetyComplete(false), [checklistKey]);
  useEffect(() => {
    const targets = [
      document.querySelector("#custom-review"),
      document.querySelector(".custom-troubleshooting"),
      document.querySelector(".site-footer"),
    ].filter(
      (target): target is Element => target !== null,
    );
    if (!targets.length || !("IntersectionObserver" in window)) return;
    const visibleTargets = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visibleTargets.add(entry.target);
        else visibleTargets.delete(entry.target);
      }
      setHideMobileCopy(visibleTargets.size > 0);
    }, { threshold: 0.02 });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [recipe.title, visible.has("verification")]);

  return <div className="custom-recipe-experience">
    <ProgressRail fields={promptFields} values={promptValues} copied={copied} safetyComplete={safetyComplete} />
    <main>
      <section className="custom-oven-hero" id="custom-hero">
        <div className="custom-oven-copy"><div className="custom-crumb"><Link href="/recipes">Recipes</Link><span>/</span><span>{recipe.category}</span></div><span className="custom-bake-kicker">{recipe.category} / THE DAILY BAKE</span><h1>{recipe.title}</h1><p>{recipe.shortDescription}</p>      </div>
        <aside className="custom-oven-card" aria-label="Recipe details"><div className="custom-oven-glow" /><div className="custom-oven-status"><span /> Preheating…</div><div className="custom-oven-time"><small>TIME TO BAKE</small><strong>{recipe.estimatedTime || recipe.guide?.timeToResult || "10–20 min"}</strong></div><div className="custom-oven-detail"><span>Difficulty</span><strong className="custom-flames" aria-label={recipe.difficulty}>{Array.from({ length: 3 }, (_, index) => <Flame key={index} size={16} fill={index < (recipe.difficulty.toLowerCase().includes("beginner") ? 1 : recipe.difficulty.toLowerCase().includes("intermediate") ? 2 : 3) ? "currentColor" : "none"} className={index < (recipe.difficulty.toLowerCase().includes("beginner") ? 1 : recipe.difficulty.toLowerCase().includes("intermediate") ? 2 : 3) ? "is-lit" : ""} />)}<small>{recipe.difficulty}</small></strong></div><div className="custom-oven-detail"><span>Language</span><strong>{recipe.language || "English"}</strong></div><div className="custom-oven-detail"><span>Serves</span><strong>{recipe.audience || "Marketing professionals"}</strong></div></aside>
      </section>
      {recipeContext && onRecipeContextChange && <div className="custom-bake-context"><RecipeContextInputs value={recipeContext} onChange={onRecipeContextChange} /></div>}
      <div className="custom-bake-toolbar" aria-label="Recipe actions"><span><CheckCircle2 size={16} /> A practical recipe, ready to make your own</span><div className="custom-actions-inline"><button type="button" className="custom-ghost-button" onClick={onShare}><Share2 size={15} />Share link</button>{saveAction}<button type="button" className="custom-ghost-button" onClick={() => document.getElementById("custom-ingredients")?.scrollIntoView({ behavior: "smooth", block: "start" })}><RotateCcw size={15} />Remix with my inputs</button><a href="#custom-ingredients">Start baking <ArrowRight size={15} /></a></div></div>
        <div className="custom-bake-content">
          <IngredientTray fields={RECIPE.fields} values={promptValues} errors={promptInputErrors} onChange={onPromptValueChange} attempted={attemptedCopy || copyAttempted} tags={recipe.tags} tools={recipe.aiTools} />
        <PromptStudio prompt={RECIPE.promptLines} fields={RECIPE.fields} values={promptValues} errors={promptInputErrors} onCopy={(value) => onCopyPrompt?.(value)} copied={copied} attempted={attemptedCopy || copyAttempted} onAttempt={() => setAttemptedCopy(true)} valid={!hasErrors} copyError={copyError} model={model} onModelChange={setModel} modelTips={RECIPE.modelTips} modelGuidance={RECIPE.modelGuidance} />
          <SampleBake recipe={recipe} />
        {visible.has("workflow") && <WorkflowPipeline config={RECIPE} />}
        {visible.has("refinements") && <RefinementPills prompts={RECIPE.refinements} onSelect={onRefinementSelect} />}
        {visible.has("troubleshooting") && <TroubleshootAccordion items={RECIPE.troubleshooting} betterApproach={recipe.guide?.betterApproach} />}
        {verificationVisible && <SafetyChecklist key={checklistKey} recipe={recipe} checklist={RECIPE.checklist} onCompleteChange={setSafetyComplete} />}
        <RelatedRecipes recipes={RECIPE.related} />
      </div>
    </main>
    <div className={`custom-mobile-copy-bar${hideMobileCopy ? " is-hidden" : ""}`} aria-hidden={hideMobileCopy}><button type="button" disabled={hasErrors} tabIndex={hideMobileCopy ? -1 : 0} onClick={() => { setAttemptedCopy(true); if (!hasErrors) onCopyPrompt?.(modelAdaptation(basePrompt, model, RECIPE.modelGuidance)); }}>{copied ? <><Check className="custom-copied-check" size={16} /> Copied</> : <><Copy size={16} />{hasErrors ? "Add ingredients first" : "Copy prompt"}</>}</button></div>
  </div>;
}
