import type { RecipeGuidePromptVariablesItem } from "@workspace/api-client-react";
import type { ReactNode } from "react";
import { validateRecipeInputValue } from "@/lib/recipe-prompt";
import { getRecipePromptFieldPresentation } from "@/lib/recipe-prompt-presentation";

export function RecipePromptInputs({
  fields,
  values,
  onChange,
  errors = {},
  idPrefix = "recipe-input",
  nativeRequired = true,
  allowReset = true,
}: {
  fields: RecipeGuidePromptVariablesItem[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  errors?: Record<string, string>;
  idPrefix?: string;
  nativeRequired?: boolean;
  allowReset?: boolean;
}) {
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
      const value = values[field.name] ?? field.defaultValue ?? "";
      const commonProps = {
        id,
        required: nativeRequired && (field.required ?? false),
        placeholder: presentation.placeholder,
        "aria-invalid": Boolean(error),
        "aria-describedby": [presentation.helpText ? `${id}-help` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined,
      };
      let control: ReactNode;
      switch (presentation.type ?? "text") {
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
      return <label key={field.name} htmlFor={id}>
        <span className="prompt-input-label">{presentation.label}{field.required === true && <span className="required-mark">Required</span>}{field.required === false && <span className="optional-mark">Optional</span>}</span>
        {control}
        {presentation.helpText && <small id={`${id}-help`}>{presentation.helpText}</small>}
        {presentation.type === "file" && !presentation.helpText && <small id={`${id}-help`}>The selected file name is added to the prompt; the file is not uploaded.</small>}
        {error && <small id={`${id}-error`} className="form-error">{error}</small>}
      </label>;
    })}
    </div>
  </div>;
}
