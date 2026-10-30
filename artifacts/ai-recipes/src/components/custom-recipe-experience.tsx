import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import {
  ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown, ClipboardCheck,
  Copy, Flame, ListFilter, MessageSquareText, NotebookPen, RotateCcw, Share2, Sparkles,
} from "lucide-react";
import { Link } from "wouter";
import type { RecipeCard, RecipeGuidePromptVariablesItem, RecipeLayoutBlock, RecipeLayoutConfig } from "@workspace/api-client-react";
import { RecipePromptInputs } from "@/components/recipe-prompt-inputs";
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
const modelTips: Record<ModelTab, string> = {
  Claude: "Give Claude your source material first, then ask it to separate evidence from interpretation.",
  ChatGPT: "Ask ChatGPT to keep the digest structured and make each recommendation actionable.",
  Gemini: "Ask Gemini to connect recurring themes while preserving source context.",
  Perplexity: "Ask Perplexity to prioritize citations and distinguish verified facts from discussion.",
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

function titleFromTroubleshooting(value: string, index: number) {
  const question = value.match(/^(.{1,72}?\?)/);
  return question?.[1] ?? ["A little too broad?", "Missing an ingredient?", "The result feels underdone?"][index % 3];
}

function modelAdaptation(prompt: string, model: ModelTab) {
  const instruction: Record<ModelTab, string> = {
    Claude: "Work carefully from the supplied context. Separate observed facts from interpretation.",
    ChatGPT: "Follow the requested structure. Be concise, specific, and actionable.",
    Gemini: "Connect recurring themes while retaining the source context for each insight.",
    Perplexity: "Prioritize verifiable claims and make uncertainty and source limits explicit.",
  };
  return `${prompt.trim()}\n\n${model} guidance:\n${instruction[model]}`;
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
  const ready = fields.filter((field) => Boolean((values[field.name] ?? field.defaultValue ?? "").trim())).length;
  const groups = fields.map((field) => ({ field, kind: classifyIngredient(field) }));
  const ordinary = groups.filter(({ kind }) => kind === "standard").map(({ field }) => field);
  return <section className="custom-bake-section custom-ingredients" id="custom-ingredients" aria-labelledby="custom-ingredients-title">
    <SectionHeading kicker="01 / Ingredients tray" title="Gather your" accent="ingredients." />
    <div className="custom-pantry">
      <div className="custom-pantry-copy"><span>Pantry check</span><strong>{ready}/{fields.length} ready</strong></div>
      <div className="custom-pantry-track" role="progressbar" aria-label="Ingredients ready" aria-valuemin={0} aria-valuemax={fields.length} aria-valuenow={ready}><span style={{ width: `${fields.length ? ready / fields.length * 100 : 100}%` }} /></div>
      <p>{fields.length ? "A few details help the AI make this recipe yours." : "This recipe is ready to copy as-is."}</p>
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
}) {
  const [model, setModel] = useState<ModelTab>("Claude");
  const [changedValues, setChangedValues] = useState<string[]>([]);
  const previousValues = useRef(values);
  const adapted = useMemo(() => modelAdaptation(prompt, model), [prompt, model]);
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

  return <section className="custom-bake-section custom-prompt-studio" id="custom-prompt" aria-labelledby="custom-prompt-title">
    <SectionHeading kicker="02 / The oven" title="Your prompt is" accent="cooking." />
    <div className="custom-model-tabs" role="tablist" aria-label="Adapt the prompt for an AI model">
      {modelTabs.map((tab) => <button key={tab} type="button" role="tab" id={`custom-model-tab-${tab.toLowerCase()}`} aria-selected={model === tab} aria-controls="custom-model-panel" onClick={() => setModel(tab)}>{tab}</button>)}
    </div>
    <p className="custom-model-tip"><Sparkles size={14} />{modelTips[model]}</p>
    <div className={`layout-prompt custom-prompt-code${copied ? " is-baked" : ""}`} id="custom-model-panel" role="tabpanel" aria-labelledby={`custom-model-tab-${model.toLowerCase()}`}>
      <div className="layout-prompt-toolbar custom-prompt-toolbar"><span><span className="custom-live-dot" /> LIVE PROMPT PREVIEW · {model}</span>
        <button type="button" className="custom-primary-button" disabled={!valid} title={!valid ? tooltip : undefined} aria-describedby={!valid && tooltip ? "custom-copy-requirements" : undefined} onClick={() => { onAttempt(); if (valid) onCopy(adapted); }}>{copied ? <><Check size={15} />Copied</> : <><Copy size={15} />{valid ? "Bake it" : "Copy prompt"}</>}</button>
      </div>
      {!valid && tooltip && <span className="custom-sr-only" id="custom-copy-requirements">{tooltip}</span>}
      <pre aria-label="Live prompt text">{adapted.split(/\r?\n/).map((line, lineIndex) => <span className="custom-prompt-line" key={`${lineIndex}-${line}`}>{(valuePattern ? line.split(valuePattern) : [line]).map((part, index) => activeValues.includes(part) ? <mark className={`custom-prompt-value${changedValues.some((name) => values[name]?.trim() === part) ? " is-new" : ""}`} key={`${index}-${part}`}>{part}</mark> : part)}</span>)}</pre>
    </div>
    <p className="custom-privacy-note"><ClipboardCheck size={15} /> Remove confidential or personal information before pasting into an AI tool.</p>
    {attempted && Object.keys(errors).length > 0 && <p className="custom-form-error" role="alert" aria-live="polite">Complete the required ingredients before copying your prompt.</p>}
    {copyError && <p className="custom-form-error" role="alert" aria-live="polite">Clipboard access failed. Select and copy the prompt text above.</p>}
    <div className="custom-copy-toast" role="status" aria-live="polite">{copied && <><span aria-hidden="true">✦</span> Fresh from the oven — prompt copied.</>}</div>
  </section>;
}

