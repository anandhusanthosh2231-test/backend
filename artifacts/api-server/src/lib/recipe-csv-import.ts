import { parse } from "csv-parse/sync";

export type RecipeCsvRecord = Record<string, string>;

export function normalizeRecipeCsvHeader(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function parseRecipeCsv(csv: string): RecipeCsvRecord[] {
  const records = parse(csv, {
    bom: true,
    columns: (headers: string[]) => {
      const normalized = headers.map(normalizeRecipeCsvHeader);
      if (new Set(normalized).size !== normalized.length) {
        throw new Error("CSV headers must be unique after normalization.");
      }
      if (!normalized.some((header) => ["recipe title", "title"].includes(header))
        || !normalized.some((header) => ["url slug", "slug"].includes(header))) {
        throw new Error('CSV headers must include "Recipe Title" and "URL Slug".');
      }
      return normalized;
    },
    skip_empty_lines: true,
    trim: true,
  }) as RecipeCsvRecord[];

  const dataRecords = records.filter((record) =>
    normalizeRecipeCsvHeader(record["recipe title"] ?? record.title ?? "") !== "recipe title",
  );

  if (!dataRecords.length) {
    throw new Error("The CSV must contain at least one recipe row.");
  }

  return dataRecords;
}

function getCell(record: RecipeCsvRecord, ...headers: string[]): string {
  for (const header of headers) {
    const value = record[normalizeRecipeCsvHeader(header)];
    if (value?.trim()) return value.trim();
  }
  return "";
}

function splitList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(String).map((item) => item.trim()).filter(Boolean);
      }
    } catch {
      // Treat malformed JSON as a delimited list below.
    }
  }

  return trimmed.split(/(?:,|;|\||\r?\n)+/).map((item) => item.trim()).filter(Boolean);
}

export function splitRecipeCsvAudiences(value: string): string[] {
  const seen = new Set<string>();
  return splitList(value).flatMap((name) => {
    const normalized = name.replace(/\s+/g, " ").trim();
    const key = normalizeRecipeCsvHeader(normalized);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

export function recipeTaxonomySlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createRecipeTaxonomyCandidate(name: string) {
  const displayName = name.charAt(0).toLocaleUpperCase() + name.slice(1);
  const insertValue = {
    name: displayName,
    slug: recipeTaxonomySlug(name),
    description: `AI recipes for ${displayName}.`,
  };
  return {
    lookup: { id: 1, ...insertValue },
    insert: insertValue,
  };
}

export function findRecipeTaxonomy<T extends { name: string; slug: string }>(
  items: T[],
  name: string,
): T | undefined {
  const key = normalizeRecipeCsvHeader(name);
  const slugKey = normalizeRecipeCsvHeader(recipeTaxonomySlug(name));
  return items.find((item) =>
    normalizeRecipeCsvHeader(item.name) === key || normalizeRecipeCsvHeader(item.slug) === key,
  ) ?? items.find((item) => normalizeRecipeCsvHeader(item.slug) === slugKey);
}

function parseObjectArray(value: string): unknown[] | undefined {
  if (!value.trim().startsWith("[")) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parseJsonCell<T>(record: RecipeCsvRecord, header: string): T | undefined {
  const value = getCell(record, header);
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${header} must contain valid JSON.`);
  }
}

function parseInputDefinitions(value: unknown, required: boolean, header: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new Error(`${header} must be a JSON array.`);
  return value.map((item, index) => {
    if (typeof item === "string" && item.trim()) {
      return { name: normalizePromptVariableName(item), label: item.trim(), required };
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${header}[${index}] must be an input object.`);
    }
    const input = item as Record<string, unknown>;
    const name = normalizePromptVariableName(String(input.name ?? input.variable ?? ""));
    const label = String(input.label ?? name).trim();
    if (!name || !label) throw new Error(`${header}[${index}] needs a name and label.`);
    return {
      ...input,
      name,
      label,
      required,
    };
  });
}

function parseWorkflowSteps(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((step) => typeof step === "string")) {
    throw new Error("workflow_steps_json must be a JSON array of strings.");
  }
  return value.map((step) => step.trim()).filter(Boolean);
}

function parseCustomLayout(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("layout_config_json must be a versioned layout object.");
  }
  const layout = value as Record<string, unknown>;
  if (layout.version !== 1 || !Array.isArray(layout.blocks)) {
    throw new Error("layout_config_json must use version 1 and include a blocks array.");
  }
  return {
    ...layout,
    blocks: layout.blocks.map((block, index) => {
      if (!block || typeof block !== "object" || Array.isArray(block)) {
        throw new Error(`layout_config_json.blocks[${index}] must be a block object.`);
      }
      const object = block as Record<string, unknown>;
      return { ...object, id: object.id ?? `csv-block-${index + 1}` };
    }),
  };
}

