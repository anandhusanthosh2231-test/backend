import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  createImageKitUploadAuth,
  normalizeImageKitFolder,
  validateImageKitAssetInput,
} from "../lib/imagekit.ts";

const config = {
  publicKey: "public_example",
  privateKey: "private_test_key",
  urlEndpoint: "https://ik.imagekit.io/example",
  maxFileSizeBytes: 20 * 1024 * 1024,
};

test("creates a short-lived ImageKit signature without returning the private key", () => {
  const auth = createImageKitUploadAuth(config, 1_700_000_000);
  const expected = createHmac("sha1", config.privateKey)
    .update(`${auth.token}${auth.expire}`)
    .digest("hex");

  assert.equal(auth.expire, 1_700_001_800);
  assert.equal(auth.signature, expected);
  assert.equal(auth.publicKey, config.publicKey);
  assert.equal("privateKey" in auth, false);
});

test("normalizes folder separators and rejects traversal", () => {
  assert.equal(normalizeImageKitFolder("\\recipes\\art\\"), "/recipes/art");
  assert.throws(() => normalizeImageKitFolder("/recipes/../private"), /invalid path/);
});

test("validates ImageKit asset metadata and normalizes tags", () => {
  const asset = validateImageKitAssetInput({
    fileId: "asset_123",
    filePath: "/recipes/scene.webp",
    url: "https://ik.imagekit.io/example/recipes/scene.webp",
    name: "scene.webp",
    size: 1024,
    fileType: "image",
    alt: "  Blue mountain at dusk ",
    tags: ["art", "night", "art"],
  });

  assert.deepEqual(asset, {
    fileId: "asset_123",
    filePath: "/recipes/scene.webp",
    url: "https://ik.imagekit.io/example/recipes/scene.webp",
    name: "scene.webp",
    size: 1024,
    fileType: "image",
    alt: "Blue mountain at dusk",
    tags: ["art", "night"],
  });
  assert.equal(validateImageKitAssetInput({
    fileId: "asset_123",
    filePath: "/recipes/scene.svg",
    url: "http://ik.imagekit.io/example/scene.svg",
    name: "scene.svg",
    size: 1024,
    fileType: "image",
    alt: "",
    tags: [],
  }), undefined);
});

test("validates a supported ImageKit video asset", () => {
  const asset = validateImageKitAssetInput({
    fileId: "video_123",
    filePath: "/vybe/loop.mp4",
    url: "https://ik.imagekit.io/example/vybe/loop.mp4",
    name: "loop.mp4",
    size: 1024,
    fileType: "non-image",
    alt: "Looping color animation",
    tags: ["vybe", "motion"],
  });
  assert.equal(asset?.fileType, "non-image");
  assert.equal(validateImageKitAssetInput({
    fileId: "video_456",
    filePath: "/vybe/loop.exe",
    url: "https://ik.imagekit.io/example/vybe/loop.exe",
    name: "loop.exe",
    size: 1024,
    fileType: "non-image",
    alt: "",
    tags: [],
  }), undefined);
});