function SampleBake({ recipe, fields, values }: { recipe: RecipeLayoutData; fields: RecipeGuidePromptVariablesItem[]; values: Record<string, string> }) {
  const examples = recipe.guide?.examples ?? [];
  const exampleOutput = examples[0]?.output || recipe.exampleOutput;
  const exampleInput = examples[0]?.input || recipe.exampleInput;
  const expected = recipe.guide?.expectedOutput?.description || recipe.guide?.snapshot?.output || recipe.verificationNotes;
  const summaryCards = [
    { title: "Top theme", value: excerpt(exampleOutput) || "Add an authored example output to preview this bake." },
    { title: "Most-discussed topic", value: excerpt(recipe.title || recipe.category) },
    { title: "Notable shift", value: excerpt(expected) || "The finished output is shaped by the prompt and your ingredients." },
  ];
  const posts = examples.length ? examples.slice(0, 3) : exampleInput || exampleOutput
    ? [{ scenario: "Authored recipe example", input: exampleInput, output: exampleOutput }]
    : [];
  const dateField = fields.find((field) => classifyIngredient(field) === "date");
  const dateRange = dateField ? values[dateField.name] || dateField.defaultValue : "";
  return <section className="custom-bake-section custom-sample-bake" id="custom-sample" aria-labelledby="custom-sample-title">
    <details className="custom-sample-details">
      <summary><span className="custom-sample-icon"><BookOpen size={18} /></span><span><small>EXAMPLE OUTPUT · NOT LIVE DATA</small><strong id="custom-sample-title">See a finished bake</strong></span><ChevronDown size={18} /></summary>
      <div className="custom-notion-mock">
        <header className="custom-notion-header"><span><BookOpen size={17} /> Example workspace / Marketing insights</span><small>Illustrative preview · not live data</small></header>
        <div className="custom-notion-page"><span className="custom-bake-kicker">WEEKLY DIGEST / EXAMPLE</span><h3>{recipe.title}</h3><p className="custom-notion-range">{dateRange || recipe.guide?.timeToResult || recipe.estimatedTime} · {recipe.category}</p>
          <div className="custom-summary-grid">{summaryCards.map((card) => <article key={card.title}><span>{card.title}</span><p>{card.value}</p></article>)}</div>
          <div className="custom-trending-row"><strong>Trending keywords</strong><div>{(recipe.tags.length ? recipe.tags : [recipe.category]).slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}</div></div>
          <div className="custom-top-posts"><h4>Top posts <small>from authored example material</small></h4>{posts.length ? posts.map((post, index) => <article key={`${post.scenario}-${index}`}><span className="custom-post-source">{post.scenario || "Example"}</span><p>{excerpt(post.input, 180) || excerpt(post.output, 180)}</p><span className="custom-post-summary">{excerpt(post.output, 210)}</span><ArrowUpRight size={14} aria-hidden="true" /></article>) : <p className="custom-empty-example">No authored sample output is attached to this recipe yet.</p>}</div>
        </div>
      </div>
    </details>
  </section>;
}

