import { z } from "zod/v4";

const recipeLayoutBlockSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum([
    "hero", "overview", "richText", "field", "inputs", "workflow", "prompt", "example",
    "output", "outcome", "image", "images", "diagram", "refinements", "troubleshooting",
    "callout", "tools", "useCases", "mistakes", "verification", "related",
  ]),
  visible: z.boolean(),
  heading: z.string().max(200).optional(),
  subtitle: z.string().max(500).optional(),
  align: z.enum(["left", "center"]).optional(),
  width: z.enum(["standard", "wide"]).optional(),
  background: z.enum(["plain", "tint", "dark"]).optional(),
  title: z.string().max(300).optional(),
  description: z.string().max(4000).optional(),
  content: z.string().max(20000).optional(),
  imageUrl: z.string().max(2048).optional(),
  alt: z.string().max(500).optional(),
  caption: z.string().max(500).optional(),
  variant: z.enum(["tip", "warning", "info"]).optional(),
  fieldRef: z.enum([
    "title", "shortDescription", "problem", "requiredInputs", "steps", "prompt",
    "exampleInput", "exampleOutput", "verificationNotes", "aiTools", "tags",
    "guide.expectedOutput.description", "guide.proTips", "guide.safetyNotes",
  ]).optional(),
}).strict();

export const recipeLayoutConfigSchema = z.object({
  version: z.literal(1),
  blocks: z.array(recipeLayoutBlockSchema).max(50),
}).strict().superRefine((layout, context) => {
  const ids = new Set<string>();
  for (const [index, block] of layout.blocks.entries()) {
    if (ids.has(block.id)) {
      context.addIssue({ code: "custom", path: ["blocks", index, "id"], message: "Block IDs must be unique." });
    }
    ids.add(block.id);

    if (block.type === "field" && !block.fieldRef) {
      context.addIssue({ code: "custom", path: ["blocks", index, "fieldRef"], message: "Field blocks must reference a recipe field." });
    }
    if (block.type !== "field" && block.fieldRef) {
      context.addIssue({ code: "custom", path: ["blocks", index, "fieldRef"], message: "Only field blocks can reference a recipe field." });
    }

    if (block.imageUrl) {
      try {
        const protocol = new URL(block.imageUrl).protocol;
        if (protocol !== "https:" && protocol !== "http:") throw new Error("Unsupported image URL protocol.");
      } catch {
        context.addIssue({ code: "custom", path: ["blocks", index, "imageUrl"], message: "Images must use an HTTP or HTTPS URL." });
      }
      if ((block.type === "image" || block.type === "hero") && !block.alt?.trim()) {
        context.addIssue({ code: "custom", path: ["blocks", index, "alt"], message: "Add alt text for this image." });
      }
    }
  }
});

export function validateRecipeLayout(
  mode: "normal" | "custom" | undefined,
  config: unknown,
): string | undefined {
  if (config !== undefined && config !== null) {
    const result = recipeLayoutConfigSchema.safeParse(config);
    if (!result.success) return result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  }
  if (mode === "custom" && !config) return "Custom layouts require a valid layout configuration.";
  return undefined;
}