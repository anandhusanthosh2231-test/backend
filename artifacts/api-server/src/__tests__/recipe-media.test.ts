import test from "node:test";
import assert from "node:assert/strict";
import { validateRecipeImage } from "../lib/recipe-media.ts";

test("accepts an allowed image only when its bytes match the declared format", () => {
  assert.equal(validateRecipeImage(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg"), "image/jpeg");
  assert.throws(() => validateRecipeImage(Buffer.from("not an image"), "image/jpeg"), /allowed image format or size/);
  assert.throws(() => validateRecipeImage(Buffer.from("<svg/>", "utf8"), "image/svg+xml"), /allowed image format or size/);
});

test("enforces the configured image size limit", () => {
  const previous = process.env.R2_MAX_FILE_SIZE_BYTES;
  process.env.R2_MAX_FILE_SIZE_BYTES = "1024";
  try {
    const bytes = Buffer.alloc(1025);
    bytes.set([0xff, 0xd8, 0xff]);
    assert.throws(() => validateRecipeImage(bytes, "image/jpeg"), /allowed image format or size/);
  } finally {
    if (previous === undefined) delete process.env.R2_MAX_FILE_SIZE_BYTES;
    else process.env.R2_MAX_FILE_SIZE_BYTES = previous;
  }
});