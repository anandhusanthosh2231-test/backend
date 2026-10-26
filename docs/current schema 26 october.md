# AI Recipes: platform structure and data schema

**Current as of: 26 October 2026**

This document explains the AI Recipes / TaskBakeAI codebase and recipe content model in plain language. It is intended to give an AI assistant such as Gemini enough project context to help create, edit, validate, or import recipe content without confusing the website, API, database, and CSV representations.

## 1. What the platform does

AI Recipes is a library of practical AI workflows. A recipe explains a task, collects any information needed from the user, assembles a reusable prompt, shows an example result, and can provide optional guidance such as workflow steps, output expectations, troubleshooting, verification, diagrams, and images.

There are three related representations of a recipe:

1. **Website/API representation** — the fields the frontend displays and the backend returns.
2. **Database representation** — normalized recipe records plus related category, audience, and engagement records.
3. **CSV import/export representation** — one recipe per CSV row; structured fields are JSON text inside individual cells.

These representations describe the same content, but are not interchangeable. For example, the database stores category and audience IDs, while CSV uses their human-readable names and the API returns names and slugs.

## 2. Platform architecture

```text
Browser
  ├─ Static website assets ──> Cloudflare Worker / Assets
  └─ /api/* requests ─────────> Cloudflare Worker proxy
                                   └─> Express API on Render
                                         └─> Drizzle ORM / node-postgres
                                               └─> PostgreSQL (Neon)
```

The Cloudflare Worker serves static frontend assets and forwards `/api/*` requests to the backend. It is not the database layer and does not run recipe SQL queries. The Express API handles HTTP requests, authentication/authorization, validation, and database operations. Drizzle maps TypeScript schema definitions to PostgreSQL.

### Workspace map

| Location | Responsibility |
| --- | --- |
| `artifacts/ai-recipes/` | React/Vite website, admin interface, and Cloudflare Worker entry point |
| `artifacts/ai-recipes/src/worker.ts` | Serves static assets and proxies `/api/*` to the API service |
| `artifacts/api-server/` | Express API routes, request validation, authentication, and server-side business logic |
| `artifacts/api-server/src/routes/recipes.ts` | Public recipe, member activity, taxonomy, and admin recipe endpoints |
| `artifacts/api-server/src/lib/recipe-csv-import.ts` | CSV parsing and mapping into recipe/taxonomy content |
| `artifacts/api-server/src/lib/recipe-csv-export.ts` | Converts recipe records into the version 2 CSV export |
| `lib/db/src/schema/` | Drizzle definitions for database tables and relations |
| `lib/db/src/index.ts` | PostgreSQL connection pool and Drizzle database instance |
| `lib/api-spec/openapi.yaml` | Source-of-truth HTTP API contract |
| `lib/api-client-react/` | Generated React Query API client |
| `lib/api-zod/` | Generated Zod request/response validation types |
| `scripts/` | Developer and maintenance scripts |
| `tests/e2e/` | Playwright browser tests |
| `docs/` | Human-readable project and data-format documentation |

### Request and code-generation flow

- Public and admin frontend requests use the generated React API client.
- API routes validate data and use Drizzle to query or update PostgreSQL.
- OpenAPI in `lib/api-spec/openapi.yaml` is the contract source of truth.
- If an API request or response shape changes, update OpenAPI first and regenerate clients with:

  ```bash
  pnpm --filter @workspace/api-spec run codegen
  ```

- Do not hand-edit files under generated API client/schema directories.

## 3. Recipe data model

The canonical database model is defined in `lib/db/src/schema/recipes.ts`. The API-facing recipe shapes are described in `lib/api-spec/openapi.yaml`.

### Main tables and relationships

| Table | Purpose |
| --- | --- |
| `recipes` | Main recipe content, publishing state, display settings, and engagement counters |
| `categories` | Recipe category names, unique URL slugs, and descriptions |
| `audiences` | Audience names, unique URL slugs, and descriptions |
| `recipe_audiences` | Many-to-many link between recipes and audiences |
| `saved_recipes` | Member bookmarks; one recipe can only be saved once per user |
| `recipe_history` | Member recipe viewing history |
| `events` | Recorded product events such as views, copies, shares, and searches |
| `feedback` | Helpful/unhelpful feedback and optional notes on recipes |
| `submissions` | Workflows submitted by users for review |
| `suggestions` | Search or content suggestions |

Every recipe has one required primary category (`category_id`) and one required primary audience (`audience_id`). A recipe may also be associated with multiple audiences through `recipe_audiences`. Keep the primary audience populated even when additional audiences are linked; existing editor/API behavior uses it as the primary value.

Categories and audiences are taxonomy records: recipe imports should refer to their names. The CSV importer can create missing taxonomy records during a successful commit. Preview mode does not persist taxonomy or recipes.

