import { parse } from "csv-parse/sync";
import { vybeContentTypes, vybeCreationInputSchema, type VybeCreationInput } from "./vybe.ts";

export const VYBE_CSV_SCHEMA_VERSION = "1";
export const VYBE_CSV_MAX_BYTES = 5 * 1024 * 1024;
export const VYBE_CSV_MAX_ROWS = 500;

export type VybeCsvFieldType = "string" | "boolean" | "integer" | "integer|null" | "array<json>" | "object<json>" | "enum";
export type VybeCsvRowError = { row: number; column: string; message: string };
export type VybeCsvRow = { row: number; slug: string; data?: VybeCreationInput; errors: VybeCsvRowError[]; warnings: string[] };

const shape = vybeCreationInputSchema.shape;
const fields = Object.keys(shape) as Array<keyof typeof shape>;
const protectedFields = new Set(["id", "createdAt", "updatedAt", "publishedAt"]);

function fieldType(field: keyof typeof shape): VybeCsvFieldType {
  const schema = shape[field];
  if (field === "contentType" || field === "status") return "enum";
  if (schema.safeParse([]).success) return "array<json>";
  if (schema.safeParse({}).success) return "object<json>";
  if (schema.safeParse(false).success) return "boolean";
  if (schema.safeParse(1).success) {
    return schema.safeParse(null).success ? "integer|null" : "integer";
  }
  return "string";
}

function required(field: keyof typeof shape): boolean {
  return !shape[field].safeParse(undefined).success;
}

export function getVybeCsvSchema() {
  const fieldsDescription = fields.map((name) => {
    const type = fieldType(name);
    const definition = {
      name,
      type,
      required: required(name),
      ...(name === "contentType" ? { values: vybeContentTypes } : {}),
      ...(name === "status" ? { values: ["DRAFT", "PUBLISHED", "ARCHIVED"] } : {}),
    };
    return definition;
  });
  return {
    version: VYBE_CSV_SCHEMA_VERSION,
    maxBytes: VYBE_CSV_MAX_BYTES,
    maxRows: VYBE_CSV_MAX_ROWS,
    strategies: ["create-only", "update-existing", "upsert"],
    fields: fieldsDescription,
    protectedFields: [...protectedFields],
  };
}

function encodeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const safe = /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvRow(values: unknown[]): string {
  return values.map(encodeCsvCell).join(",");
}

export function buildVybeCsv(rows: Array<Record<string, unknown>>): string {
  const timestampFields = ["createdAt", "updatedAt", "publishedAt"];
  const headers = ["csv_schema_version", ...fields.map(String), ...timestampFields];
  return [
    csvRow(headers),
    ...rows.map((row) => csvRow([
      VYBE_CSV_SCHEMA_VERSION,
      ...fields.map((field) => row[field]),
      ...timestampFields.map((field) => row[field]),
    ])),
  ].join("\r\n");
}

export function buildVybeCsvTemplate(): string {
  return buildVybeCsv([]);
}

export function normalizeVybeCsvHeader(value: string): string {
  return value.trim().replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function parseField(field: keyof typeof shape, raw: string): unknown {
  const schema = shape[field];
  const unescaped = /^'(?=[\s]*[=+\-@])/.test(raw) ? raw.slice(1) : raw;
  if (!raw.trim()) {
    const empty = schema.safeParse(undefined);
    if (empty.success) return empty.data;
  }

  const type = fieldType(field);
  if (type === "array<json>" || type === "object<json>") {
    try {
      return JSON.parse(unescaped);
    } catch {
      throw new Error("Must contain valid JSON.");
    }
  }
  if (type === "boolean") {
    const value = unescaped.trim().toLowerCase();
    if (["true", "1", "yes"].includes(value)) return true;
    if (["false", "0", "no"].includes(value)) return false;
    throw new Error("Use true or false.");
  }
  if (type === "integer" || type === "integer|null") {
    const value = unescaped.trim();
    if (!value && type === "integer|null") return null;
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error("Must be a whole number.");
    return number;
  }
  return type === "enum" ? unescaped.trim() : unescaped;
}

function parseMatrix(csv: string): string[][] {
  if (Buffer.byteLength(csv, "utf8") > VYBE_CSV_MAX_BYTES) {
    throw new Error(`CSV files must be no larger than ${VYBE_CSV_MAX_BYTES / 1024 / 1024} MB.`);
  }
  const rows = parse(csv, {
    bom: true,
    skip_empty_lines: false,
    relax_column_count: false,
    max_record_size: 100_000,
    trim: false,
  }) as string[][];
  if (rows.length < 2) throw new Error("The CSV must include a header row and at least one data row.");
  if (rows.length - 1 > VYBE_CSV_MAX_ROWS) throw new Error(`A VYBE CSV import can contain at most ${VYBE_CSV_MAX_ROWS} rows.`);
  const headers = rows[0].map((header) => String(header ?? ""));
  if (headers.some((header) => !header.trim())) throw new Error("CSV headers cannot be empty.");
  const normalizedHeaders = headers.map(normalizeVybeCsvHeader);
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new Error("CSV headers must be unique after normalization.");
  }
  return rows;
}

