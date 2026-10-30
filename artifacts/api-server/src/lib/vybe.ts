import { z } from "zod/v4";

export const vybeContentTypes = [
  "image",
  "video",
  "art",
  "design",
  "3d",
  "app",
  "game",
  "interactive",
  "custom",
] as const;

const httpsUrl = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "Use a valid HTTPS URL.");

const assetSchema = z.object({
  assetId: z.string().trim().max(200).optional(),
  url: httpsUrl,
  alt: z.string().trim().max(500).default(""),
  type: z.enum(["image", "video"]).default("image"),
  caption: z.string().trim().max(500).default(""),
});

const stringArray = (maxItems = 30, maxLength = 100) =>
  z.array(z.string().trim().min(1).max(maxLength)).max(maxItems).default([]);

export const vybeCreationInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
  shortDescription: z.string().trim().min(1).max(280),
  description: z.string().trim().min(1).max(12000),
  category: z.string().trim().min(1).max(80).default("Images"),
  contentType: z.enum(vybeContentTypes),
  model: z.string().trim().max(160).default(""),
  models: stringArray(20, 100),
  prompt: z.string().max(20000).default(""),
  negativePrompt: z.string().max(10000).default(""),
  style: z.string().trim().max(500).default(""),
  aspectRatio: z.string().trim().max(40).default(""),
  parameters: z.record(z.string(), z.unknown()).default({}),
  scene: z.string().max(10000).default(""),
  motion: z.string().max(10000).default(""),
  cameraInstructions: z.string().max(10000).default(""),
  durationSeconds: z.number().int().min(1).max(3600).nullable().default(null),
  videoUrl: httpsUrl.default(""),
  posterUrl: httpsUrl.default(""),
  visualReferences: z.array(assetSchema).max(30).default([]),
  exampleOutputs: z.array(assetSchema).max(30).default([]),
  refinementInstructions: z.string().max(10000).default(""),
  builderInstructions: z.string().max(20000).default(""),
  tools: stringArray(30, 100),
  demoUrl: httpsUrl.default(""),
  verificationDetails: z.string().max(10000).default(""),
  experienceUrl: httpsUrl.default(""),
  experienceControls: stringArray(30, 200),
  mediaAssets: z.array(assetSchema).max(50).default([]),
  extraData: z.record(z.string(), z.unknown()).default({}),
  imageUrl: httpsUrl.default(""),
  imageAlt: z.string().trim().max(500).default(""),
  tags: stringArray(30, 50),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  featured: z.boolean().default(false),
  featuredPosition: z.number().int().min(0).max(10000).default(0),
  trending: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.contentType === "video") {
    if (!value.scene.trim()) context.addIssue({ code: "custom", path: ["scene"], message: "Add the video scene." });
    if (!value.motion.trim()) context.addIssue({ code: "custom", path: ["motion"], message: "Add the motion direction." });
  }
  if (value.contentType === "app" || value.contentType === "game") {
    if (!value.builderInstructions.trim()) {
      context.addIssue({ code: "custom", path: ["builderInstructions"], message: "Add builder instructions for app and game prompts." });
    }
    if (value.status === "PUBLISHED" && !value.verificationDetails.trim()) {
      context.addIssue({ code: "custom", path: ["verificationDetails"], message: "Document how this published app or game prompt was verified." });
    }
  }
  if (value.contentType === "interactive" && !value.experienceUrl) {
    context.addIssue({ code: "custom", path: ["experienceUrl"], message: "An interactive experience requires a real playable HTTPS URL." });
  }
  if (value.contentType === "interactive" && !value.verificationDetails.trim()) {
    context.addIssue({ code: "custom", path: ["verificationDetails"], message: "Document how the interactive experience was verified." });
  }
});

export type VybeCreationInput = z.infer<typeof vybeCreationInputSchema>;

export function isVybePublicEnabled(value = process.env.VYBE_ENABLED): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "content"}: ${issue.message}`)
    .join(" ");
}
