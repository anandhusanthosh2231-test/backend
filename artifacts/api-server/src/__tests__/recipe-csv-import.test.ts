import assert from "node:assert/strict";
import { test } from "node:test";
import { mapRecipeCsvRecord, parseRecipeCsv } from "../lib/recipe-csv-import.ts";

test("parses quoted CSV cells containing commas and line breaks", () => {
  const records = parseRecipeCsv('Recipe Title,The Copyable Prompt\n"Reply to customers","Write a clear, kind reply.\nKeep it short."');

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

test("rejects CSV without a recipe row", () => {
  assert.throws(() => parseRecipeCsv("Recipe Title,URL Slug\n"), /at least one recipe row/i);
});