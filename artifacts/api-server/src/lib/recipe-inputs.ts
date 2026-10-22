import { z } from "zod/v4";

const inputValidationSchema = z.object({
  minLength: z.number().int().min(0).max(10_000).optional(),
  maxLength: z.number().int().min(1).max(10_000).optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  pattern: z.string().max(500).optional(),
}).strict();

export const recipePromptVariableSchema = z.object({
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,99}$/),
  label: z.string().trim().min(1).max(200),
  placeholder: z.string().max(500).optional(),
  required: z.boolean().optional(),
  type: z.enum(["text", "textarea", "number", "url", "date", "select", "dropdown", "checkbox", "file"]).optional(),
  helpText: z.string().max(1000).optional(),
  defaultValue: z.string().max(10_000).optional(),
  options: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
  validation: inputValidationSchema.optional(),
}).strict().superRefine((input, context) => {
  if ((input.type === "dropdown" || input.type === "select") && !input.options?.length) {
    context.addIssue({ code: "custom", path: ["options"], message: "Select inputs need at least one option." });
  }
  if (input.type !== "dropdown" && input.type !== "select" && input.options?.length) {
    context.addIssue({ code: "custom", path: ["options"], message: "Options are only supported for select inputs." });
  }
  if (input.validation?.minLength !== undefined && input.validation.maxLength !== undefined
    && input.validation.minLength > input.validation.maxLength) {
    context.addIssue({ code: "custom", path: ["validation"], message: "Minimum length cannot exceed maximum length." });
  }
  if (input.validation?.minimum !== undefined && input.validation.maximum !== undefined
    && input.validation.minimum > input.validation.maximum) {
    context.addIssue({ code: "custom", path: ["validation"], message: "Minimum value cannot exceed maximum value." });
  }
  if (input.validation?.pattern) {
    try {
      new RegExp(input.validation.pattern);
    } catch {
      context.addIssue({ code: "custom", path: ["validation", "pattern"], message: "Pattern must be a valid regular expression." });
    }
  }
  if (input.defaultValue !== undefined) {
    const value = input.defaultValue;
    if ((input.type === "dropdown" || input.type === "select") && !input.options?.includes(value)) {
        context.addIssue({
          code: "custom",
          path: ["defaultValue"],
          message: input.type === "dropdown"
            ? "Default value must match one of the dropdown options."
            : "Default value must match one of the select options.",
        });
    }
    if (input.type === "number" && value.trim()) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        context.addIssue({ code: "custom", path: ["defaultValue"], message: "Default value must be a valid number." });
      } else {
        if (input.validation?.minimum !== undefined && number < input.validation.minimum) {
          context.addIssue({ code: "custom", path: ["defaultValue"], message: "Default number is below the minimum value." });
        }
        if (input.validation?.maximum !== undefined && number > input.validation.maximum) {
          context.addIssue({ code: "custom", path: ["defaultValue"], message: "Default number exceeds the maximum value." });
        }
      }
    }
    if (input.validation?.pattern) {
      try {
        if (!new RegExp(input.validation.pattern).test(value)) {
          context.addIssue({ code: "custom", path: ["defaultValue"], message: "Default value does not match the validation pattern." });
        }
      } catch {
        // The invalid pattern issue is reported on the validation.pattern path.
      }
    }
  }
});

const outputConfigSchema = z.object({
  version: z.literal(1),
  format: z.enum(["text", "list", "table", "json", "steps"]),
  description: z.string().max(2000).optional(),
  fields: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
}).strict();

const customContentSchema = z.object({
  troubleshooting: z.array(z.string().trim().min(1).max(2_000)).max(100).optional(),
  verificationChecklist: z.array(z.string().trim().min(1).max(2_000)).max(100).optional(),
  workflowDiagram: z.string().max(20_000).optional(),
  images: z.array(z.object({
    url: z.string().url().max(2_048),
    alt: z.string().trim().min(1).max(500),
    caption: z.string().max(500).optional(),
  }).strict()).max(20).optional(),
}).strict();

export function validateRecipePromptConfiguration(guide: unknown, prompt: string): string | undefined {
  if (!guide || typeof guide !== "object" || Array.isArray(guide)) return undefined;
  const record = guide as Record<string, unknown>;
  const variables = record.promptVariables;
  const errors: string[] = [];

  if (variables !== undefined) {
    if (!Array.isArray(variables) || variables.length > 100) {
      errors.push("Prompt inputs must be an array with no more than 100 entries.");
    } else {
      const names = new Set<string>();
      for (const [index, value] of variables.entries()) {
        const parsed = recipePromptVariableSchema.safeParse(value);
        if (!parsed.success) {
          errors.push(...parsed.error.issues.map((issue) => `promptVariables.${index}.${issue.path.join(".")}: ${issue.message}`));
          continue;
        }
        if (names.has(parsed.data.name)) errors.push(`Prompt input name "${parsed.data.name}" is duplicated.`);
        names.add(parsed.data.name);
      }

      if (variables.length) {
        for (const [, name] of prompt.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
          if (name && !names.has(name)) errors.push(`Prompt variable "{{${name}}}" has no matching input definition.`);
        }
      }
    }
  }

  if (record.outputConfig !== undefined && record.outputConfig !== null) {
    const parsed = outputConfigSchema.safeParse(record.outputConfig);
    if (!parsed.success) {
      errors.push(...parsed.error.issues.map((issue) => `outputConfig.${issue.path.join(".")}: ${issue.message}`));
    }
  }

  if (record.customContent !== undefined && record.customContent !== null) {
    const parsed = customContentSchema.safeParse(record.customContent);
    if (!parsed.success) {
      errors.push(...parsed.error.issues.map((issue) => `customContent.${issue.path.join(".")}: ${issue.message}`));
    } else {
      for (const [index, image] of (parsed.data.images ?? []).entries()) {
        if (!["http:", "https:"].includes(new URL(image.url).protocol)) {
          errors.push(`customContent.images.${index}.url must use HTTP or HTTPS.`);
        }
      }
    }
  }

  return errors.length ? errors.join("; ") : undefined;
}

export function promptVariableNames(guide: unknown): Set<string> {
  if (!guide || typeof guide !== "object" || Array.isArray(guide)) return new Set();
  const variables = (guide as Record<string, unknown>).promptVariables;
  if (!Array.isArray(variables)) return new Set();
  return new Set(variables.flatMap((value) =>
    value && typeof value === "object" && typeof (value as Record<string, unknown>).name === "string"
      ? [(value as Record<string, string>).name]
      : [],
  ));
}
