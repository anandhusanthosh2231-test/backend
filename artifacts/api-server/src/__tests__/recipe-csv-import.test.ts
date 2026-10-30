import assert from "node:assert/strict";
import { test } from "node:test";
import type { Recipe } from "@workspace/db";
import {
  mapRecipeCsvRecord,
  createRecipeTaxonomyCandidate,
  findRecipeTaxonomy,
  parseRecipeCsv,
  recipeTaxonomySlug,
  splitRecipeCsvAudiences,
} from "../lib/recipe-csv-import.ts";
import { buildRecipeCsvExport } from "../lib/recipe-csv-export.ts";

test("splits and deduplicates semicolon-separated audience names", () => {
  assert.deepEqual(
    splitRecipeCsvAudiences("Content creators; photographers; content creators"),
    ["Content creators", "photographers"],
  );
});

test("creates readable URL-safe taxonomy slugs", () => {
  assert.equal(recipeTaxonomySlug("Design & Media"), "design-media");
});

test("keeps preview taxonomy IDs out of database insert values", () => {
  const candidate = createRecipeTaxonomyCandidate("Entertainment");

  assert.equal(candidate.lookup.id, 1);
  assert.deepEqual(candidate.insert, {
    name: "Entertainment",
    slug: "entertainment",
    description: "AI recipes for Entertainment.",
  });
  assert.equal("id" in candidate.insert, false);
});

test("resolves imported taxonomy names when normalization changes their generated slug", () => {
  const categories = [
    { id: 1, name: "Cafe Culture", slug: "cafe-culture" },
  ];

  assert.deepEqual(findRecipeTaxonomy(categories, "Café Culture"), categories[0]);
});

test("parses quoted CSV cells containing commas and line breaks", () => {
  const records = parseRecipeCsv('Recipe Title,URL Slug,The Copyable Prompt\n"Reply to customers",reply-to-customers,"Write a clear, kind reply.\nKeep it short."');

  assert.equal(records.length, 1);
  assert.equal(records[0]["recipe title"], "Reply to customers");
  assert.equal(records[0]["the copyable prompt"], "Write a clear, kind reply.\nKeep it short.");
});

test("ignores a repeated header row in spreadsheet exports", () => {
  const records = parseRecipeCsv("Recipe Title,URL Slug\nRecipe Title,URL Slug\nReal recipe,real-recipe");

  assert.equal(records.length, 1);
  assert.equal(records[0]["recipe title"], "Real recipe");
});

test("maps spreadsheet columns into recipe fields and rendered guide data", () => {
  const [record] = parseRecipeCsv([
    "Recipe Title,URL Slug,Short Description,The Real Problem / Pain Point,Subcategory,Difficulty,Estimated Time,The Copyable Prompt,Example Input,Example Output,Verification & Testing Notes,Category,Target Audience,Required Inputs,Steps to Execute,AI Tools,Tags,Tested With (Assistants/Models),Tested Date,Version,Best for,Works best when,Time to result,Output,Skill level,Best with,Best for people,Best for tasks,Best for channels,When this recipe is useful,Optional inputs,Supported AI tools,Expected output,Output characteristics,Common mistakes,Better approach,Pro tips,Additional safety notes,Effort,Typical AI iterations,Recipe test status,Publishing Status,Featured on Shelves,Mark as Trending,Recipe of the Day",
    'Customer Reply,customer-reply,Write customer replies,Replies are inconsistent,Support,Beginner,5 min,"Write a short, polite reply",Question,Answer,Tested manually,Communication,Small Business,"customer message; desired outcome","Read the request; draft a reply",ChatGPT,"support; whatsapp",GPT-4,2026-09-30,1.2,Customer support,When replying to questions,5 min,Clear reply,Beginner,ChatGPT,"shop owners","customer service","WhatsApp",Before replying to a customer,store policy,Claude,Polite response,"clear; concise",Overexplaining,Answer directly,Keep the tone warm,Do not include private data,Low,1-2,Tested,DRAFT,yes,no,no',
  ].join("\n"));

  const recipe = mapRecipeCsvRecord(record, 3, 4);
  const guide = recipe.guide as Record<string, any>;

  assert.equal(recipe.categoryId, 3);
  assert.equal(recipe.audienceId, 4);
  assert.deepEqual(recipe.requiredInputs, ["customer message", "desired outcome"]);
  assert.deepEqual(recipe.status, "DRAFT");
  assert.equal(guide.snapshot.bestFor, "Customer support");
  assert.deepEqual(guide.bestFor.people, ["shop owners"]);
  assert.equal(guide.quality.status, "tested");
  assert.equal(guide.quality.lastTested, "2026-09-30");
  assert.deepEqual(guide.tools, [{ name: "Claude", support: "compatible" }]);
  assert.equal(guide.examples[0].input, "Question");
  assert.equal(guide.examples[0].output, "Answer");
  assert.equal(recipe.featured, true);
  assert.equal(recipe.trending, false);
});

