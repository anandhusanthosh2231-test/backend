import type { RecipeGuidePromptVariablesItem } from "@workspace/api-client-react";
import type { ReactNode } from "react";
import { validateRecipeInputValue } from "@/lib/recipe-prompt";

export function RecipePromptInputs({
  fields,
  values,
  onChange,
  errors = {},
  idPrefix = "recipe-input",
  nativeRequired = true,
}: {
  fields: RecipeGuidePromptVariablesItem[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  errors?: Record<string, string>;
  idPrefix?: string;
  nativeRequired?: boolean;
}) {
  return <div className="prompt-variable-form">
    {fields.map((field, index) => {
      const id = `${idPrefix}-${index}`;
      const error = errors[field.name];
      const value = values[field.name] ?? field.defaultValue ?? "";
      const commonProps = {
        id,
        required: nativeRequired && (field.required ?? false),
        placeholder: field.placeholder || `Enter ${field.label.toLowerCase()}`,
        "aria-invalid": Boolean(error),
        "aria-describedby": [field.helpText ? `${id}-help` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined,
      };
      let control: ReactNode;
      switch (field.type ?? "text") {
        case "textarea":
          control = <textarea {...commonProps} value={value} onChange={(event) => onChange(field.name, event.target.value)} rows={3} minLength={field.validation?.minLength} maxLength={field.validation?.maxLength} />;
          break;
        case "dropdown":
        case "select":
          control = <select {...commonProps} value={value} onChange={(event) => onChange(field.name, event.target.value)}>
            <option value="">Choose an option</option>
            {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
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
          control = <input {...commonProps} type={field.type === "url" || field.type === "date" ? field.type : "text"} value={value} pattern={field.validation?.pattern} minLength={field.validation?.minLength} maxLength={field.validation?.maxLength} onChange={(event) => onChange(field.name, event.target.value)} />;
      }
      return <label key={field.name} htmlFor={id}>
        <span className="prompt-input-label">{field.label}{field.required && <span className="required-mark">Required</span>}{!field.required && <span className="optional-mark">Optional</span>}</span>
        {control}
        {field.helpText && <small id={`${id}-help`}>{field.helpText}</small>}
        {field.type === "file" && !field.helpText && <small id={`${id}-help`}>The selected file name is added to the prompt; the file is not uploaded.</small>}
        {error && <small id={`${id}-error`} className="form-error">{error}</small>}
      </label>;
    })}
  </div>;
}
