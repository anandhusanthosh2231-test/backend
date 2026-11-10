import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight, Check, ChevronDown, Copy, RotateCcw, Share2, ShieldCheck, X,
} from "lucide-react";
import { Link } from "wouter";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import type { Recipe, RecipeCard, RecipeGuidePromptVariablesItem } from "@workspace/api-client-react";
import { RecipeContextInputs } from "@/components/recipe-context-inputs";
import { RecipePromptInputs } from "@/components/recipe-prompt-inputs";
import type { RecipeContext } from "@/lib/recipe-context";
import "./individual-recipe-page.css";

type Model = "Claude" | "ChatGPT" | "Gemini" | "Perplexity";

const models: Model[] = ["Claude", "ChatGPT", "Gemini", "Perplexity"];
const modelUrls: Record<Model, string> = {
  Claude: "https://claude.ai/new",
  ChatGPT: "https://chatgpt.com/",
  Gemini: "https://gemini.google.com/app",
  Perplexity: "https://www.perplexity.ai/",
};
const modelCopy: Record<Model, { tip: string; guidance: string }> = {
  Claude: {
    tip: "Separate facts from assumptions and stay grounded in the supplied context.",
    guidance: "Work carefully from the supplied context, distinguish facts from assumptions, and do not invent details.",
  },
  ChatGPT: {
    tip: "Follow the requested structure and make each recommendation actionable.",
    guidance: "Follow the requested structure, keep advice specific and actionable, and ask a clarifying question when important context is missing.",
  },
  Gemini: {
    tip: "Connect relevant details without losing the supplied context.",
    guidance: "Connect relevant details while preserving the original context and calling out uncertainty.",
  },
  Perplexity: {
    tip: "Prioritise verifiable claims and make uncertainty explicit.",
    guidance: "Prioritise verifiable claims, cite reliable sources for current facts when needed, and make uncertainty explicit.",
  },
};

type IndividualRecipePageProps = {
  recipe: Recipe;
  fields: RecipeGuidePromptVariablesItem[];
  values: Record<string, string>;
  errors: Record<string, string>;
  resolvedPrompt: string;
  recipeContext: RecipeContext;
  related: RecipeCard[];
  visualShowcase?: ReactNode;
  saveAction?: ReactNode;
  copied: boolean;
  copyError: boolean;
  onRecipeContextChange: (value: RecipeContext) => void;
  onPromptValueChange: (name: string, value: string) => void;
  onCopyPrompt: (prompt: string) => void;
  onShare: () => void;
  onRefinementSelect: (prompt: string, index: number) => void;
};