export function parseAndValidateVybeCsv(csv: string, mapping: Record<string, string> = {}): VybeCsvRow[] {
  const matrix = parseMatrix(csv);
  const headers = matrix[0].map((header) => String(header ?? ""));
  const normalized = headers.map(normalizeVybeCsvHeader);
  const canonicalByHeader = new Map(fields.map((field) => [normalizeVybeCsvHeader(String(field)), String(field)]));
  const sourceByField = new Map<string, number>();

  for (const field of fields) {
    const mappedHeader = mapping[String(field)];
    const sourceIndex = mappedHeader
      ? headers.findIndex((header) => header === mappedHeader)
      : normalized.findIndex((header) => canonicalByHeader.get(header) === String(field));
    if (sourceIndex >= 0) sourceByField.set(String(field), sourceIndex);
  }
  if (!sourceByField.has("title") || !sourceByField.has("slug")) {
    throw new Error("Map CSV columns to both Title and Slug before validating.");
  }

  const seenSlugs = new Set<string>();
  const result: VybeCsvRow[] = [];
  for (let index = 1; index < matrix.length; index += 1) {
    const cells = matrix[index];
    if (cells.every((cell) => !String(cell ?? "").trim())) continue;
    const rowNumber = index + 1;
    const raw: Record<string, string> = {};
    for (const [field, sourceIndex] of sourceByField) raw[field] = String(cells[sourceIndex] ?? "");
    const data: Record<string, unknown> = {};
    const errors: VybeCsvRowError[] = [];
    const warnings: string[] = headers.some((header) => protectedFields.has(
      canonicalByHeader.get(normalizeVybeCsvHeader(header)) ?? "",
    ))
      ? ["System-managed timestamps were ignored."]
      : [];

    for (const [field, value] of Object.entries(raw)) {
      if (protectedFields.has(field)) {
        warnings.push(`${field} is system-managed and was ignored.`);
        continue;
      }
      try {
        data[field] = parseField(field as keyof typeof shape, value);
      } catch (error) {
        errors.push({ row: rowNumber, column: field, message: error instanceof Error ? error.message : "Invalid value." });
      }
    }

    if (typeof data.slug === "string") {
      const slug = data.slug.trim().toLowerCase()
        .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      data.slug = slug;
    }

    const parsed = vybeCreationInputSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const column = String(issue.path[0] ?? "record");
        errors.push({ row: rowNumber, column, message: issue.message });
      }
    }

    const slug = typeof data.slug === "string" ? data.slug : "";
    if (slug && seenSlugs.has(slug)) errors.push({ row: rowNumber, column: "slug", message: "Duplicate slug in this CSV." });
    if (slug) seenSlugs.add(slug);
    if (typeof data.status === "string" && !["DRAFT", "PUBLISHED", "ARCHIVED"].includes(data.status)) {
      errors.push({ row: rowNumber, column: "status", message: "Use DRAFT, PUBLISHED, or ARCHIVED." });
    }

    if (parsed.success) {
      const media = [...parsed.data.mediaAssets, ...parsed.data.visualReferences, ...parsed.data.exampleOutputs];
      if (media.some((asset) => asset.url && !asset.assetId)) {
        warnings.push("One or more media URLs are external references; this import will not upload them to ImageKit.");
      }
      result.push({ row: rowNumber, slug, data: parsed.data, errors, warnings });
    } else {
      result.push({ row: rowNumber, slug, errors, warnings });
    }
  }
  if (!result.length) throw new Error("The CSV must contain at least one non-empty data row.");
  return result;
}

export function buildVybeCsvErrorReport(rows: VybeCsvRow[]): string {
  return [
    csvRow(["row", "slug", "column", "error", "warnings"]),
    ...rows.flatMap((row) => row.errors.map((error) => csvRow([
      error.row, row.slug, error.column, error.message, row.warnings.join(" "),
    ]))),
  ].join("\r\n");
}
