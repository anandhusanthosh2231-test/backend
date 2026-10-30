import assert from "node:assert/strict";
import test from "node:test";
import { vybeCreationInputSchema } from "../lib/vybe.ts";
import {
  buildVybeCsv,
  buildVybeCsvTemplate,
  getVybeCsvSchema,
  parseAndValidateVybeCsv,
} from "../lib/vybe-csv.ts";

const baseCreation = vybeCreationInputSchema.parse({
  title: "Luminous city",
  slug: "luminous-city",
  shortDescription: "A quiet city suspended in blue light.",
  description: "An atmospheric visual prompt for a distant future.",
  contentType: "image",
});

test("derives the CSV schema and downloadable template from editable VYBE fields", () => {
  const schema = getVybeCsvSchema();
  const template = buildVybeCsvTemplate();

  assert.equal(schema.version, "1");
  assert.equal(schema.maxRows, 500);
  assert.ok(schema.fields.some((field) => field.name === "prompt"));
  assert.ok(!schema.fields.map((field) => field.name as string).includes("id"));
  assert.match(template, /^"csv_schema_version","title","slug"/);
  assert.throws(() => parseAndValidateVybeCsv(template), /header row and at least one data row/);
});

test("round-trips Unicode, multiline text, JSON fields, nullable integers, booleans, and safe formulas", () => {
  const creation = {
    ...baseCreation,
    title: "Étoile, 雲の街",
    slug: "etoile-cloud-city",
    prompt: "  Create a skyline.\nUse a calm, cinematic palette.\n",
    negativePrompt: " =HYPERLINK(\"https://example.com\")",
    parameters: { seed: 42, detail: "東京" },
    durationSeconds: null,
    featured: true,
  };
  const [row] = parseAndValidateVybeCsv(buildVybeCsv([creation]));

  assert.deepEqual(row.errors, []);
  assert.equal(row.data?.title, creation.title);
  assert.equal(row.data?.prompt, creation.prompt);
  assert.equal(row.data?.negativePrompt, creation.negativePrompt);
  assert.deepEqual(row.data?.parameters, creation.parameters);
  assert.equal(row.data?.durationSeconds, null);
  assert.equal(row.data?.featured, true);
});

test("supports explicit header mapping for source files with non-standard column names", () => {
  const csv = [
    "Creative Name,URL Handle,Summary,Long description,Creation kind",
    '"Aurora study",aurora-study,"Light through ice","A long, careful study of aurora light.",image',
  ].join("\r\n");
  const [row] = parseAndValidateVybeCsv(csv, {
    title: "Creative Name",
    slug: "URL Handle",
    shortDescription: "Summary",
    description: "Long description",
    contentType: "Creation kind",
  });

  assert.deepEqual(row.errors, []);
  assert.equal(row.data?.title, "Aurora study");
  assert.equal(row.data?.description, "A long, careful study of aurora light.");
});

test("reports invalid JSON and duplicate slugs without treating either row as valid", () => {
  const header = "title,slug,shortDescription,description,contentType,parameters";
  const csv = [
    header,
    'First creation,shared-slug,First,Description,image,"{""seed"":1}"',
    'Second creation,shared-slug,Second,Description,image,"not-json"',
  ].join("\n");
  const rows = parseAndValidateVybeCsv(csv);

  assert.equal(rows.length, 2);
  assert.ok(rows[1].errors.some((error) => error.column === "slug" && error.message.includes("Duplicate")));
  assert.ok(rows[1].errors.some((error) => error.column === "parameters" && error.message.includes("valid JSON")));
});

test("rejects CSV files over the row limit", () => {
  const rows = ["title,slug", ...Array.from({ length: 501 }, (_, index) => `Title ${index},title-${index}`)];
  assert.throws(() => parseAndValidateVybeCsv(rows.join("\n")), /at most 500 rows/);
});