function objectCell(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const normalizedKey = normalizeRecipeCsvHeader(key);
    const entry = Object.entries(record).find(([name]) => normalizeRecipeCsvHeader(name) === normalizedKey);
    const value = entry?.[1];
    if (typeof value === "string" || typeof value === "number") {
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return "";
}

function objectStringList(record: Record<string, unknown>, ...keys: string[]): string[] {
  const acceptedKeys = new Set(keys.map(normalizeRecipeCsvHeader));
  for (const [key, value] of Object.entries(record)) {
    if (!acceptedKeys.has(normalizeRecipeCsvHeader(key))) continue;
    if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
    if (typeof value === "string") return splitList(value);
  }
  return [];
}

function objectBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const normalizedKey = normalizeRecipeCsvHeader(key);
  const entry = Object.entries(record).find(([name]) => normalizeRecipeCsvHeader(name) === normalizedKey);
  if (!entry) return undefined;
  return ["true", "yes", "1", "on"].includes(String(entry[1]).trim().toLowerCase());
}

function normalizePromptVariableName(value: string): string {
  return value.trim().replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "");
}

function parseBoolean(value: string): boolean {
  return ["true", "yes", "1", "on", "featured", "trending"].includes(value.trim().toLowerCase());
}

function recipeStatus(value: string): string {
  const status = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["published", "publish", "live"].includes(status)) return "PUBLISHED";
  if (["testing", "in_testing"].includes(status)) return "TESTING";
  if (status === "idea") return "IDEA";
  return "DRAFT";
}

function qualityStatus(value: string): "untested" | "in_testing" | "tested" {
  const status = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["tested", "verified", "passed"].includes(status)) return "tested";
  if (["testing", "in_testing"].includes(status)) return "in_testing";
  return "untested";
}

function parseSituations(value: string) {
  const parsed = parseObjectArray(value);
  if (parsed) {
    return parsed.flatMap((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const description = objectCell(record, "description", "context", "details", "when", "trigger");
      const name = objectCell(record, "name", "situation", "title", "label", "option", "scenario") || `Situation ${index + 1}`;
      const promptModifier = objectCell(record, "promptModifier", "prompt", "modifier", "instruction", "instructions", "guidance")
        || description
        || `Adapt the prompt for this situation: ${name}.`;
      return [{ name, description: description || undefined, promptModifier }];
    });
  }
  return splitList(value).map((name) => ({ name, description: name, promptModifier: name }));
}

function parsePromptVariables(value: string) {
  const parsed = parseObjectArray(value);
  if (parsed) {
    return parsed.flatMap((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const name = normalizePromptVariableName(objectCell(record, "name", "variable", "key", "token", "placeholder", "id") || `input_${index + 1}`);
      const label = objectCell(record, "label", "title", "description", "name", "variable", "key") || name;
      const placeholder = objectCell(record, "placeholder", "example", "default", "hint");
      const required = objectBoolean(record, "required");
      const type = objectCell(record, "type");
      const helpText = objectCell(record, "helpText", "help_text");
      const defaultValue = objectCell(record, "defaultValue", "default_value");
      const optionsValue = record.options;
      const options = Array.isArray(optionsValue) ? optionsValue.map(String) : undefined;
      const validation = record.validation && typeof record.validation === "object" && !Array.isArray(record.validation)
        ? record.validation
        : undefined;
      return [{
        name,
        label,
        ...(placeholder ? { placeholder } : {}),
        ...(required === undefined ? {} : { required }),
        ...(type ? { type } : {}),
        ...(helpText ? { helpText } : {}),
        ...(defaultValue ? { defaultValue } : {}),
        ...(options ? { options } : {}),
        ...(validation ? { validation } : {}),
      }];
    });
  }
  return splitList(value).map((item) => {
    const separatorIndex = item.search(/[:=]/);
    const name = separatorIndex > 0 ? item.slice(0, separatorIndex).trim() : item;
    const label = separatorIndex > 0 ? item.slice(separatorIndex + 1).trim() : item;
    return { name, label };
  });
}

function parseExamples(value: string, exampleInput: string, exampleOutput: string) {
  const parsed = parseObjectArray(value);
  if (parsed) {
    return parsed.flatMap((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const input = objectCell(record, "input", "exampleInput", "example", "prompt") || exampleInput;
      const output = objectCell(record, "output", "expectedOutput", "expected", "result", "response", "answer", "content", "exampleOutput") || exampleOutput;
      if (!input || !output) return [];
      const scenario = objectCell(record, "scenario", "title", "name", "label") || `Example ${index + 1}`;
      const whyItWorks = objectStringList(record, "whyItWorks", "why", "rationale");
      return [{ scenario, input, output, ...(whyItWorks.length ? { whyItWorks } : {}) }];
    });
  }

  if (!exampleInput || !exampleOutput) return [];
  const scenarios = splitList(value);
  return [{
    scenario: scenarios[0] || "Example",
    input: exampleInput,
    output: exampleOutput,
    whyItWorks: scenarios.slice(1),
  }];
}

