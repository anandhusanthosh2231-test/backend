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
    columns: (headers: string[]) => headers.map(normalizeRecipeCsvHeader),
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

function parseObjectArray(value: string): unknown[] | undefined {
  if (!value.trim().startsWith("[")) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
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
      return [{ name, label, ...(placeholder ? { placeholder } : {}), ...(required === undefined ? {} : { required }) }];
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

  const guideTools = supportedTools.length ? supportedTools : aiTools;

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
    requiredInputs,
    steps: splitList(getCell(record, "Steps to Execute", "Steps")),
    prompt: getCell(record, "The Copyable Prompt", "Copyable Prompt", "Prompt"),
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
    guide: {
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
      inputs: { required: requiredInputs, optional: splitList(getCell(record, "Optional Inputs")) },
      situations: parseSituations(getCell(record, "Choose Your Situation")),
      tools: guideTools.map((name) => ({ name, support: "compatible" })),
      promptVariables: parsePromptVariables(getCell(record, "Prompt Variables")),
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
      quality: {
        status: testStatus,
        lastTested: testedAt,
        version,
        testedWith,
      },
    },
  };
}