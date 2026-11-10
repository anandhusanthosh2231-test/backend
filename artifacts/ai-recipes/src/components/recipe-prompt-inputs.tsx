import { useState } from "react";
import type { RecipeGuidePromptVariablesItem } from "@workspace/api-client-react";
import type { ReactNode } from "react";
import { validateRecipeInputValue } from "@/lib/recipe-prompt";
import { getRecipePromptFieldPresentation } from "@/lib/recipe-prompt-presentation";
import { languageSuggestions } from "@/lib/language-suggestions";

export function RecipePromptInputs({
  fields,
  values,
  onChange,
  errors = {},
  idPrefix = "recipe-input",
  nativeRequired = true,
  allowReset = true,
  deferErrors = false,
  highlightMissingFields = [],
  highlightCommittedFields = [],
  onFieldCommit,
}: {
  fields: RecipeGuidePromptVariablesItem[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  errors?: Record<string, string>;
  idPrefix?: string;
  nativeRequired?: boolean;
  allowReset?: boolean;
  deferErrors?: boolean;
  highlightMissingFields?: string[];
  highlightCommittedFields?: string[];
  onFieldCommit?: (name: string) => void;
}) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const hasChanges = fields.some((field) =>
    (values[field.name] ?? field.defaultValue ?? "") !== (field.defaultValue ?? ""),
  );
  const resetInputs = () => {
    const hasEnteredContent = fields.some((field) => {
      const currentValue = values[field.name] ?? field.defaultValue ?? "";
      return currentValue !== (field.defaultValue ?? "") && currentValue.trim().length > 0;
    });
    if (
      hasEnteredContent
      && !window.confirm("Reset your inputs to this recipe's original defaults? Your changes will be cleared.")
    ) return;
    fields.forEach((field) => onChange(field.name, field.defaultValue ?? ""));
  };

  return <div className="prompt-inputs">
    {allowReset && fields.length > 0 && <div className="prompt-inputs-toolbar">
      <span>Personalize the prompt</span>
      <button type="button" className="prompt-inputs-reset" onClick={resetInputs} disabled={!hasChanges}>Reset inputs</button>
    </div>}
    <div className="prompt-variable-form">
    {fields.map((field, index) => {
      const presentation = getRecipePromptFieldPresentation(field);
      const id = `${idPrefix}-${index}`;
      const error = errors[field.name];
      const visibleError = deferErrors && !touched[field.name] ? undefined : error;
      const missingClass = highlightMissingFields.includes(field.name) ? " is-missing-required" : "";
      const committedClass = highlightCommittedFields.includes(field.name) ? " is-committing" : "";
      const value = values[field.name] ?? field.defaultValue ?? "";
      const isLanguageField = /\b(language|locale|dialect)\b/i.test(`${field.name} ${presentation.label}`);
      const commonProps = {
        id,
        required: nativeRequired && (field.required ?? false),
        placeholder: presentation.placeholder,
        "aria-invalid": Boolean(visibleError),
        "aria-describedby": [
          presentation.helpText ? `${id}-help` : "",
          visibleError ? `${id}-error` : "",
        ].filter(Boolean).join(" ") || undefined,
        onBlur: () => {
          setTouched((current) => ({ ...current, [field.name]: true }));
          onFieldCommit?.(field.name);
        },
      };
      let control: ReactNode;
      switch (isLanguageField ? "text" : presentation.type ?? "text") {
        case "textarea":
          control = <textarea {...commonProps} value={value} onChange={(event) => onChange(field.name, event.target.value)} rows={3} minLength={field.validation?.minLength} maxLength={field.validation?.maxLength} />;
          break;
        case "dropdown":
        case "select":
          control = <select {...commonProps} value={value} onChange={(event) => onChange(field.name, event.target.value)}>
            <option value="">Choose an option</option>
            {(presentation.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
          </select>;
          break;
        case "checkbox":
          control = <input {...commonProps} type="checkbox" checked={value === "true"} onChange={(event) => onChange(field.name, String(event.target.checked))} />;
          break;
        case "file":
          control = <input {...commonProps} type="file" onChange={(event) => onChange(field.name, event.target.files?.[0]?.name ?? "")} />;
          break;
        case "number":
          control = <input {...commonProps} type="number" value={value} min={field.validation?.minimum} max={field.validation?.maximum} onChange={(event) => onChange(field.name, event.target.value)} />;
          break;
        case "url":
        case "date":
        case "text":
        default:
          control = <input {...commonProps} type={presentation.type === "url" || presentation.type === "date" ? presentation.type : "text"} value={value} pattern={field.validation?.pattern} minLength={field.validation?.minLength} maxLength={field.validation?.maxLength} onChange={(event) => onChange(field.name, event.target.value)} />;
      }
      const fieldLabel = <span className="prompt-input-label">{presentation.label}{field.required === true && <span className="required-mark">Required</span>}{field.required === false && <span className="optional-mark">Optional</span>}</span>;
      const fieldHelp = presentation.helpText && <small id={`${id}-help`}>{presentation.helpText}</small>;
      const fileHelp = presentation.type === "file" && !presentation.helpText && <small id={`${id}-help`}>The selected file name is added to the prompt; the file is not uploaded.</small>;
      const fieldError = visibleError && <small id={`${id}-error`} className="form-error">{visibleError}</small>;

      if (isLanguageField) {
        return <div key={field.name} className={`prompt-language-field${field.required === false ? " prompt-language-field--optional" : ""}${missingClass}${committedClass}`}>
          <label htmlFor={id}>{fieldLabel}</label>
          {control}
          <div id={`${id}-suggestions`} className="language-suggestion-list" aria-label={`Suggested languages for ${presentation.label}`}>
            {languageSuggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion}
                aria-pressed={value === suggestion}
                onClick={() => onChange(field.name, suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
          {fieldHelp}
          {fieldError}
        </div>;
      }

      return <label key={field.name} htmlFor={id} className={`${missingClass}${committedClass}`.trim()}>
        {fieldLabel}
        {control}
        {fieldHelp}
        {fileHelp}
        {fieldError}
      </label>;
    })}
    </div>
  </div>;
}
