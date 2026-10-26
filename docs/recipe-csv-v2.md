# Recipe CSV schema v2

The admin recipe CSV workflow accepts legacy spreadsheets and version 2 files. Version 2 is one recipe per row; simple lists and nested records are JSON encoded inside their CSV cells. CSV quoting must follow RFC 4180, so quote a cell containing commas or line breaks and double any embedded `"` characters.

## Version 2 fields

The regular recipe columns remain supported: `Recipe Title`, `URL Slug`, `Short Description`, `Problem`, `Category`, `Target Audience`, `Subcategory`, `Difficulty`, `Estimated Time`, `Language`, `AI Tools`, `Required Inputs`, `Steps to Execute`, `Prompt Template`, `Example Input`, `Example Output`, `Refinement Prompts`, `Verification & Testing Notes`, `Tags`, publishing flags, version/test metadata, and SEO fields.

| Column | JSON shape / behavior |
| --- | --- |
| `csv_schema_version` | Must be `2`; omit it for legacy CSV. |
| `csv_action` | `create` (default) refuses an existing slug. Set to `update` to explicitly replace that recipe's editable content. Updates require a matching existing slug. |
| `required_inputs_json` | Array of input objects; importer sets `required: true`. |
| `optional_inputs_json` | Array of input objects; importer sets `required: false`. |
| `workflow_steps_json` | Array of step strings; takes precedence over `Steps to Execute`. |
| `output_config_json` | Versioned output configuration: `{ "version": 1, "format": "text|list|table|json|steps", "description": "...", "fields": [...] }`. |
| `layout_config_json` | Version 1 layout configuration with ordered `blocks`; each block needs a supported `type` and `visible` flag. Missing IDs are assigned during import. |
| `troubleshooting_json` | JSON array of actionable recovery tips. |
| `verification_checklist_json` | JSON array of checks users should complete before relying on the output. |
| `workflow_diagram_mermaid` | Optional Mermaid source text. The public recipe renders it as a diagram using strict Mermaid security settings. |
| `images_json` | JSON array of `{ "url": "https://…", "alt": "…", "caption": "…" }` image records. URLs must be HTTP(S), and alt text is required. Imported images remain available in legacy `customContent.images` and are also used as `imagesJson` when the full guide does not define that newer field. |
| `recipe_guide_json` | Optional complete guide JSON for round trips; includes visual prompt `promptType`, `imagesJson`, and `promptStudio` metadata. Structured input/output columns override their corresponding dynamic input/output settings when supplied. |

Each input object supports `name`, `label`, `type`, `placeholder`, `helpText`, `required`, `defaultValue`, `options`, and `validation`. Input types are `text`, `textarea`, `number`, `url`, `date`, `select`, `dropdown` (legacy alias), `checkbox`, and `file`. File inputs add only the selected file name to the prompt; they do not upload the selected file. Validation supports `minLength`, `maxLength`, `minimum`, `maximum`, and `pattern`. Names must match `[A-Za-z_][A-Za-z0-9_.-]*`, and every declared prompt token must have a matching input.

Visual prompts set `promptType` to `image`, `game`, or `website` inside `recipe_guide_json`; omit it or set it to `text` for the existing standard recipe view. `promptStudio` stores optional subtype metadata such as image style/model/aspect ratio, game genre/platform/engine, or website framework/style/preview URL. Visual image references use `imagesJson` in the guide and can also be supplied through the existing `images_json` column.

Custom-layout recipes keep page content in recipe fields and `recipe_guide_json.customContent`; `layout_config_json` contains presentation only. Custom content supports `troubleshooting`, `verificationChecklist`, `workflowDiagram`, and `images`. Layout block types include `outcome`, `refinements`, `troubleshooting`, `diagram`, and `images` in addition to the existing types. Optional blocks are omitted from public pages when they have no content. Existing image and hero blocks with image URLs remain supported.

## Example row

```csv
csv_schema_version,Recipe Title,URL Slug,Short Description,Problem,Category,Target Audience,Subcategory,Difficulty,Estimated Time,Language,AI Tools,Required Inputs,Steps to Execute,Prompt Template,Example Input,Example Output,Refinement Prompts,Verification & Testing Notes,Tags,Publishing Status,required_inputs_json,optional_inputs_json,workflow_steps_json,output_config_json,layout_config_json
2,Resume Tailor,resume-tailor,Tailor a resume to a job description,Generic resumes miss role requirements,Writing,Job seekers,Applications,Beginner,10 min,English,"[""ChatGPT""]",,"[""Review the job description"",""Identify matching experience""]","Tailor this resume: {{resume}} to this job: {{job_description}}. Use a {{tone}} tone.",Resume and job description,Targeted resume,[],Verify all claims remain accurate,career;resume,DRAFT,"[{""name"":""resume"",""label"":""Current resume"",""type"":""textarea"",""helpText"":""Remove contact details before pasting.""},{""name"":""job_description"",""label"":""Job description"",""type"":""textarea""}]","[{""name"":""tone"",""label"":""Tone"",""type"":""dropdown"",""defaultValue"":""Professional"",""options"":[""Professional"",""Concise""]}]","[""Review the job description"",""Identify matching experience"",""Tailor the resume""]","{""version"":1,""format"":""steps"",""description"":""Return a revised resume followed by a verification checklist."",""fields"":[""Revised resume"",""Verification checklist""]}","{""version"":1,""blocks"":[{""type"":""hero"",""visible"":true},{""type"":""inputs"",""visible"":true},{""type"":""prompt"",""visible"":true},{""type"":""output"",""visible"":true},{""type"":""field"",""fieldRef"":""verificationNotes"",""visible"":true}]}"
```

## Downloadable template

Use **Download CSV template** in the admin recipe shelf to get a version 2 custom-layout starter file. Fill the recipe content and taxonomy columns; the taxonomy names must already exist in the workspace. The template includes the standard action-first block order and can be imported through the existing preview-first workflow.

## Import safety and export

The admin upload first returns a row-by-row preview. Any invalid row blocks the entire commit; the importer creates or updates no taxonomy or recipe records in preview mode. Existing recipe slugs are never overwritten unless a row explicitly sets `csv_action` to `update`. A successful commit writes all recipe and taxonomy changes in one transaction. Failed rows can be downloaded as a CSV error report. Use **Export CSV** in the admin recipe shelf to export all recipes in version 2 format. Change a row's action to `update` before importing it back over an existing recipe.

Legacy list cells continue to accept comma-, semicolon-, pipe-, or newline-separated values (or JSON arrays). Legacy records without dynamic input or layout fields retain their existing normal-layout behavior.
