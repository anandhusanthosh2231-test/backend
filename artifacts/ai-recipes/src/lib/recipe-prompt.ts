import type { RecipeGuidePromptVariablesItem } from "@workspace/api-client-react";
import { getRecipePromptFieldPresentation } from "@/lib/recipe-prompt-presentation";

export function getRecipePromptFields(
  prompt: string,
  declaredFields: RecipeGuidePromptVariablesItem[],
): RecipeGuidePromptVariablesItem[] {
  if (declaredFields.length) {
    return declaredFields.map((field) => ({
      ...field,
      name: field.name.trim().replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, ""),
    }));
  }

  return [...prompt.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map((match) => {
    const name = match[1] ?? "";
    return {
      name,
      label: name.replace(/[_-]+/g, " ").toLowerCase(),
    };
  });
}

export function validateRecipeInputValue(
  field: RecipeGuidePromptVariablesItem,
  value: string,
): string | undefined {
  const presentation = getRecipePromptFieldPresentation(field);
  const inputType = presentation.type ?? field.type;
  const required = field.required === true;
  const label = presentation.label;
  const isChecked = inputType === "checkbox" && value === "true";
  if (required && (inputType === "checkbox" ? !isChecked : !value.trim())) {
    return `${label} is required.`;
  }
  if (!value) return undefined;

  const rules = field.validation;
  if (rules?.minLength !== undefined && value.length < rules.minLength) {
    return `Enter at least ${rules.minLength} characters.`;
  }
  if (rules?.maxLength !== undefined && value.length > rules.maxLength) {
    return `Enter no more than ${rules.maxLength} characters.`;
  }
  if (inputType === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) return "Enter a valid number.";
    if (rules?.minimum !== undefined && number < rules.minimum) return `Enter a number of at least ${rules.minimum}.`;
    if (rules?.maximum !== undefined && number > rules.maximum) return `Enter a number no greater than ${rules.maximum}.`;
  }
  if (inputType === "url") {
    try {
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol)) return "Enter a valid HTTP or HTTPS URL.";
    } catch {
      return "Enter a valid URL.";
    }
  }
  if (inputType === "date" && Number.isNaN(Date.parse(value))) return "Enter a valid date.";
  if ((inputType === "dropdown" || inputType === "select") && !presentation.options?.includes(value)) return "Choose one of the listed options.";
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
  let omittedOptionalLine = false;
  const resolved = fields.reduce((current, field) => {
    const escapedName = field.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const token = new RegExp(`\\{\\{\\s*${escapedName}\\s*\\}\\}`, "g");
    const value = Object.prototype.hasOwnProperty.call(values, field.name)
      ? values[field.name] ?? ""
      : field.defaultValue ?? "";
    if (!value.trim() && field.required !== true) {
      const standaloneLine = new RegExp(
        `(^|\\n)[\\t ]*(?:[^:\\r\\n]+:\\s*)?\\{\\{\\s*${escapedName}\\s*\\}\\}[\\t ]*[.,;:]?[\\t ]*(?=\\r?\\n|$)`,
        "g",
      );
      const next = current.replace(standaloneLine, (_match, lineStart: string) => {
        omittedOptionalLine = true;
        return lineStart;
      });
      if (next !== current) return next;
    }
    return current.replace(token, () => value.trim() ? value : "not specified");
  }, prompt);

  return omittedOptionalLine
    ? resolved.replace(/(?:\r?\n)[\t ]*(?:\r?\n[\t ]*){2,}/g, "\n\n").trim()
    : resolved;
}
