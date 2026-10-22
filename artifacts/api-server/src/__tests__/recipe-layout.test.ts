import test from "node:test";
import assert from "node:assert/strict";
import { validateRecipeLayout } from "../lib/recipe-layout.ts";

const validLayout = {
  version: 1,
  blocks: [{ id: "hero-1", type: "hero", visible: true, title: "A recipe" }],
};

test("recipes without layout metadata remain normal by default", () => {
  assert.equal(validateRecipeLayout(undefined, undefined), undefined);
  assert.equal(validateRecipeLayout("normal", null), undefined);
});

test("custom layouts accept supported versioned blocks", () => {
  assert.equal(validateRecipeLayout("custom", validLayout), undefined);
});

test("custom workflow sections are recognized as layout blocks", () => {
  const types = ["outcome", "refinements", "troubleshooting", "diagram", "images"];
  for (const [index, type] of types.entries()) {
    assert.equal(validateRecipeLayout("custom", {
      version: 1,
      blocks: [{ id: `custom-${index}`, type, visible: true }],
    }), undefined);
  }
});

test("custom mode requires a layout configuration", () => {
  assert.match(validateRecipeLayout("custom", null) ?? "", /require a valid layout configuration/);
});

test("unknown block types and duplicate IDs are rejected", () => {
  assert.ok(validateRecipeLayout("custom", { version: 1, blocks: [{ id: "x", type: "script", visible: true }] }));
  assert.ok(validateRecipeLayout("custom", { version: 1, blocks: [
    { id: "x", type: "hero", visible: true },
    { id: "x", type: "image", visible: true },
  ] }));
});

test("custom layout recipe fields must reference supported recipe data", () => {
  assert.equal(validateRecipeLayout("custom", {
    version: 1,
    blocks: [{ id: "recipe-problem", type: "field", fieldRef: "problem", visible: true }],
  }), undefined);
  assert.match(validateRecipeLayout("custom", {
    version: 1,
    blocks: [{ id: "missing-field", type: "field", fieldRef: "unknown", visible: true }],
  }) ?? "", /fieldRef/i);
  assert.match(validateRecipeLayout("custom", {
    version: 1,
    blocks: [{ id: "missing-reference", type: "field", visible: true }],
  }) ?? "", /reference/i);
});

test("layout image URLs reject executable and malformed schemes", () => {
  assert.ok(validateRecipeLayout("custom", { version: 1, blocks: [{ id: "image", type: "image", visible: true, imageUrl: "javascript:alert(1)" }] }));
  assert.ok(validateRecipeLayout("custom", { version: 1, blocks: [{ id: "image", type: "image", visible: true, imageUrl: "https://media.example.com/image.webp" }] }));
  assert.equal(validateRecipeLayout("custom", { version: 1, blocks: [{ id: "image", type: "image", visible: true, imageUrl: "https://media.example.com/image.webp", alt: "Recipe result" }] }), undefined);
});