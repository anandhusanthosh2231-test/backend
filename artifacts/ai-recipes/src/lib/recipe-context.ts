export interface RecipeContext {
  mainTopic: string;
  context: string;
  targetAudience: string;
  tone: string;
}

export function createRecipeContext(
  mainTopic = "",
  targetAudience = "",
): RecipeContext {
  return {
    mainTopic,
    context: "",
    targetAudience,
    tone: "English Professional",
  };
}

export function buildRecipeContextInstructions(context: RecipeContext): string {
  const contextDetails: [string, string][] = [
    ["Main topic", context.mainTopic],
    ["Context", context.context],
    ["Target audience", context.targetAudience],
    ["Tone", context.tone],
  ];
  const details = contextDetails
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}: ${value.trim()}`);

  return [
    "Adapt this recipe to the following context:",
    ...details,
    "",
    "Guidance:",
    "- Understand the topic and context before responding.",
    "- Make the result practical for the user's location. Adapt currency, units, dates, terminology, examples, and regulations to their context when provided.",
    "- If the user's location is unknown, use globally understandable examples and note when details may vary by region.",
    "- Write in the requested language and style; users may specify any language or mix of languages.",
    "- Structure the response with an Overview (2-3 lines), Main content with actionable steps, templates, and examples, Quick tips, and Next actions.",
    "- Avoid generic advice; make the result ready to use for the intended audience, including students, freshers, job seekers, or professionals where relevant.",
  ].join("\n");
}