function getChecklist(recipe: Recipe) {
  const configured = recipe.guide?.customContent?.verificationChecklist;
  if (configured?.length) return configured;
  const notes = recipe.verificationNotes
    .split(/\n+/)
    .map((item) => item.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  return notes.length ? notes : [
    "The result answers the original task.",
    "Important names, numbers, and details are accurate.",
    "Claims and sources are independently verified.",
    "Sensitive information has been removed.",
    "The output follows the requested format.",
    "A person has reviewed the result before sharing.",
  ];
}

function titleForRefinement(prompt: string, index: number) {
  const firstLine = prompt.split(/\r?\n/, 1)[0].trim();
  return firstLine.length > 44 ? `${firstLine.slice(0, 41).trimEnd()}…` : firstLine || `Refine ${index + 1}`;
}

function isFieldReady(field: RecipeGuidePromptVariablesItem, values: Record<string, string>) {
  const value = values[field.name] ?? field.defaultValue ?? "";
  return field.type === "checkbox" ? value === "true" : Boolean(value.trim());
}

export function IndividualRecipePage({
  recipe, fields, values, errors, resolvedPrompt, recipeContext, related, saveAction,
  visualShowcase, copied, copyError, onRecipeContextChange, onPromptValueChange, onCopyPrompt, onShare,
  onRefinementSelect,
}: IndividualRecipePageProps) {
  const requiredFields = fields.filter((field) => field.required);
  const [model, setModel] = useState<Model>("Claude");
  const [checked, setChecked] = useState<boolean[]>([]);
  const [attemptedCopy, setAttemptedCopy] = useState(false);
  const [validationPulse, setValidationPulse] = useState(false);
  const [wipingField, setWipingField] = useState<string | null>(null);
  const [changedFields, setChangedFields] = useState<string[]>([]);
  const [changedLines, setChangedLines] = useState<number[]>([]);
  const [transitioningModel, setTransitioningModel] = useState(false);
  const [showMobilePreviewHint, setShowMobilePreviewHint] = useState(false);
  const [readyPop, setReadyPop] = useState(false);
  const [lowPowerDevice, setLowPowerDevice] = useState(false);
  const [clearedFields, setClearedFields] = useState<Set<string>>(() => new Set(
    requiredFields.filter((field) => isFieldReady(field, values)).map((field) => field.name),
  ));
  const hasShownPreviewHint = useRef(false);
  const previousValues = useRef(values);
  const pendingCommitTimers = useRef(new Map<string, number>());
  const previewRef = useRef<HTMLPreElement>(null);
  const lineRefs = useRef(new Map<number, HTMLSpanElement>());
  const rootRef = useRef<HTMLDivElement>(null);
  const checklistItems = useMemo(() => getChecklist(recipe), [recipe]);
  const readyCount = requiredFields.filter((field) => isFieldReady(field, values)).length;
  const ready = readyCount === requiredFields.length;
  const clearCount = requiredFields.filter((field) => clearedFields.has(field.name)).length;
  const previewReady = clearCount === requiredFields.length;
  const previousReady = useRef(previewReady);
  const missingFields = fields.filter((field) =>
    (field.required === true && !isFieldReady(field, values)) || Boolean(errors[field.name]),
  );
  const canCopy = missingFields.length === 0;
  const completedChecklist = checked.filter(Boolean).length;
  const prompt = useMemo(
    () => `${resolvedPrompt.trim()}\n\n${model} guidance:\n${modelCopy[model].guidance}`,
    [resolvedPrompt, model],
  );
  const example = recipe.guide?.examples?.[0];
  const troubleshooting = recipe.guide?.customContent?.troubleshooting?.length
    ? recipe.guide.customContent.troubleshooting
    : recipe.guide?.commonMistakes ?? [];
  const refinements = recipe.refinementPrompts ?? [];
  const steps = recipe.steps ?? [];
  const copyPrompt = () => onCopyPrompt(prompt);
  const promptLines = (prompt || recipe.prompt).split(/\r?\n/);
  const fieldsForLines = promptLines.map((line) => fields.find((field) => {
    const value = values[field.name]?.trim();
    return value && line.includes(value);
  })?.name);

  const scrollPreviewToLine = (lineIndex: number) => {
    const preview = previewRef.current;
    const line = lineRefs.current.get(lineIndex);
    if (!preview || !line) return;
    const previewRect = preview.getBoundingClientRect();
    const lineRect = line.getBoundingClientRect();
    preview.scrollTo({
      top: Math.max(0, preview.scrollTop + lineRect.top - previewRect.top - 16),
      behavior: "smooth",
    });
  };

  const animateFieldFlight = (fieldName: string) => {
    const fieldIndex = fields.findIndex((field) => field.name === fieldName);
    const field = fields[fieldIndex];
    const value = values[fieldName]?.trim();
    if (!field || !value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const source = document.getElementById(`ir-input-${fieldIndex}`);
    const lineIndex = fieldsForLines.findIndex((lineField) => lineField === fieldName);
    const fallbackLine = Math.min(promptLines.length - 1, Math.floor(fieldIndex / Math.max(fields.length, 1) * promptLines.length));
    const target = lineRefs.current.get(lineIndex >= 0 ? lineIndex : fallbackLine);
    if (!source || !target || !rootRef.current) return;
    const from = source.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const ghost = document.createElement("span");
    ghost.className = "ir-flight-chip";
    ghost.textContent = value.length > 34 ? `${value.slice(0, 31)}…` : value;
    ghost.style.left = `${from.left}px`;
    ghost.style.top = `${from.top}px`;
    document.body.append(ghost);
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    const animation = ghost.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(.88)`, opacity: 0 },
      ],
      { duration: 520, easing: "cubic-bezier(.2,.8,.25,1)" },
    );
    animation.onfinish = () => ghost.remove();
    setWipingField(fieldName);
    setChangedFields((current) => [...new Set([...current, fieldName])]);
    scrollPreviewToLine(lineIndex >= 0 ? lineIndex : fallbackLine);
    window.setTimeout(() => {
      setWipingField((current) => current === fieldName ? null : current);
      setChangedFields((current) => current.filter((name) => name !== fieldName));
    }, 650);
  };

  const commitField = (fieldName: string) => {
    const pendingTimer = pendingCommitTimers.current.get(fieldName);
    if (pendingTimer !== undefined) {
      window.clearTimeout(pendingTimer);
      pendingCommitTimers.current.delete(fieldName);
    }
    const field = fields.find((item) => item.name === fieldName);
    if (!field || field.required !== true) return;
    if (!isFieldReady(field, values)) {
      setClearedFields((current) => {
        const next = new Set(current);
        next.delete(fieldName);
        return next;
      });
      return;
    }
    setClearedFields((current) => new Set(current).add(fieldName));
    animateFieldFlight(fieldName);
  };

  const handleCopy = () => {
    setAttemptedCopy(true);
    if (!canCopy) {
      setValidationPulse(true);
      const firstMissing = missingFields[0];
      const firstIndex = firstMissing ? fields.findIndex((field) => field.name === firstMissing.name) : -1;
      if (firstIndex >= 0) {
        const input = document.getElementById(`ir-input-${firstIndex}`);
        input?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (input instanceof HTMLElement) window.setTimeout(() => input.focus(), 300);
      }
      window.setTimeout(() => setValidationPulse(false), 350);
      return;
    }
    requiredFields.forEach((field) => commitField(field.name));
    copyPrompt();
  };

  const selectModel = (nextModel: Model) => {
    if (nextModel === model) return;
    const nextPrompt = `${resolvedPrompt.trim()}\n\n${nextModel} guidance:\n${modelCopy[nextModel].guidance}`;
    const priorLines = prompt.split(/\r?\n/);
    const nextLines = nextPrompt.split(/\r?\n/);
    const differing = nextLines.flatMap((line, index) => line !== priorLines[index] ? [index] : []);
    setChangedLines(differing);
    setTransitioningModel(true);
    setModel(nextModel);
    window.setTimeout(() => {
      setTransitioningModel(false);
      setChangedLines([]);
    }, 650);
  };

  useEffect(() => {
    setChecked(checklistItems.map(() => false));
  }, [checklistItems]);

  useEffect(() => {
    setLowPowerDevice(
      window.matchMedia("(max-width: 767px)").matches
      && navigator.hardwareConcurrency > 0
      && navigator.hardwareConcurrency <= 4,
    );
  }, []);

  useEffect(() => {
    const changed = fields.filter((field) => previousValues.current[field.name] !== values[field.name]);
    const hadEmptyChangedField = changed.some((field) => !previousValues.current[field.name]?.trim() && values[field.name]?.trim());
    previousValues.current = values;
    if (!changed.length) return;
    setClearedFields((current) => {
      const next = new Set(current);
      changed.filter((field) => field.required === true).forEach((field) => next.delete(field.name));
      return next;
    });
    const timers = changed.map((field) => {
      const timer = window.setTimeout(() => {
        pendingCommitTimers.current.delete(field.name);
        if (values[field.name]?.trim()) commitField(field.name);
      }, 600);
      pendingCommitTimers.current.set(field.name, timer);
      return timer;
    });
    if (hadEmptyChangedField && !hasShownPreviewHint.current) {
      hasShownPreviewHint.current = true;
      setShowMobilePreviewHint(true);
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [fields, values]);

  useEffect(() => {
    if (previewReady && !previousReady.current) {
      setReadyPop(true);
      window.setTimeout(() => setReadyPop(false), 1350);
    }
    previousReady.current = previewReady;
  }, [previewReady]);

  useEffect(() => {
    const firstChangedLine = changedLines[0];
    if (transitioningModel && firstChangedLine !== undefined) {
      window.setTimeout(() => scrollPreviewToLine(firstChangedLine), 0);
    }
  }, [prompt, changedLines, transitioningModel]);

  return (
    <div className="individual-recipe-page" ref={rootRef}>
      <header className="ir-hero ir-shell">
        <div className="ir-hero-meta">
          <span className={`ir-status${ready ? " is-ready" : ""}`} role="status" aria-live="polite">
            <i aria-hidden="true" />{ready ? "OVEN READY" : "PREHEATING…"}
          </span>
          <nav className="ir-breadcrumb" aria-label="Breadcrumb">
            <Link href="/recipes">Recipes</Link><span aria-hidden="true">/</span>
            <Link href={`/categories/${recipe.categorySlug}`}>{recipe.category}</Link><span aria-hidden="true">/</span>
            <span>{recipe.title}</span>
          </nav>
          <SheetPrimitive.Root>
            <SheetPrimitive.Trigger asChild>
              <button className="ir-location-trigger" type="button" aria-label={`Show recipe location: ${recipe.category}`}>
                <span>{recipe.category}</span><ChevronDown aria-hidden="true" />
              </button>
            </SheetPrimitive.Trigger>
            <SheetPrimitive.Portal>
              <SheetPrimitive.Overlay className="ir-location-overlay" />
              <SheetPrimitive.Content className="ir-location-sheet">
                <SheetPrimitive.Title className="ir-location-title">Recipe location</SheetPrimitive.Title>
                <SheetPrimitive.Description className="ir-location-description">
                  Browse the recipe hierarchy.
                </SheetPrimitive.Description>
                <SheetPrimitive.Close className="ir-location-close" aria-label="Close recipe location">
                  <X aria-hidden="true" />
                </SheetPrimitive.Close>
                <nav aria-label="Recipe location">
                  <ol className="ir-location-list">
                    <li><SheetPrimitive.Close asChild><Link href="/recipes">Recipes</Link></SheetPrimitive.Close></li>
                    <li><SheetPrimitive.Close asChild><Link href={`/categories/${recipe.categorySlug}`}>{recipe.category}</Link></SheetPrimitive.Close></li>
                    <li aria-current="page">
                      <span>{recipe.title}</span><span className="ir-location-current">Current page</span>
                    </li>
                  </ol>
                </nav>
              </SheetPrimitive.Content>
            </SheetPrimitive.Portal>
          </SheetPrimitive.Root>
        </div>
        <h1>{recipe.title}</h1>
        <p className="ir-lede">{recipe.shortDescription}</p>
        <div className="ir-stats">
          <article className="ir-stat ir-stat-feature"><small>TIME TO BAKE</small><strong>{recipe.estimatedTime}</strong></article>
          <article className="ir-stat"><small>DIFFICULTY</small><strong>{recipe.difficulty}</strong></article>
          <article className="ir-stat"><small>LANGUAGE</small><strong>{recipe.language}</strong></article>
          <article className="ir-stat"><small>FOR</small><strong>{recipe.audience}</strong></article>
        </div>
        <div className="ir-actions">
          <button className="ir-button" type="button" onClick={onShare}><Share2 />Share link</button>
          {saveAction}
          <a className="ir-button ir-button-dark" href="#ir-ingredients">Start baking <ArrowRight /></a>
        </div>
      </header>

      <section className="ir-context ir-shell">
        <RecipeContextInputs value={recipeContext} onChange={onRecipeContextChange} />
      </section>

      <section className="ir-workspace ir-shell" aria-label="Recipe workspace">
        <section className={`ir-card ir-ingredients${attemptedCopy && missingFields.length ? " has-missing-fields" : ""}${validationPulse ? " is-validating" : ""}`} id="ir-ingredients" aria-labelledby="ir-ingredients-title">
          <div className="ir-section-head">
            <div><small>01 / INGREDIENTS</small><h2 id="ir-ingredients-title">Set the scene</h2></div>
            <span className="ir-ready-count" aria-live="polite">{readyCount}/{requiredFields.length} ready</span>
          </div>
          <div className="ir-pantry">
            <div><span>Pantry check</span><strong>{ready ? "Ready to bake" : "Add the required details"}</strong></div>
            <div className="ir-progress" role="progressbar" aria-label="Required ingredients ready" aria-valuemin={0} aria-valuemax={requiredFields.length} aria-valuenow={readyCount}>
              <span style={{ width: `${requiredFields.length ? readyCount / requiredFields.length * 100 : 100}%` }} />
            </div>
            <span className="ir-sr-only" aria-live="polite">{readyCount} of {requiredFields.length} ready</span>
          </div>
          {fields.length > 0
            ? <RecipePromptInputs fields={fields} values={values} errors={errors} onChange={onPromptValueChange} idPrefix="ir-input" nativeRequired={false} deferErrors highlightMissingFields={attemptedCopy ? missingFields.map((field) => field.name) : []} highlightCommittedFields={changedFields} onFieldCommit={commitField} />
            : <p className="ir-empty-fields">This recipe has no additional inputs. Review the prompt and copy it when ready.</p>}
        </section>

        <aside className="ir-card ir-oven" id="ir-oven" aria-labelledby="ir-oven-title">
          <div className="ir-section-head"><div><small>02 / THE OVEN</small><h2 id="ir-oven-title">Your prompt is cooking</h2></div></div>
          <div className="ir-tabs" role="tablist" aria-label="Choose an AI model">
            {models.map((item, index) => (
              <button key={item} role="tab" id={`ir-tab-${item.toLowerCase()}`}               aria-controls="ir-prompt" aria-selected={model === item} tabIndex={model === item ? 0 : -1} type="button" onClick={() => selectModel(item)} onKeyDown={(event) => {
                let next = index;
                if (event.key === "ArrowRight") next = (index + 1) % models.length;
                else if (event.key === "ArrowLeft") next = (index - 1 + models.length) % models.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = models.length - 1;
                else return;
                event.preventDefault();
                selectModel(models[next]);
                document.getElementById(`ir-tab-${models[next].toLowerCase()}`)?.focus();
              }}>{item}</button>
            ))}
          </div>
          <p className="ir-model-tip" aria-live="polite">{modelCopy[model].tip}</p>
          <div className="ir-prompt-frame">
            <div className="ir-terminal-head"><span>● ● ● &nbsp; LIVE PROMPT PREVIEW</span><span>{model.toUpperCase()}</span></div>
            <div className={`ir-prompt-stage${previewReady ? " is-ready" : ""}${validationPulse ? " is-pulsing" : ""}${transitioningModel ? " is-transitioning" : ""}${readyPop ? " has-glint" : ""}${lowPowerDevice ? " is-low-power" : ""}`} style={{ "--ir-field-count": Math.max(requiredFields.length, 1) } as CSSProperties}>
              <pre id="ir-prompt" ref={previewRef} role="tabpanel" aria-labelledby={`ir-tab-${model.toLowerCase()}`} tabIndex={0}>
                {promptLines.map((line, lineIndex) => <span
                  className={`ir-prompt-line${changedLines.includes(lineIndex) ? " is-different" : ""}${fieldsForLines[lineIndex] && changedFields.includes(fieldsForLines[lineIndex] ?? "") ? " is-field-updated" : ""}`}
                  key={`${lineIndex}-${line}`}
                  data-field={fieldsForLines[lineIndex]}
                  ref={(element) => { if (element) lineRefs.current.set(lineIndex, element); else lineRefs.current.delete(lineIndex); }}
                >{line || "\u00a0"}{"\n"}</span>)}
              </pre>
              <div className={`ir-grease-glass${previewReady ? " is-complete" : ""}`} aria-hidden="true">
                <span
                  className={`ir-glass-region${wipingField ? " is-wiping" : ""}`}
                  style={{
                    "--clear": `${requiredFields.length ? clearCount / requiredFields.length * 100 : 100}%`,
                    "--ir-fog-opacity": `${requiredFields.length ? 1 - clearCount / requiredFields.length : 0}`,
                  } as CSSProperties}
                >
                  {wipingField && <span className="ir-water-drops"><i /><i /><i /></span>}
                </span>
              </div>
            </div>
            <div className="ir-prompt-actions">
              <button type="button" onClick={handleCopy}><Copy />{copied ? "Copied" : "Copy prompt"}</button>
            </div>
          </div>
          {copyError && <p className="ir-copy-error" role="alert">Prompt could not be copied. Please try again.</p>}
          {attemptedCopy && missingFields.length > 0 && <p className="ir-copy-error" role="alert" aria-live="polite">Complete {missingFields.map((field) => field.label).join(", ")} to clear the preview and copy.</p>}
          <p className="ir-glass-progress" aria-live="polite">{readyCount} of {requiredFields.length} ready</p>
          {copied && <div className="ir-copy-next" role="status" aria-live="polite">
            <span className="ir-copy-step is-done"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>Copied</span>
            <span className="ir-copy-arrow" aria-hidden="true">→</span>
            <a className="ir-copy-open" href={modelUrls[model]} target="_blank" rel="noreferrer">Open {model}</a>
            <span className="ir-copy-arrow" aria-hidden="true">→</span>
            <span>Paste <kbd className="ir-keycap">Ctrl+V</kbd></span>
          </div>}
          <p className="ir-privacy"><ShieldCheck />Keep personal, confidential, and company-sensitive details out of prompts.</p>
        </aside>
      </section>

      {steps.length > 0 && <section className="ir-section ir-shell" id="ir-method">
        <div className="ir-heading"><small>03 / THE METHOD</small><h2>Make the workflow yours</h2><p>Follow the recipe’s steps, then review the result before using it.</p></div>
        <div className="ir-method-grid">
          <div className="ir-stages">{steps.map((step, index) => (
            <details className="ir-stage" key={`${index}-${step}`}><summary><span className="ir-stage-number">{String(index + 1).padStart(2, "0")}</span><span><strong>Step {index + 1}</strong><small>{step}</small></span><ChevronDown /></summary><p>{step}</p></details>
          ))}</div>
          <aside className="ir-step-list"><h3>Before you begin</h3><ol>
            {(recipe.requiredInputs.length ? recipe.requiredInputs : ["Review the recipe prompt", "Add any useful context", "Check the output before using it"]).map((item) => <li key={item}>{item}</li>)}
          </ol></aside>
        </div>
      </section>}

      {visualShowcase}

      {(example || recipe.exampleOutput) && <section className="ir-section ir-shell">
        <article className="ir-card ir-example">
          <div className="ir-example-top"><div><small>EXAMPLE</small><h2>{example?.scenario || "See an example output"}</h2></div><span>RECIPE EXAMPLE · NOT LIVE DATA</span></div>
          {example?.input && <><h3>Example input</h3><p>{example.input}</p></>}
          {example?.output || recipe.exampleOutput ? <blockquote>{example?.output || recipe.exampleOutput}</blockquote> : null}
          {example?.whyItWorks?.length ? <ul>{example.whyItWorks.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        </article>
      </section>}

      {refinements.length > 0 && <section className="ir-section ir-shell">
        <div className="ir-heading"><small>04 / REFINE</small><h2>Refine the result</h2></div>
        <div className="ir-refinements">{refinements.slice(0, 6).map((text, index) => (
          <button className="ir-refinement" key={`${index}-${text}`} type="button" onClick={() => onRefinementSelect(text, index)}><small>{titleForRefinement(text, index)}</small><span>{text}</span></button>
        ))}</div>
      </section>}

      {troubleshooting.length > 0 && <section className="ir-section ir-shell">
        <div className="ir-heading"><small>05 / TROUBLESHOOTING</small><h2>Need to adjust the recipe?</h2></div>
        <div className="ir-troubleshooting">
          {troubleshooting.slice(0, 6).map((item, index) => <details key={`${index}-${item}`}><summary>{item.split(/[.!?]/, 1)[0] || `Tip ${index + 1}`}<ChevronDown /></summary><p>{item}</p></details>)}
        </div>
      </section>}

      <section className="ir-section ir-shell">
        <div className="ir-heading"><small>06 / REVIEW</small><h2>Review before you use it</h2></div>
        <div className="ir-card ir-review">
          {checklistItems.map((item, index) => (
            <label key={`${index}-${item}`} className="ir-check-item"><input type="checkbox" checked={checked[index] ?? false} onChange={(event) => setChecked((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.checked : value))} /><span><Check /></span>{item}</label>
          ))}
          <div className="ir-review-count" aria-live="polite">{completedChecklist}/{checklistItems.length} checked <span>Review the output before relying on it.</span></div>
        </div>
      </section>

      {related.length > 0 && <section className="ir-section ir-shell">
        <div className="ir-heading"><small>07 / EXPLORE NEXT</small><h2>Related recipes</h2></div>
        <div className="ir-related">
          {related.slice(0, 3).map((item) => <Link className="ir-related-card" href={`/recipes/${item.slug}`} key={item.id}><small>{item.category}</small><strong>{item.title}</strong><p>{item.shortDescription}</p><span>Explore recipe <ArrowRight /></span></Link>)}
        </div>
      </section>}

      {showMobilePreviewHint && !copied && <button className="ir-see-preview" type="button" onClick={() => {
        document.getElementById("ir-oven")?.scrollIntoView({ behavior: "smooth", block: "center" });
        setShowMobilePreviewHint(false);
      }}>See your prompt <ArrowRight /></button>}
      <button className={`ir-floating-copy${ready ? " is-ready" : ""}${readyPop ? " is-popping" : ""}${copied ? " is-copied" : ""}${attemptedCopy && missingFields.length ? " has-missing" : ""}`} type="button" onClick={handleCopy} aria-label={canCopy ? (copied ? "Prompt copied" : "Copy prompt") : `Complete ${missingFields.map((field) => field.label).join(", ")} before copying`}>
        {ready ? <Copy /> : <RotateCcw />}{ready ? copied ? "Copied" : "Copy prompt" : "Complete fields"}
        {copied && <span className="ir-steam-puff" aria-hidden="true"><i /><i /><i /></span>}
      </button>
    </div>
  );
}
