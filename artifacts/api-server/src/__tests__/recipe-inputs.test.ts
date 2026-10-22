import assert from "node:assert/strict";
import { test } from "node:test";
import { validateRecipePromptConfiguration } from "../lib/recipe-inputs.ts";

test("validates configured prompt input types, options, and output structures", () => {
  const error = validateRecipePromptConfiguration({
    promptVariables: [
      { name: "audience", label: "Audience", type: "dropdown", required: true, options: ["Teams", "Leaders"] },
      { name: "count", label: "Count", type: "number", validation: { minimum: 1, maximum: 10 } },
    ],
    outputConfig: { version: 1, format: "table", fields: ["Task", "Owner"] },
  }, "Write for {{audience}} and return {{count}} tasks.");

  assert.equal(error, undefined);
});

test("validates custom-layout prompt inputs, workflow content, and screenshots", () => {
  assert.equal(validateRecipePromptConfiguration({
    promptVariables: [{ name: "target_role", label: "Target role", type: "select", options: ["Engineer"], required: true }],
    customContent: {
      troubleshooting: ["Add location constraints."],
      verificationChecklist: ["Confirm role is still open."],
      workflowDiagram: "flowchart TD\nA --> B",
      images: [{ url: "https://cdn.example.test/search.png", alt: "Search results" }],
    },
  }, "Find roles for {{target_role}}."), undefined);

  const error = validateRecipePromptConfiguration({
    customContent: { images: [{ url: "javascript:alert(1)", alt: "" }] },
  }, "Prompt");
  assert.match(error ?? "", /customContent\.images/);
});

test("rejects missing prompt definitions, invalid input rules, and invalid output configuration", () => {
  const error = validateRecipePromptConfiguration({
    promptVariables: [
      { name: "audience", label: "Audience", type: "dropdown", options: [] },
      { name: "bad_name", label: "Invalid variable", validation: { pattern: "[" } },
      { name: "format", label: "Format", type: "dropdown", options: ["JSON"], defaultValue: "XML" },
    ],
    outputConfig: { version: 2, format: "xml" },
  }, "Write for {{audience}} with {{tone}}.");

  assert.match(error ?? "", /at least one option/);
  assert.match(error ?? "", /invalid regular expression|pattern/i);
  assert.match(error ?? "", /no matching input definition/);
  assert.match(error ?? "", /outputConfig/);
  assert.match(error ?? "", /default value must match one of the dropdown options/i);
});

test("preserves legacy prompt tokens when the recipe has no dynamic input schema", () => {
  assert.equal(validateRecipePromptConfiguration({ promptVariables: [] }, "Use {{legacy_variable}} unchanged."), undefined);
  assert.equal(validateRecipePromptConfiguration(null, "Use {{legacy_variable}} unchanged."), undefined);
});
