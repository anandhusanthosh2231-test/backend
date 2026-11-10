import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
  const [model, setModel] = useState<Model>("Claude");
  const [checked, setChecked] = useState<boolean[]>([]);
  const checklistItems = useMemo(() => getChecklist(recipe), [recipe]);
  const requiredFields = fields.filter((field) => field.required);
  const readyCount = requiredFields.filter((field) => isFieldReady(field, values)).length;
  const ready = readyCount === requiredFields.length;
  const canCopy = ready && Object.keys(errors).length === 0;
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

  useEffect(() => {
    setChecked(checklistItems.map(() => false));
  }, [checklistItems]);

  return (
    <div className="individual-recipe-page">
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
        <section className="ir-card ir-ingredients" id="ir-ingredients" aria-labelledby="ir-ingredients-title">
          <div className="ir-section-head">
            <div><small>01 / INGREDIENTS</small><h2 id="ir-ingredients-title">Set the scene</h2></div>
            <span className="ir-ready-count" aria-live="polite">{readyCount}/{requiredFields.length} ready</span>
          </div>
          <div className="ir-pantry">
            <div><span>Pantry check</span><strong>{ready ? "Ready to bake" : "Add the required details"}</strong></div>
            <div className="ir-progress" role="progressbar" aria-label="Required ingredients ready" aria-valuemin={0} aria-valuemax={requiredFields.length} aria-valuenow={readyCount}>
              <span style={{ width: `${requiredFields.length ? readyCount / requiredFields.length * 100 : 100}%` }} />
            </div>
          </div>
          {fields.length > 0
            ? <RecipePromptInputs fields={fields} values={values} errors={errors} onChange={onPromptValueChange} idPrefix="ir-input" nativeRequired={false} deferErrors />
            : <p className="ir-empty-fields">This recipe has no additional inputs. Review the prompt and copy it when ready.</p>}
        </section>

        <aside className="ir-card ir-oven" aria-labelledby="ir-oven-title">
          <div className="ir-section-head"><div><small>02 / THE OVEN</small><h2 id="ir-oven-title">Your prompt is cooking</h2></div></div>
          <div className="ir-tabs" role="tablist" aria-label="Choose an AI model">
            {models.map((item, index) => (
              <button key={item} role="tab" id={`ir-tab-${item.toLowerCase()}`} aria-controls="ir-prompt" aria-selected={model === item} tabIndex={model === item ? 0 : -1} type="button" onClick={() => setModel(item)} onKeyDown={(event) => {
                let next = index;
                if (event.key === "ArrowRight") next = (index + 1) % models.length;
                else if (event.key === "ArrowLeft") next = (index - 1 + models.length) % models.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = models.length - 1;
                else return;
                event.preventDefault();
                setModel(models[next]);
                document.getElementById(`ir-tab-${models[next].toLowerCase()}`)?.focus();
              }}>{item}</button>
            ))}
          </div>
          <p className="ir-model-tip" aria-live="polite">{modelCopy[model].tip}</p>
          <div className="ir-prompt-frame">
            <div className="ir-terminal-head"><span>● ● ● &nbsp; LIVE PROMPT PREVIEW</span><span>{model.toUpperCase()}</span></div>
            <pre id="ir-prompt" role="tabpanel" aria-labelledby={`ir-tab-${model.toLowerCase()}`} tabIndex={0}>{prompt || recipe.prompt}</pre>
            <div className="ir-prompt-actions">
              <button type="button" disabled={!canCopy} onClick={copyPrompt}><Copy />{copied ? "Copied" : "Copy prompt"}</button>
            </div>
          </div>
          {copyError && <p className="ir-copy-error" role="alert">Prompt could not be copied. Please try again.</p>}
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

      <button className={`ir-floating-copy${copied ? " is-copied" : ""}`} type="button" disabled={!canCopy} onClick={copyPrompt} aria-label={canCopy ? "Copy prompt" : "Complete valid required ingredients before copying"}>
        {ready ? <Copy /> : <RotateCcw />}{ready ? copied ? "Copied" : "Copy prompt" : "Add ingredients"}
      </button>
    </div>
  );
}