const pipelineIcons = [MessageSquareText, ListFilter, Sparkles, NotebookPen, BookOpen];
const pipelineNames = ["Collect", "Filter", "Summarize", "Digest", "Notion"];
function WorkflowPipeline({ recipe }: { recipe: RecipeLayoutData }) {
  const [openStage, setOpenStage] = useState<number | null>(null);
  const steps = recipe.steps.map((step) => step.replace(/^\s*\d+\s*[.)]\s*/, ""));
  const tools = recipe.guide?.tools?.length ? recipe.guide.tools.map((tool) => tool.name) : recipe.aiTools;
  const failures = recipe.guide?.customContent?.troubleshooting?.length
    ? recipe.guide.customContent.troubleshooting
    : recipe.guide?.commonMistakes ?? [];
  return <section className="custom-bake-section custom-pipeline-section" id="custom-workflow" aria-labelledby="custom-workflow-title">
    <SectionHeading kicker="03 / The method" title="How this recipe" accent="comes together." />
    <div className="custom-pipeline-intro"><span className="custom-bake-kicker">Execution Steps &amp; Workflow Guide</span><p>{recipe.guide?.snapshot?.worksBestWhen || recipe.shortDescription}</p></div>
    <div className="custom-pipeline" aria-label="Recipe workflow">
      {pipelineNames.map((name, index) => {
        const Icon = pipelineIcons[index];
        const detail = steps[index] || [
          `Gather the ingredients needed for ${recipe.title}.`,
          "Remove noise and keep details relevant to the goal.",
          "Ask the selected AI tool to identify useful patterns.",
          "Shape the response into the recipe's intended output.",
          tools.some((tool) => tool.toLowerCase().includes("notion")) ? "Send the reviewed digest to the chosen Notion database." : "Review and place the finished output in your chosen workspace.",
        ][index];
        const failure = failures[index] || recipe.verificationNotes || "Review this step's output before continuing.";
        return <article className={`custom-pipeline-stage${openStage === index ? " is-open" : ""}`} key={name}>
          <button type="button" aria-expanded={openStage === index} aria-controls={`pipeline-stage-${index}`} onClick={() => setOpenStage(openStage === index ? null : index)}>
            <span className="custom-pipeline-icon"><Icon size={19} /></span><span className="custom-pipeline-number">{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong><ChevronDown size={15} />
          </button>
          {openStage === index && <div className="custom-pipeline-detail" id={`pipeline-stage-${index}`}><p>{detail}</p><dl><div><dt>Needs</dt><dd>{index === 0 ? (recipe.requiredInputs[0] || "Recipe ingredients") : tools.join(", ") || "The previous step's output"}</dd></div><div><dt>Watch for</dt><dd>{failure}</dd></div></dl></div>}
        </article>;
      })}
    </div>
    <div className="custom-pipeline-line" aria-hidden="true"><span /></div>
    {steps.length > 0 && <ol className="custom-authored-steps">{steps.map((step, index) => <li key={`${step}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol>}
  </section>;
}

function RefinementPills({ recipe, onSelect }: { recipe: RecipeLayoutData; onSelect?: (prompt: string, index: number) => void }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const prompts = recipe.refinementPrompts;
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

function TroubleshootAccordion({ recipe }: { recipe: RecipeLayoutData }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const items = recipe.guide?.customContent?.troubleshooting?.length
    ? recipe.guide.customContent.troubleshooting
    : recipe.guide?.commonMistakes ?? [];
  if (!items.length && !recipe.guide?.betterApproach) return null;
  return <section className="custom-bake-section custom-troubleshooting" id="custom-troubleshoot" aria-labelledby="custom-troubleshoot-title">
    <SectionHeading kicker="05 / If the batch is off" title="It didn’t" accent="rise?" />
    {recipe.guide?.betterApproach && <p className="custom-better-approach">{recipe.guide.betterApproach}</p>}
    <div className="custom-troubleshoot-list">{items.map((item, index) => <article key={`${index}-${item}`} className={openIndex === index ? "is-open" : ""}><button type="button" aria-expanded={openIndex === index} onClick={() => setOpenIndex(openIndex === index ? null : index)}><span>{titleFromTroubleshooting(item, index)}</span><ChevronDown size={17} /></button>{openIndex === index && <p>{item}</p>}</article>)}</div>
  </section>;
}

const safetyDefaults = [
  "The result answers the original task.",
  "Important dates, figures, and names are checked.",
  "Claims and sources are independently verified.",
  "Sensitive or confidential details are removed.",
  "Links, quotations, and attributions are accurate.",
  "A person has reviewed the result before sharing.",
];
function SafetyChecklist({ recipe, onCompleteChange }: { recipe: RecipeLayoutData; onCompleteChange: (complete: boolean) => void }) {
  const [checked, setChecked] = useState<boolean[]>(() => safetyDefaults.map(() => false));
  const complete = checked.filter(Boolean).length;
  const progress = (index: number, value: boolean) => setChecked((current) => {
    const next = current.map((item, itemIndex) => itemIndex === index ? value : item);
    onCompleteChange(next.every(Boolean));
    return next;
  });
  return <section className="custom-bake-section custom-safety" id="custom-review" aria-labelledby="custom-review-title">
    <SectionHeading kicker="06 / Taste test" title="Review before you" accent="serve." />
    <div className="custom-safety-card"><p>{recipe.verificationNotes || "A quick human review helps catch details AI can miss."}</p><div className="custom-safety-list">{safetyDefaults.map((item, index) => <label key={item} className={checked[index] ? "is-checked" : ""}><input type="checkbox" checked={checked[index]} onChange={(event) => progress(index, event.target.checked)} /><span className="custom-checkmark"><Check size={14} /></span><span>{item}</span></label>)}</div><div className="custom-safety-state" role="status" aria-live="polite"><span>{complete}/{safetyDefaults.length} checked</span><strong>{complete === safetyDefaults.length ? "Safe to apply" : "A little review goes a long way"}</strong></div></div>
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
    <span className="custom-progress-title">YOUR BAKE</span>{entries.map((entry, index) => <a key={entry.id} href={`#${entry.id}`} className={`${active === entry.id ? "is-active" : ""}${entry.done ? " is-done" : ""}`}><span>{entry.done ? <Check size={13} /> : String(index + 1).padStart(2, "0")}</span>{entry.label}</a>)}
  </nav>;
}

function RelatedRecipes({ recipes }: { recipes: RecipeCard[] }) {
  if (!recipes.length) return null;
  return <section className="custom-bake-section custom-related" id="custom-related" aria-labelledby="custom-related-title">
    <SectionHeading kicker="07 / Keep the oven warm" title="Bake this" accent="next." />
    <div className="custom-related-grid">{recipes.slice(0, 3).map((item) => <Link key={item.id} href={`/recipes/${item.slug}`} className="custom-related-card"><Sparkles size={18} /><strong>{item.title}</strong><span>{item.shortDescription}</span><i>Bake this next <ArrowRight size={15} /></i></Link>)}</div>
  </section>;
}

export function CustomRecipeExperience({
  recipe, config, related, promptValues, promptInputErrors, resolvedPrompt, onPromptValueChange,
  onCopyPrompt, copied = false, copyAttempted = false, onShare, saveAction, onRefinementSelect,
  copyError = false,
}: CustomRecipeExperienceProps) {
  const [safetyComplete, setSafetyComplete] = useState(false);
  const [attemptedCopy, setAttemptedCopy] = useState(copyAttempted);
  const promptFields = useMemo(() => getRecipePromptFields(recipe.prompt, recipe.guide?.promptVariables ?? []), [recipe.prompt, recipe.guide?.promptVariables]);
  const hasErrors = Object.keys(promptInputErrors).length > 0;
  const basePrompt = resolvedPrompt || recipe.prompt;
  const visible = new Set(config.blocks.filter((block: RecipeLayoutBlock) => block.visible).map((block) => block.type));
  useEffect(() => setAttemptedCopy(copyAttempted), [copyAttempted]);
  useEffect(() => {
    if (!visible.has("verification")) setSafetyComplete(false);
  }, [config]);

  return <div className="custom-recipe-experience">
    <ProgressRail fields={promptFields} values={promptValues} copied={copied} safetyComplete={safetyComplete} />
    <main>
      <section className="custom-oven-hero" id="custom-hero">
        <div className="custom-oven-copy"><div className="custom-crumb"><Link href="/recipes">Recipes</Link><span>/</span><span>{recipe.category}</span></div><span className="custom-bake-kicker">{recipe.category} / THE DAILY BAKE</span><h1>{recipe.title}</h1><p>{recipe.shortDescription}</p>      </div>
        <aside className="custom-oven-card" aria-label="Recipe details"><div className="custom-oven-glow" /><div className="custom-oven-status"><span /> Preheating…</div><div className="custom-oven-time"><small>TIME TO BAKE</small><strong>{recipe.estimatedTime || recipe.guide?.timeToResult || "10–20 min"}</strong></div><div className="custom-oven-detail"><span>Difficulty</span><strong className="custom-flames" aria-label={recipe.difficulty}>{Array.from({ length: 3 }, (_, index) => <Flame key={index} size={16} fill={index < (recipe.difficulty.toLowerCase().includes("beginner") ? 1 : recipe.difficulty.toLowerCase().includes("intermediate") ? 2 : 3) ? "currentColor" : "none"} className={index < (recipe.difficulty.toLowerCase().includes("beginner") ? 1 : recipe.difficulty.toLowerCase().includes("intermediate") ? 2 : 3) ? "is-lit" : ""} />)}<small>{recipe.difficulty}</small></strong></div><div className="custom-oven-detail"><span>Language</span><strong>{recipe.language || "English"}</strong></div><div className="custom-oven-detail"><span>Serves</span><strong>{recipe.audience || "Marketing professionals"}</strong></div></aside>
      </section>
      <div className="custom-bake-toolbar" aria-label="Recipe actions"><span><CheckCircle2 size={16} /> A practical recipe, ready to make your own</span><div className="custom-actions-inline"><button type="button" className="custom-ghost-button" onClick={onShare}><Share2 size={15} />Share link</button>{saveAction}<button type="button" className="custom-ghost-button" onClick={() => document.getElementById("custom-ingredients")?.scrollIntoView({ behavior: "smooth", block: "start" })}><RotateCcw size={15} />Remix with my inputs</button><a href="#custom-ingredients">Start baking <ArrowRight size={15} /></a></div></div>
        <div className="custom-bake-content">
          <IngredientTray fields={promptFields} values={promptValues} errors={promptInputErrors} onChange={onPromptValueChange} attempted={attemptedCopy || copyAttempted} tags={recipe.tags} tools={recipe.aiTools} />
        <PromptStudio prompt={basePrompt} fields={promptFields} values={promptValues} errors={promptInputErrors} onCopy={(value) => onCopyPrompt?.(value)} copied={copied} attempted={attemptedCopy || copyAttempted} onAttempt={() => setAttemptedCopy(true)} valid={!hasErrors} copyError={copyError} />
          <SampleBake recipe={recipe} fields={promptFields} values={promptValues} />
        {visible.has("workflow") && <WorkflowPipeline recipe={recipe} />}
        {visible.has("refinements") && <RefinementPills recipe={recipe} onSelect={onRefinementSelect} />}
        {visible.has("troubleshooting") && <TroubleshootAccordion recipe={recipe} />}
        {visible.has("verification") && <SafetyChecklist recipe={recipe} onCompleteChange={setSafetyComplete} />}
        <RelatedRecipes recipes={related} />
      </div>
    </main>
    <div className="custom-mobile-copy-bar"><button type="button" disabled={hasErrors} onClick={() => { setAttemptedCopy(true); if (!hasErrors) onCopyPrompt?.(modelAdaptation(basePrompt, "Claude")); }}>{copied ? <><Check size={16} /> Copied</> : <><Copy size={16} />{hasErrors ? "Add ingredients first" : "Bake it"}</>}</button></div>
  </div>;
}