### Recipe field groups

The database stores the recipe's core content directly on `recipes`. Optional, richer presentation and prompt configuration is stored in the JSON `guide` column. The exact frontend/API shape can be found in the OpenAPI `Recipe` and `RecipeInput` schemas.

| Group | Fields | Meaning |
| --- | --- | --- |
| Identity | `id`, `title`, `slug` | Database ID, display name, and unique URL-safe identifier |
| Summary | `shortDescription`, `problem` | Brief user-facing summary and the problem the workflow solves |
| Taxonomy | `categoryId`, `audienceId`, `subcategory` | Primary category/audience references and a more specific grouping |
| Level and tools | `difficulty`, `estimatedTime`, `language`, `aiTools` | Expected effort, time, language, and compatible AI tools |
| Inputs and workflow | `requiredInputs`, `steps` | Simple input labels and ordered steps; richer prompt input definitions may be in `guide.promptVariables` |
| Prompt and example | `prompt`, `exampleInput`, `exampleOutput`, `refinementPrompts` | Reusable prompt template, example, and optional follow-up prompts |
| Quality | `verificationNotes`, `testedAt`, `testedWith`, `version` | Human verification guidance and test/version metadata |
| Discovery | `tags`, `featured`, `trending`, `recipeOfDay` | Search tags and homepage/shelf placement flags |
| Publishing | `status`, `publishedAt` | Workflow state and publication timestamp |
| Search metadata | `seoTitle`, `seoDescription` | Search engine title and description |
| Presentation | `layoutMode`, `layoutConfig`, `guide` | Normal/custom page mode, ordered layout blocks, and extended structured guidance |
| Engagement | `viewCount`, `copyCount`, `saveCount`, `shareCount`, feedback counters | Aggregated recipe activity; these are system-managed and should not be authored in CSV |
| Audit | `createdAt`, `updatedAt` | Database-managed creation and update timestamps |

### Status and content rules

- Common statuses are `DRAFT`, `TESTING`, and `PUBLISHED`; `IDEA` is also counted with drafts in admin metrics.
- A recipe should be published only after its content has been reviewed and tested.
- Recipe slugs must be unique.
- Category and audience IDs are database implementation details; CSV authors provide category/audience names instead.
- Engagement counters and database IDs are not recipe-authoring fields.
- Use `{{variable_name}}` tokens in a prompt template for user-provided values. Every declared prompt variable needs a corresponding input definition.

## 4. Extended guide and custom layouts

The `guide` JSON field holds optional structures that are too detailed for simple text columns. It may include prompt variables, situation choices, supported tools, output configuration, use cases, examples, safety notes, mistakes, pro tips, and custom-page content.

### Dynamic prompt inputs

Version 2 CSV supports separate JSON arrays for required and optional inputs:

- `required_inputs_json` makes every listed input required.
- `optional_inputs_json` makes every listed input optional.

An input object can contain:

| Property | Meaning |
| --- | --- |
| `name` | Stable variable key used by the prompt, such as `job_description` |
| `label` | Human-readable form label |
| `type` | `text`, `textarea`, `number`, `url`, `date`, `select`, `dropdown`, `checkbox`, or `file` |
| `placeholder` | Example or hint shown before the user enters a value |
| `helpText` | Supporting instructions |
| `defaultValue` | Optional initial value |
| `options` | Choices for `select` / `dropdown` inputs |
| `validation` | Optional bounds or pattern such as `minLength`, `maxLength`, `minimum`, `maximum`, or `pattern` |

Variable names must match `[A-Za-z_][A-Za-z0-9_.-]*`. The prompt uses the same name in double braces, for example `{{job_description}}`. A file input adds the selected file name to the prompt; it does not upload or attach the file.

### Output configuration

`output_config_json` may define the expected response structure:

```json
{
  "version": 1,
  "format": "steps",
  "description": "Return a draft followed by checks.",
  "fields": ["Draft", "Verification checklist"]
}
```

Supported formats are `text`, `list`, `table`, `json`, and `steps`.

### Custom layout

- `layoutMode` is `normal` or `custom`.
- A custom layout uses `layout_config_json`, a version 1 object with an ordered `blocks` array.
- Each block requires a supported `type` and a boolean `visible` flag. An `id` may be omitted in CSV; the importer assigns one.
- Layout configuration controls presentation/order. Recipe content stays in the normal recipe fields and `recipe_guide_json.customContent`.
- Optional content blocks are not shown on the public page when their content is empty.
- Supported block types are declared in the OpenAPI `RecipeLayoutBlock` schema. Check that schema before inventing new types or properties.

