import type { RecipeContext } from "@/lib/recipe-context";
import { languageSuggestions } from "@/lib/language-suggestions";
import { Sparkles } from "lucide-react";
import "./recipe-context-inputs.css";

export function RecipeContextInputs({
  value,
  onChange,
}: {
  value: RecipeContext;
  onChange: (value: RecipeContext) => void;
}) {
  const update = (key: keyof RecipeContext, nextValue: string) => {
    onChange({ ...value, [key]: nextValue });
  };

  return (
    <section className="recipe-context-inputs" aria-labelledby="recipe-context-title">
      <div className="recipe-context-heading">
        <div className="recipe-context-heading-copy">
          <span className="recipe-context-icon" aria-hidden="true"><Sparkles size={16} /></span>
          <div>
            <span className="kicker">Make this recipe yours</span>
            <h3 id="recipe-context-title">Set your context</h3>
          </div>
        </div>
        <span className="recipe-context-prompt-badge">Added to your prompt</span>
      </div>
      <div className="recipe-context-fields">
        <label>
          <span>Main topic</span>
          <input
            type="text"
            value={value.mainTopic}
            onChange={(event) => update("mainTopic", event.target.value)}
            placeholder="What do you want to work on?"
            autoComplete="off"
          />
        </label>
        <label className="recipe-context-field--wide">
          <span>Context</span>
          <textarea
            value={value.context}
            onChange={(event) => update("context", event.target.value)}
            placeholder="Your situation, timeline, or constraints"
            rows={2}
          />
        </label>
        <label>
          <span>Target audience</span>
          <input
            type="text"
            value={value.targetAudience}
            onChange={(event) => update("targetAudience", event.target.value)}
            placeholder="Who is this for?"
            autoComplete="off"
          />
        </label>
        <div className="recipe-context-language-field">
          <label htmlFor="recipe-context-language">
            <span>Language &amp; tone</span>
            <input
              id="recipe-context-language"
              type="text"
              value={value.tone}
              onChange={(event) => update("tone", event.target.value)}
              placeholder="Choose a suggestion or enter any language"
              autoComplete="off"
            />
          </label>
          <div className="language-suggestion-list" aria-label="Suggested languages and styles">
            {languageSuggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion}
                aria-pressed={value.tone === suggestion}
                onClick={() => update("tone", suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