test("normalizes JSON guide objects with spreadsheet-style snake_case keys", () => {
  const headers = "Recipe Title,URL Slug,Short Description,The Real Problem / Pain Point,Subcategory,Difficulty,Estimated Time,The Copyable Prompt,Example Input,Example Output,Verification & Testing Notes,Category,Target Audience,Choose Your Situation,Prompt Variables,Realistic Examples";
  const situations = JSON.stringify([{ situation: "Planning", context: "Prepare an agenda", prompt_modifier: "Prioritize decisions" }]);
  const variables = JSON.stringify([
    { variable: "TEAM", description: "Team name", example: "Support" },
    { variable: "{{exam_date}}", description: "Exam date" },
  ]);
  const examples = JSON.stringify([{ title: "Weekly sync", input: "Team updates", expected_output: "Agenda with owners" }]);
  const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const [record] = parseRecipeCsv([
    headers,
    ["Meeting Plan", "meeting-plan", "Plan a meeting", "Meetings lack structure", "Work", "Beginner", "10 min", "Create a meeting plan with the provided context and goal.", "Team sync", "Agenda with owners", "Verified", "Productivity", "Professionals", situations, variables, examples].map(csvCell).join(","),
  ].join("\n"));

  const recipe = mapRecipeCsvRecord(record, 1, 1);
  const guide = recipe.guide as Record<string, any>;

  assert.deepEqual(guide.situations[0], {
    name: "Planning",
    description: "Prepare an agenda",
    promptModifier: "Prioritize decisions",
  });
  assert.deepEqual(guide.promptVariables[0], {
    name: "TEAM",
    label: "Team name",
    placeholder: "Support",
  });
  assert.equal(guide.promptVariables[1].name, "exam_date");
  assert.deepEqual(guide.examples[0], {
    scenario: "Weekly sync",
    input: "Team updates",
    output: "Agenda with owners",
  });
});

test("maps version 2 dynamic inputs, prompt templates, output format, workflow, and layout JSON", () => {
  const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const row = [
    "2", "Resume Tailor", "resume-tailor", "Tailor a resume", "Generic resumes miss role requirements",
    "Writing", "Job seekers", "Applications", "Beginner", "10 min", "English", '["ChatGPT"]',
    "[]", "[]",
    "Tailor {{resume}} to {{job_description}} for {{tone}}.",
    "Resume", "Updated resume", "[]", "Verify every claim.", "[]", "DRAFT",
    JSON.stringify([{ name: "resume", label: "Current resume", type: "textarea", required: true, helpText: "Remove private data." }]),
    JSON.stringify([{ name: "tone", label: "Tone", type: "dropdown", required: false, defaultValue: "Concise", options: ["Concise", "Warm"] }]),
    JSON.stringify(["Analyze the job", "Tailor the resume"]),
    JSON.stringify({ version: 1, format: "steps", description: "Provide a checklist.", fields: ["Draft", "Checks"] }),
    JSON.stringify({ version: 1, blocks: [{ type: "hero", visible: true }, { type: "field", fieldRef: "verificationNotes", visible: true }] }),
  ];
  const headers = [
    "csv_schema_version", "Recipe Title", "URL Slug", "Short Description", "Problem", "Category",
    "Target Audience", "Subcategory", "Difficulty", "Estimated Time", "Language", "AI Tools",
    "Required Inputs", "Steps to Execute", "Prompt Template", "Example Input", "Example Output",
    "Refinement Prompts", "Verification & Testing Notes", "Tags", "Publishing Status",
    "required_inputs_json", "optional_inputs_json", "workflow_steps_json", "output_config_json", "layout_config_json",
  ];
  const [record] = parseRecipeCsv([headers.join(","), row.map(csvCell).join(",")].join("\n"));
  const recipe = mapRecipeCsvRecord(record, 2, 3);
  const guide = recipe.guide as Record<string, any>;
  const inputs = guide.promptVariables as Array<Record<string, unknown>>;

  assert.equal(recipe.prompt, "Tailor {{resume}} to {{job_description}} for {{tone}}.");
  assert.deepEqual(recipe.steps, ["Analyze the job", "Tailor the resume"]);
  assert.deepEqual(recipe.requiredInputs, ["Current resume"]);
  assert.deepEqual(inputs.map(({ name, type, required }) => ({ name, type, required })), [
    { name: "resume", type: "textarea", required: true },
    { name: "tone", type: "dropdown", required: false },
  ]);
  assert.deepEqual(guide.outputConfig, {
    version: 1,
    format: "steps",
    description: "Provide a checklist.",
    fields: ["Draft", "Checks"],
  });
  assert.equal(recipe.layoutMode, "custom");
  assert.deepEqual((recipe.layoutConfig as { blocks: Array<{ id: string }> }).blocks.map(({ id }) => id), ["csv-block-1", "csv-block-2"]);
});

