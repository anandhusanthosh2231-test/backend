import type { Recipe } from "@workspace/db";

export type RecipeCsvExportRow = {
  recipe: Recipe;
  category: string;
  audience: string;
  audiences: string[];
};

const headers = [
  "csv_schema_version", "csv_action", "Recipe Title", "URL Slug", "Short Description", "Problem", "Category",
  "Target Audience", "Subcategory", "Difficulty", "Estimated Time", "Language", "AI Tools",
  "Required Inputs", "Steps to Execute", "Prompt Template", "Example Input", "Example Output",
  "Refinement Prompts", "Verification & Testing Notes", "Tags", "Publishing Status",
  "Featured on Shelves", "Mark as Trending", "Recipe of the Day", "Version", "Tested Date",
  "Tested With", "SEO Title", "SEO Description", "required_inputs_json", "optional_inputs_json",
  "workflow_steps_json", "output_config_json", "layout_config_json", "troubleshooting_json",
  "verification_checklist_json", "workflow_diagram_mermaid", "images_json", "recipe_guide_json",
];

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildRecipeCsvExport(rows: RecipeCsvExportRow[]): string {
  const dataRows = rows.map(({ recipe, category, audience, audiences }) => {
    const guide = recipe.guide && typeof recipe.guide === "object"
      ? recipe.guide as Record<string, unknown>
      : {};
    const variables = Array.isArray(guide.promptVariables) ? guide.promptVariables : [];
    const typedInputs = variables.filter((input): input is Record<string, unknown> =>
      Boolean(input) && typeof input === "object" && !Array.isArray(input),
    );
    const requiredInputs = typedInputs.filter((input) => input.required !== false);
    const optionalInputs = typedInputs.filter((input) => input.required === false);
    const row = [
      "2", "create", recipe.title, recipe.slug, recipe.shortDescription, recipe.problem, category,
      JSON.stringify(audiences.length ? audiences : [audience]),
      recipe.subcategory, recipe.difficulty, recipe.estimatedTime, recipe.language,
      JSON.stringify(recipe.aiTools), JSON.stringify(recipe.requiredInputs), JSON.stringify(recipe.steps),
      recipe.prompt, recipe.exampleInput, recipe.exampleOutput, JSON.stringify(recipe.refinementPrompts),
      recipe.verificationNotes, JSON.stringify(recipe.tags), recipe.status, recipe.featured, recipe.trending,
      recipe.recipeOfDay, recipe.version, recipe.testedAt, JSON.stringify(recipe.testedWith),
      recipe.seoTitle, recipe.seoDescription,
      typedInputs.length ? JSON.stringify(requiredInputs) : "",
      typedInputs.length ? JSON.stringify(optionalInputs) : "",
      JSON.stringify(recipe.steps), guide.outputConfig ? JSON.stringify(guide.outputConfig) : "",
      recipe.layoutMode === "custom" ? JSON.stringify(recipe.layoutConfig) : "",
      Array.isArray((guide.customContent as Record<string, unknown> | undefined)?.troubleshooting)
        ? JSON.stringify((guide.customContent as Record<string, unknown>).troubleshooting)
        : "",
      Array.isArray((guide.customContent as Record<string, unknown> | undefined)?.verificationChecklist)
        ? JSON.stringify((guide.customContent as Record<string, unknown>).verificationChecklist)
        : "",
      typeof (guide.customContent as Record<string, unknown> | undefined)?.workflowDiagram === "string"
        ? (guide.customContent as Record<string, unknown>).workflowDiagram
        : "",
      Array.isArray((guide.customContent as Record<string, unknown> | undefined)?.images)
        ? JSON.stringify((guide.customContent as Record<string, unknown>).images)
        : "",
      recipe.guide ? JSON.stringify(recipe.guide) : "",
    ];
    return row.map(csvEscape).join(",");
  });

  return [
    headers.map(csvEscape).join(","),
    ...dataRows,
  ].join("\r\n");
}