export function mapRecipeCsvRecord(
  record: RecipeCsvRecord,
  categoryId: number,
  audienceId: number,
): Record<string, unknown> {
  const title = getCell(record, "Recipe Title", "Title");
  const exampleInput = getCell(record, "Example Input");
  const exampleOutput = getCell(record, "Example Output");
  const requiredInputs = splitList(getCell(record, "Required Inputs"));
  const testedWith = splitList(getCell(record, "Tested With (Assistants/Models)", "Tested With"));
  const testedAt = getCell(record, "Tested Date", "Last Tested") || null;
  const aiTools = splitList(getCell(record, "AI Tools"));
  const supportedTools = splitList(getCell(record, "Supported AI Tools"));
  const bestWith = splitList(getCell(record, "Best With"));
  const testStatus = qualityStatus(getCell(record, "Recipe Test Status"));
  const version = getCell(record, "Version") || "1.0";
  const timeToResult = getCell(record, "Time To Result");
  const outputDescription = getCell(record, "Expected Output", "Output");
  const realisticExamples = getCell(record, "Realistic Examples");
  const schemaVersion = getCell(record, "CSV Schema Version", "Recipe CSV Version");
  if (schemaVersion && schemaVersion !== "2") {
    throw new Error(`Unsupported CSV schema version "${schemaVersion}". Use version 2 or omit the version for legacy CSV.`);
  }

  const requiredJson = parseJsonCell<unknown>(record, "Required Inputs JSON");
  const optionalJson = parseJsonCell<unknown>(record, "Optional Inputs JSON");
  const hasJsonInputs = requiredJson !== undefined || optionalJson !== undefined;
  const jsonRequiredInputs = requiredJson === undefined ? [] : parseInputDefinitions(requiredJson, true, "required_inputs_json");
  const jsonOptionalInputs = optionalJson === undefined ? [] : parseInputDefinitions(optionalJson, false, "optional_inputs_json");
  const promptVariables = hasJsonInputs
    ? [...jsonRequiredInputs, ...jsonOptionalInputs]
    : parsePromptVariables(getCell(record, "Prompt Variables"));
  const workflowJson = parseJsonCell<unknown>(record, "Workflow Steps JSON");
  const outputConfig = parseJsonCell<unknown>(record, "Output Config JSON");
  const layoutConfigValue = parseJsonCell<unknown>(record, "Layout Config JSON");
  const layoutConfig = layoutConfigValue === undefined ? null : parseCustomLayout(layoutConfigValue);
  const troubleshooting = parseJsonCell<unknown>(record, "Troubleshooting JSON");
  const verificationChecklist = parseJsonCell<unknown>(record, "Verification Checklist JSON");
  const images = parseJsonCell<unknown>(record, "Images JSON");
  const workflowDiagram = getCell(record, "Workflow Diagram Mermaid");
  const guideJson = parseJsonCell<unknown>(record, "Recipe Guide JSON");
  if (guideJson !== undefined && (!guideJson || typeof guideJson !== "object" || Array.isArray(guideJson))) {
    throw new Error("recipe_guide_json must be a JSON object.");
  }
  const rawPrompt = getCell(record, "Prompt Template") || getCell(record, "The Copyable Prompt", "Copyable Prompt", "Prompt");
  const requiredInputLabels = hasJsonInputs && jsonRequiredInputs.length
    ? jsonRequiredInputs.map((input) => String(input.label))
    : requiredInputs;

  const guideTools = supportedTools.length ? supportedTools : aiTools;
  const layoutMode = layoutConfig ? "custom" : "normal";
  const mappedGuide = {
    snapshot: {
      bestFor: getCell(record, "Best For"),
      worksBestWhen: getCell(record, "Works Best When"),
      timeToResult,
      output: getCell(record, "Output") || outputDescription,
      bestWith,
      skillLevel: getCell(record, "Skill Level") || getCell(record, "Difficulty"),
    },
    useCases: splitList(getCell(record, "When This Recipe Is Useful")).map((description, index) => ({
      name: `Use case ${index + 1}`,
      description,
    })),
    whenNotToUse: splitList(getCell(record, "When Not To Use This")),
    inputs: {
      required: hasJsonInputs ? requiredInputLabels : requiredInputs,
      optional: hasJsonInputs
        ? jsonOptionalInputs.map((input) => String(input.label))
        : splitList(getCell(record, "Optional Inputs")),
    },
    situations: parseSituations(getCell(record, "Choose Your Situation")),
    tools: guideTools.map((name) => ({ name, support: "compatible" })),
    promptVariables,
    ...(outputConfig === undefined ? {} : { outputConfig }),
    expectedOutput: {
      description: outputDescription,
      characteristics: splitList(getCell(record, "Output Characteristics")),
    },
    examples: parseExamples(realisticExamples, exampleInput, exampleOutput),
    bestFor: {
      people: splitList(getCell(record, "Best For People")),
      tasks: splitList(getCell(record, "Best For Tasks")),
      channels: splitList(getCell(record, "Best For Channels")),
    },
    timeToResult,
    effort: getCell(record, "Effort"),
    typicalIterations: getCell(record, "Typical AI Iterations"),
    commonMistakes: splitList(getCell(record, "Common Mistakes")),
    betterApproach: getCell(record, "Better Approach"),
    proTips: splitList(getCell(record, "Pro Tips")),
    safetyNotes: splitList(getCell(record, "Additional Safety Notes")),
    ...(images === undefined ? {} : { imagesJson: images }),
    ...((troubleshooting !== undefined || verificationChecklist !== undefined || images !== undefined || workflowDiagram)
      ? {
          customContent: {
            ...(troubleshooting === undefined ? {} : { troubleshooting }),
            ...(verificationChecklist === undefined ? {} : { verificationChecklist }),
            ...(images === undefined ? {} : { images }),
            ...(workflowDiagram ? { workflowDiagram } : {}),
          },
        }
      : {}),
    quality: {
      status: testStatus,
      lastTested: testedAt,
      version,
      testedWith,
    },
  };
  const guide = guideJson === undefined
    ? mappedGuide
    : {
        ...(guideJson as Record<string, unknown>),
        ...(images === undefined || Array.isArray((guideJson as Record<string, unknown>).imagesJson)
          ? {}
          : { imagesJson: images }),
        ...(hasJsonInputs ? {
          promptVariables,
          inputs: {
            required: requiredInputLabels,
            optional: jsonOptionalInputs.map((input) => String(input.label)),
          },
        } : {}),
        ...(outputConfig === undefined ? {} : { outputConfig }),
        ...((troubleshooting !== undefined || verificationChecklist !== undefined || images !== undefined || workflowDiagram)
          ? {
              customContent: {
                ...((guideJson as Record<string, unknown>).customContent
                  && typeof (guideJson as Record<string, unknown>).customContent === "object"
                  && !Array.isArray((guideJson as Record<string, unknown>).customContent)
                  ? (guideJson as Record<string, unknown>).customContent as Record<string, unknown>
                  : {}),
                ...(troubleshooting === undefined ? {} : { troubleshooting }),
                ...(verificationChecklist === undefined ? {} : { verificationChecklist }),
                ...(images === undefined ? {} : { images }),
                ...(workflowDiagram ? { workflowDiagram } : {}),
              },
            }
          : {}),
      };

  return {
    title,
    slug: getCell(record, "URL Slug", "Slug"),
    shortDescription: getCell(record, "Short Description"),
    problem: getCell(record, "The Real Problem / Pain Point", "Problem"),
    categoryId,
    audienceId,
    subcategory: getCell(record, "Subcategory"),
    difficulty: getCell(record, "Difficulty") || getCell(record, "Skill Level"),
    estimatedTime: getCell(record, "Estimated Time") || timeToResult,
    language: getCell(record, "Language") || "English",
    aiTools,
    requiredInputs: hasJsonInputs ? requiredInputLabels : requiredInputs,
    steps: workflowJson === undefined ? splitList(getCell(record, "Steps to Execute", "Steps")) : parseWorkflowSteps(workflowJson),
    prompt: rawPrompt,
    exampleInput,
    exampleOutput,
    refinementPrompts: splitList(getCell(record, "Refinement Follow Up Prompts", "Refinement Prompts")),
    verificationNotes: getCell(record, "Verification & Testing Notes", "Verification and Testing Notes"),
    tags: splitList(getCell(record, "Tags")),
    status: recipeStatus(getCell(record, "Publishing Status", "Status")),
    featured: parseBoolean(getCell(record, "Featured on Shelves", "Featured")),
    trending: parseBoolean(getCell(record, "Mark as Trending", "Trending")),
    recipeOfDay: parseBoolean(getCell(record, "Recipe of the Day")),
    version,
    testedAt,
    testedWith,
    seoTitle: getCell(record, "SEO Title") || title,
    seoDescription: getCell(record, "SEO Description") || getCell(record, "Short Description"),
    guide,
    layoutMode,
    layoutConfig,
  };
}