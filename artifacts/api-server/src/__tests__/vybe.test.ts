import test from "node:test";
import assert from "node:assert/strict";
import { isVybePublicEnabled, vybeCreationInputSchema } from "../lib/vybe.ts";

const baseCreation = {
  title: "Luminous city",
  slug: "luminous-city",
  shortDescription: "A quiet city suspended in blue light.",
  description: "An atmospheric visual prompt for a distant future.",
  contentType: "image",
};

test("VYBE public access requires explicit launch configuration", () => {
  assert.equal(isVybePublicEnabled("false"), false);
  assert.equal(isVybePublicEnabled(""), false);
  assert.equal(isVybePublicEnabled(" true "), true);
});

test("VYBE validation supports flexible content without productivity fields", () => {
  const parsed = vybeCreationInputSchema.safeParse({
    ...baseCreation,
    contentType: "custom",
    extraData: { renderingEngine: "custom shader", seed: 127 },
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(parsed.data.extraData, { renderingEngine: "custom shader", seed: 127 });
    assert.deepEqual(parsed.data.tags, []);
  }
});

test("video prompts require scene and motion details", () => {
  const incomplete = vybeCreationInputSchema.safeParse({ ...baseCreation, contentType: "video" });
  assert.equal(incomplete.success, false);

  const complete = vybeCreationInputSchema.safeParse({
    ...baseCreation,
    contentType: "video",
    scene: "A glass train passes through a cloud.",
    motion: "Slow lateral drift.",
    durationSeconds: 8,
    videoUrl: "https://ik.imagekit.io/demo/train.mp4",
  });
  assert.equal(complete.success, true);
});

test("interactive creations require a verified HTTPS playable URL", () => {
  const incomplete = vybeCreationInputSchema.safeParse({
    ...baseCreation,
    contentType: "interactive",
  });
  assert.equal(incomplete.success, false);

  const complete = vybeCreationInputSchema.safeParse({
    ...baseCreation,
    contentType: "interactive",
    experienceUrl: "https://play.example.com/experience",
    verificationDetails: "Opened on desktop and mobile and verified keyboard/touch controls.",
    experienceControls: ["WASD", "Touch"],
  });
  assert.equal(complete.success, true);
});

test("published app and game prompts require verification details", () => {
  const parsed = vybeCreationInputSchema.safeParse({
    ...baseCreation,
    contentType: "game",
    status: "PUBLISHED",
    builderInstructions: "Create a small playable puzzle.",
  });
  assert.equal(parsed.success, false);
});

test("VYBE media URLs must use HTTPS", () => {
  const parsed = vybeCreationInputSchema.safeParse({
    ...baseCreation,
    imageUrl: "http://cdn.example.com/image.webp",
  });
  assert.equal(parsed.success, false);
});
