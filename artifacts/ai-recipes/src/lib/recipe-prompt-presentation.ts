import type {
  RecipeGuidePromptVariablesItem,
  RecipeGuidePromptVariablesItemType,
} from "@workspace/api-client-react";

type PromptFieldPresentation = Pick<
  RecipeGuidePromptVariablesItem,
  "label" | "placeholder" | "helpText"
> & {
  type?: RecipeGuidePromptVariablesItemType;
};

const fieldPresentations: Record<string, PromptFieldPresentation> = {
  book: {
    label: "Book title and author",
    placeholder: "Add the title and author",
  },
  group: {
    label: "Who is joining the discussion?",
    placeholder: "Describe who will be taking part",
  },
  spoiler_level: {
    label: "How much of the book can we discuss?",
    placeholder: "For example, spoilers through chapter 8 are okay",
  },
  discussion_length: {
    label: "How long is your meeting?",
    placeholder: "For example, 45 minutes",
  },
  focus: {
    label: "What would you like to explore?",
    placeholder: "For example, themes, characters, or favorite moments",
  },
  reading_stage: {
    label: "How far has everyone read?",
    placeholder: "For example, through chapter 8",
  },
  tone: {
    label: "Tone",
    placeholder: "For example, warm and curious",
  },
};

const longTextName = /(?:context|description|details|notes|brief|transcript|resume|curriculum|source|content|message|material|document|text)/i;

function normalizeFieldName(value: string): string {
  return value
    .trim()
    .replace(/^\{\{\s*/, "")
    .replace(/\s*\}\}$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function readableFieldName(value: string): string {
  return normalizeFieldName(value)
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function getRecipePromptFieldPresentation(
  field: RecipeGuidePromptVariablesItem,
): RecipeGuidePromptVariablesItem {
  const name = typeof field.name === "string" ? field.name : "";
  const sourceLabel = typeof field.label === "string" ? field.label.trim() : "";
  const sourcePlaceholder = typeof field.placeholder === "string" ? field.placeholder.trim() : "";
  const sourceHelpText = typeof field.helpText === "string" ? field.helpText.trim() : "";
  const options = Array.isArray(field.options)
    ? field.options.filter((option): option is string => typeof option === "string")
    : [];
  const configured = fieldPresentations[normalizeFieldName(name).replace(/\s+/g, "_")];
  const rawLabel = !sourceLabel
    || normalizeFieldName(sourceLabel) === normalizeFieldName(name);
  const label = rawLabel
    ? configured?.label ?? readableFieldName(name)
    : sourceLabel;
  const type = field.type
    ?? (longTextName.test(name) ? "textarea" : "text");

  return {
    ...field,
    label,
    placeholder: sourcePlaceholder
      || (rawLabel ? configured?.placeholder : undefined)
      || `Add ${label.toLowerCase()}`,
    helpText: sourceHelpText
      || (rawLabel ? configured?.helpText : undefined),
    options,
    type:
      (type === "select" || type === "dropdown") && !options.length
        ? "text"
        : type,
  };
}