Custom content may include troubleshooting tips, a verification checklist, a Mermaid workflow diagram, and image records. Images must use HTTP(S) URLs and include alt text.

## 5. Recipe CSV version 2

The admin import/export workflow supports older CSV files and version 2 files. Version 2 has **one recipe per row**. Each JSON field is a single CSV cell containing valid JSON text.

### CSV control columns

| Column | Rule |
| --- | --- |
| `csv_schema_version` | Use `2` for this format. Omit it for legacy input. Other explicit versions are rejected. |
| `csv_action` | `create` by default. Use `update` only when intentionally replacing the editable content of an existing recipe with the same slug. |

The normal recipe columns remain valid, including title, slug, description, problem, category, target audience, subcategory, difficulty, time, language, tools, inputs, steps, prompt, examples, refinements, verification, tags, publishing flags, version/test metadata, and SEO fields.

### Structured version 2 columns

| Column | Expected value |
| --- | --- |
| `required_inputs_json` | JSON array of required input objects |
| `optional_inputs_json` | JSON array of optional input objects |
| `workflow_steps_json` | JSON array of step strings; when present it overrides `Steps to Execute` |
| `output_config_json` | Version 1 output configuration object |
| `layout_config_json` | Version 1 object with ordered presentation blocks |
| `troubleshooting_json` | JSON array of actionable recovery tips |
| `verification_checklist_json` | JSON array of checks to perform before relying on the result |
| `workflow_diagram_mermaid` | Optional Mermaid diagram source |
| `images_json` | JSON array of image objects with `url`, required `alt`, and optional `caption` |
| `recipe_guide_json` | Optional complete guide JSON for export/import round trips; explicit input/output columns take precedence for their corresponding settings |

Legacy list cells accept comma, semicolon, pipe, or newline delimiters, or a JSON array. For version 2, prefer JSON arrays so punctuation inside list values is preserved.

### CSV quoting

CSV follows RFC 4180 rules:

- Quote any cell containing a comma, quote, or line break.
- Escape a quote inside a quoted cell by doubling it.
- JSON inside a CSV cell must therefore have its quotes doubled.
- Keep exactly one header row and one recipe per subsequent row.

Example of one JSON cell encoded in CSV:

```csv
"[""ChatGPT"",""Claude""]"
```

### Import safety

1. The admin UI uploads the CSV in preview mode first.
2. Preview validates and reports each row but does not write recipes or taxonomy.
3. Any invalid row blocks committing the import.
4. A new slug is created by default; an existing slug is not silently overwritten.
5. An existing slug is updated only when `csv_action` is explicitly `update`.
6. A successful commit writes recipes and taxonomy changes transactionally.
7. Use **Export CSV** to download recipes in version 2 format. Before importing an exported row over an existing recipe, change its action from `create` to `update`.

See [`recipe-csv-v2.md`](./recipe-csv-v2.md) for the concise field reference and complete example row.

## 6. Content authoring checklist for Gemini

When creating or editing recipe content for this project:

1. Return content that fits the platform's existing fields; do not invent database columns or API properties.
2. Give each recipe a unique, lowercase, hyphen-separated slug.
3. Use category and audience **names** in CSV; do not guess their numeric database IDs.
4. Make the problem, short description, prompt, and examples consistent with one another.
5. For every `{{token}}` in the prompt, provide exactly one matching input definition with the same `name`.
6. Keep required and optional inputs in their respective JSON columns, and use the supported input types.
7. Use valid JSON in every `*_json` cell; encode lists as JSON arrays instead of delimiter-separated text when possible.
8. Keep layout JSON limited to supported presentation blocks. Put actual recipe guidance/content in recipe fields or guide custom content, not in invented layout properties.
9. Supply accurate example input/output, useful refinement suggestions, and practical verification checks.
10. Do not fabricate testing dates, model test claims, database IDs, engagement counts, or publication approval.
11. Use `DRAFT` unless the user explicitly asks for reviewed/published content and the workflow permits that status.
12. Before writing a CSV, make sure the header is unique, every row has the same number of cells, and all embedded JSON parses.
13. For updates, set `csv_action` to `update` and preserve the existing slug. Otherwise use `create`.

## 7. Sources of truth

If this guide and implementation disagree, follow the implementation in this order:

1. Database structure: `lib/db/src/schema/recipes.ts`
2. API request/response contract: `lib/api-spec/openapi.yaml`
3. CSV mapping and export behavior: `artifacts/api-server/src/lib/recipe-csv-import.ts` and `artifacts/api-server/src/lib/recipe-csv-export.ts`
4. This document and `docs/recipe-csv-v2.md`: explanations for people and AI content-generation tools

Do not change generated files directly. Make implementation changes in the source schema/contracts and regenerate outputs using the repository's documented commands.