test("round-trips dynamic inputs, guide data, output config, and custom layout through CSV export", () => {
  const recipe = {
    id: 1,
    title: "Resume Tailor",
    slug: "resume-tailor",
    shortDescription: "Tailor a resume to a role.",
    problem: "Resumes often miss role requirements.",
    categoryId: 2,
    audienceId: 3,
    subcategory: "Applications",
    difficulty: "Beginner",
    estimatedTime: "10 min",
    language: "English",
    aiTools: ["ChatGPT"],
    requiredInputs: ["Current resume"],
    steps: ["Review the role", "Tailor the resume"],
    prompt: "Tailor {{resume}} for {{tone}}.",
    exampleInput: "Resume and job description",
    exampleOutput: "Targeted resume",
    refinementPrompts: ["Make it more concise."],
    verificationNotes: "Verify every claim.",
    guide: {
      promptType: "image",
      imagesJson: [{ url: "https://cdn.example.test/visual.png", alt: "Visual prompt reference" }],
      promptStudio: { style: "Editorial", model: "Imagen", aspectRatio: "3:2" },
      promptVariables: [
        { name: "resume", label: "Current resume", type: "textarea", required: true, helpText: "Remove private data." },
        { name: "tone", label: "Tone", type: "dropdown", required: false, defaultValue: "Concise", options: ["Concise", "Warm"] },
      ],
      outputConfig: { version: 1, format: "steps", fields: ["Draft", "Checks"] },
      customContent: {
        troubleshooting: ["Narrow the search to one location."],
        verificationChecklist: ["Confirm listed roles are currently open."],
        workflowDiagram: "flowchart TD\n  A[Collect] --> B[Verify]",
        images: [{ url: "https://cdn.example.test/search.png", alt: "Search filters", caption: "Set filters" }],
      },
      customGuideData: { source: "editor" },
    },
    tags: ["career"],
    status: "DRAFT",
    featured: false,
    trending: false,
    recipeOfDay: false,
    version: "1.0",
    testedAt: null,
    testedWith: [],
    seoTitle: "Resume Tailor",
    seoDescription: "Tailor a resume to a role.",
    layoutMode: "custom",
    layoutConfig: {
      version: 1,
      blocks: [
        { id: "hero-1", type: "hero", visible: true },
        { id: "inputs-1", type: "inputs", visible: true },
        { id: "output-1", type: "output", visible: true },
      ],
    },
    viewCount: 0,
    copyCount: 0,
    saveCount: 0,
    shareCount: 0,
    positiveFeedbackCount: 0,
    negativeFeedbackCount: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    publishedAt: null,
    catalogue: "TASKBAKE",
  } satisfies Recipe;

  const csv = buildRecipeCsvExport([{
    recipe,
    category: "Writing",
    audience: "Job seekers",
    audiences: ["Job seekers", "Career coaches"],
  }]);
  const [record] = parseRecipeCsv(csv);
  record["csv action"] = "update";

  const imported = mapRecipeCsvRecord(record, recipe.categoryId, recipe.audienceId);
  const importedGuide = imported.guide as typeof recipe.guide;
  const originalGuide = recipe.guide;

  assert.equal(imported.prompt, recipe.prompt);
  assert.deepEqual(imported.steps, recipe.steps);
  assert.deepEqual(importedGuide.promptVariables, originalGuide.promptVariables);
  assert.deepEqual(importedGuide.outputConfig, originalGuide.outputConfig);
  assert.equal(importedGuide.promptType, originalGuide.promptType);
  assert.deepEqual(importedGuide.imagesJson, originalGuide.imagesJson);
  assert.deepEqual(importedGuide.promptStudio, originalGuide.promptStudio);
  assert.deepEqual(importedGuide.customContent, originalGuide.customContent);
  assert.deepEqual(importedGuide.customGuideData, originalGuide.customGuideData);
  assert.deepEqual(imported.layoutConfig, recipe.layoutConfig);
  assert.equal(imported.layoutMode, "custom");
  assert.deepEqual(splitRecipeCsvAudiences(record["target audience"]), ["Job seekers", "Career coaches"]);
});

test("rejects malformed JSON in versioned input columns and unsupported schema versions", () => {
  const [record] = parseRecipeCsv([
    "csv_schema_version,Recipe Title,URL Slug,required_inputs_json",
    '2,Recipe,resume-tailor,"not json"',
  ].join("\n"));
  assert.throws(() => mapRecipeCsvRecord(record, 1, 1), /Required Inputs JSON must contain valid JSON/i);

  const [unsupported] = parseRecipeCsv([
    "csv_schema_version,Recipe Title,URL Slug",
    "99,Recipe,resume-tailor",
  ].join("\n"));
  assert.throws(() => mapRecipeCsvRecord(unsupported, 1, 1), /unsupported CSV schema version/i);
});

test("rejects duplicate normalized headers and missing required headers", () => {
  assert.throws(() => parseRecipeCsv("Recipe Title,recipe-title,URL Slug\nA,B,a"), /headers must be unique/i);
  assert.throws(() => parseRecipeCsv("Name,URL Slug\nA,a"), /must include.*Recipe Title/i);
});

test("rejects CSV without a recipe row", () => {
  assert.throws(() => parseRecipeCsv("Recipe Title,URL Slug\n"), /at least one recipe row/i);
});