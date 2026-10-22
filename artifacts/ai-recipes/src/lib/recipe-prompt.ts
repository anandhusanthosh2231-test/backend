import type { RecipeGuidePromptVariablesItem } from "@workspace/api-client-react";

export function validateRecipeInputValue(
  field: RecipeGuidePromptVariablesItem,
  value: string,
): string | undefined {
  const required = field.required === true;
  const isChecked = field.type === "checkbox" && value === "true";
  if (required && (field.type === "checkbox" ? !isChecked : !value.trim())) {
    return `${field.label} is required.`;
  }
  if (!value) return undefined;

  const rules = field.validation;
  if (rules?.minLength !== undefined && value.length < rules.minLength) {
    return `Enter at least ${rules.minLength} characters.`;
  }
  if (rules?.maxLength !== undefined && value.length > rules.maxLength) {
    return `Enter no more than ${rules.maxLength} characters.`;
  }
  if (field.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) return "Enter a valid number.";
    if (rules?.minimum !== undefined && number < rules.minimum) return `Enter a number of at least ${rules.minimum}.`;
    if (rules?.maximum !== undefined && number > rules.maximum) return `Enter a number no greater than ${rules.maximum}.`;
  }
  if (field.type === "url") {
    try {
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol)) return "Enter a valid HTTP or HTTPS URL.";
    } catch {
      return "Enter a valid URL.";
    }
  }
  if (field.type === "date" && Number.isNaN(Date.parse(value))) return "Enter a valid date.";
  if ((field.type === "dropdown" || field.type === "select") && !field.options?.includes(value)) return "Choose one of the listed options.";
  if (rules?.pattern) {
    try {
      if (!new RegExp(rules.pattern).test(value)) return "The value does not match the required format.";
    } catch {
      return "This input has an invalid validation rule.";
    }
  }
  return undefined;
}

export function getRecipePromptInputErrors(
  fields: RecipeGuidePromptVariablesItem[],
  values: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(fields.flatMap((field) => {
    const value = values[field.name] ?? field.defaultValue ?? "";
    const error = validateRecipeInputValue(field, value);
    return error ? [[field.name, error]] : [];
  }));
}

export function resolveRecipePrompt(
  prompt: string,
  fields: RecipeGuidePromptVariablesItem[],
  values: Record<string, string>,
): string {
  return fields.reduce((resolved, field) => {
    const escapedName = field.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const token = new RegExp(`\\{\\{\\s*${escapedName}\\s*\\}\\}`, "g");
    const value = Object.prototype.hasOwnProperty.call(values, field.name)
      ? values[field.name] ?? ""
      : field.defaultValue ?? "";
    return resolved.replace(token, () => value);
  }, prompt);
}
