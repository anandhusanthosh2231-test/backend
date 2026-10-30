import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import { z } from "zod/v4";
import { db, imagekitMediaAssetsTable, vybeCreationsTable, vybeCsvImportJobsTable } from "@workspace/db";
import { requireAdmin, type AuthenticatedRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import {
  buildVybeCsv,
  buildVybeCsvErrorReport,
  buildVybeCsvTemplate,
  getVybeCsvSchema,
  parseAndValidateVybeCsv,
  type VybeCsvRow,
} from "../lib/vybe-csv";
import {
  formatZodIssues,
  isVybePublicEnabled,
  vybeContentTypes,
  vybeCreationInputSchema,
} from "../lib/vybe";

const router: IRouter = Router();

function parseId(value: string | string[]): number | undefined {
  const id = Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function getPagination(query: Record<string, unknown>) {
  const page = Math.max(1, Math.min(Number(query.page) || 1, 100_000));
  const pageSize = Math.max(1, Math.min(Number(query.pageSize) || 24, 50));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function getSearch(query: unknown) {
  return typeof query === "string" ? query.trim().slice(0, 200) : "";
}

function handleInvalidBody(error: Parameters<typeof formatZodIssues>[0], res: Response): void {
  res.status(400).json({
    error: "VYBE content needs attention before it can be saved.",
    details: formatZodIssues(error),
  });
}

function databaseErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function publicQueryConditions(query: Record<string, unknown>) {
  const conditions = [eq(vybeCreationsTable.status, "PUBLISHED")];
  const search = getSearch(query.q);
  if (search) {
    conditions.push(or(
      ilike(vybeCreationsTable.title, `%${search}%`),
      ilike(vybeCreationsTable.shortDescription, `%${search}%`),
      ilike(vybeCreationsTable.description, `%${search}%`),
      ilike(vybeCreationsTable.category, `%${search}%`),
      ilike(vybeCreationsTable.model, `%${search}%`),
      sql`${vybeCreationsTable.tags}::text ILIKE ${`%${search}%`}`,
    )!);
  }
  if (typeof query.category === "string" && query.category.trim()) {
    conditions.push(eq(vybeCreationsTable.category, query.category.trim().slice(0, 80)));
  }
  if (typeof query.contentType === "string" && vybeContentTypes.includes(query.contentType as typeof vybeContentTypes[number])) {
    conditions.push(eq(vybeCreationsTable.contentType, query.contentType));
  }
  if (typeof query.model === "string" && query.model.trim()) {
    const model = query.model.trim().slice(0, 160);
    conditions.push(or(
      ilike(vybeCreationsTable.model, `%${model}%`),
      sql`${vybeCreationsTable.models}::text ILIKE ${`%${model}%`}`,
    )!);
  }
  if (typeof query.tag === "string" && query.tag.trim()) {
    conditions.push(sql`${vybeCreationsTable.tags} @> ARRAY[${query.tag.trim().slice(0, 80)}]::text[]`);
  }
  if (query.featured === "true") conditions.push(eq(vybeCreationsTable.featured, true));
  if (query.trending === "true") conditions.push(eq(vybeCreationsTable.trending, true));
  return and(...conditions);
}

function adminQueryConditions(query: Record<string, unknown>) {
  const conditions = [];
  const search = getSearch(query.q);
  if (search) {
    conditions.push(or(
      ilike(vybeCreationsTable.title, `%${search}%`),
      ilike(vybeCreationsTable.slug, `%${search}%`),
      ilike(vybeCreationsTable.shortDescription, `%${search}%`),
      ilike(vybeCreationsTable.category, `%${search}%`),
      ilike(vybeCreationsTable.model, `%${search}%`),
      ilike(vybeCreationsTable.prompt, `%${search}%`),
      ilike(vybeCreationsTable.negativePrompt, `%${search}%`),
      sql`${vybeCreationsTable.tags}::text ILIKE ${`%${search}%`}`,
      sql`${vybeCreationsTable.models}::text ILIKE ${`%${search}%`}`,
      sql`${vybeCreationsTable.tools}::text ILIKE ${`%${search}%`}`,
    ));
  }
  if (typeof query.status === "string" && ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(query.status)) {
    conditions.push(eq(vybeCreationsTable.status, query.status));
  }
  if (typeof query.category === "string" && query.category.trim()) {
    conditions.push(eq(vybeCreationsTable.category, query.category.trim().slice(0, 80)));
  }
  if (typeof query.contentType === "string" && vybeContentTypes.includes(query.contentType as typeof vybeContentTypes[number])) {
    conditions.push(eq(vybeCreationsTable.contentType, query.contentType));
  }
  if (query.featured === "true" || query.featured === "false") {
    conditions.push(eq(vybeCreationsTable.featured, query.featured === "true"));
  }
  if (query.trending === "true" || query.trending === "false") {
    conditions.push(eq(vybeCreationsTable.trending, query.trending === "true"));
  }
  if (typeof query.model === "string" && query.model.trim()) {
    const model = query.model.trim().slice(0, 160);
    conditions.push(or(
      ilike(vybeCreationsTable.model, `%${model}%`),
      sql`${vybeCreationsTable.models}::text ILIKE ${`%${model}%`}`,
    ));
  }
  if (typeof query.tag === "string" && query.tag.trim()) {
    conditions.push(sql`${vybeCreationsTable.tags} @> ARRAY[${query.tag.trim().slice(0, 80)}]::text[]`);
  }
  return conditions.length ? and(...conditions) : undefined;
}

const csvImportRequestSchema = z.object({
  csv: z.string().min(1).max(5 * 1024 * 1024),
  mapping: z.record(z.string(), z.string()).default({}),
  strategy: z.enum(["create-only", "update-existing", "upsert"]).default("create-only"),
  publishImported: z.boolean().default(false),
});

const csvCommitRequestSchema = csvImportRequestSchema.extend({
  idempotencyKey: z.string().uuid(),
});

function csvRequestError(error: unknown, res: Response): void {
  res.status(400).json({ error: error instanceof Error ? error.message : "The VYBE CSV request is invalid." });
}

async function validateCsvAssetReferences(rows: VybeCsvRow[]): Promise<void> {
  const assetIds = [...new Set(rows.flatMap((row) => {
    if (!row.data) return [];
    return [...row.data.mediaAssets, ...row.data.visualReferences, ...row.data.exampleOutputs]
      .flatMap((asset) => asset.assetId ? [asset.assetId] : []);
  }))];
  if (!assetIds.length) return;
  const assets = await db.select({ fileId: imagekitMediaAssetsTable.fileId, url: imagekitMediaAssetsTable.url })
    .from(imagekitMediaAssetsTable).where(inArray(imagekitMediaAssetsTable.fileId, assetIds));
  const known = new Map(assets.map((asset) => [asset.fileId, asset.url]));
  for (const row of rows) {
    if (!row.data) continue;
    for (const asset of [...row.data.mediaAssets, ...row.data.visualReferences, ...row.data.exampleOutputs]) {
      if (!asset.assetId) continue;
      const knownUrl = known.get(asset.assetId);
      if (!knownUrl) {
        row.errors.push({ row: row.row, column: "mediaAssets", message: `ImageKit asset "${asset.assetId}" is not registered in the media library.` });
      } else if (knownUrl !== asset.url) {
        row.errors.push({ row: row.row, column: "mediaAssets", message: `The URL does not match registered ImageKit asset "${asset.assetId}".` });
      }
    }
  }
}

function conflictSummary(rows: VybeCsvRow[], existingSlugs: Set<string>, strategy: string) {
  let create = 0;
  let update = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.errors.length) continue;
    const exists = existingSlugs.has(row.slug);
    if (strategy === "create-only" && exists) skipped += 1;
    else if (strategy === "update-existing" && !exists) skipped += 1;
    else if (exists) update += 1;
    else create += 1;
  }
  return { create, update, skipped, invalid: rows.filter((row) => row.errors.length).length, total: rows.length };
}

router.get("/vybe", async (req, res, next): Promise<void> => {
  if (!isVybePublicEnabled()) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  try {
    const query = req.query as Record<string, unknown>;
    const { page, pageSize, offset } = getPagination(query);
    const where = publicQueryConditions(query);
    const orderBy = query.sort === "newest"
      ? [desc(vybeCreationsTable.publishedAt)]
      : query.sort === "title"
        ? [asc(vybeCreationsTable.title)]
        : [desc(vybeCreationsTable.featured), vybeCreationsTable.featuredPosition, desc(vybeCreationsTable.publishedAt)];
    const [items, totals, categories] = await Promise.all([
      db.select().from(vybeCreationsTable)
        .where(where)
        .orderBy(...orderBy)
        .limit(pageSize).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(vybeCreationsTable).where(where),
      db.selectDistinct({ category: vybeCreationsTable.category })
        .from(vybeCreationsTable).where(eq(vybeCreationsTable.status, "PUBLISHED"))
        .orderBy(vybeCreationsTable.category),
    ]);
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json({ items, page, pageSize, total: totals[0]?.total ?? 0, categories: categories.map((item) => item.category) });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/vybe/preview/:slug", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
    const [item] = await db.select().from(vybeCreationsTable)
      .where(eq(vybeCreationsTable.slug, slug)).limit(1);
    if (!item) {
      res.status(404).json({ error: "VYBE creation not found." });
      return;
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.get("/vybe/:slug", async (req, res, next): Promise<void> => {
  if (!isVybePublicEnabled()) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  try {
    const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
    const [item] = await db.select().from(vybeCreationsTable).where(and(
      eq(vybeCreationsTable.slug, slug),
      eq(vybeCreationsTable.status, "PUBLISHED"),
    )).limit(1);
    if (!item) {
      res.status(404).json({ error: "VYBE creation not found." });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.get("/admin/vybe/summary", requireAdmin, async (_req, res, next): Promise<void> => {
  try {
    const rows = await db.select({
      status: vybeCreationsTable.status,
      count: sql<number>`count(*)::int`,
    }).from(vybeCreationsTable).groupBy(vybeCreationsTable.status);
    const counts = { total: 0, drafts: 0, published: 0, archived: 0, featured: 0 };
    for (const row of rows) {
      counts.total += row.count;
      if (row.status === "DRAFT") counts.drafts = row.count;
      if (row.status === "PUBLISHED") counts.published = row.count;
      if (row.status === "ARCHIVED") counts.archived = row.count;
    }
    const [featured] = await db.select({ count: sql<number>`count(*)::int` })
      .from(vybeCreationsTable).where(eq(vybeCreationsTable.featured, true));
    counts.featured = featured?.count ?? 0;
    const [categories] = await db.select({ count: sql<number>`count(distinct ${vybeCreationsTable.category})::int` })
      .from(vybeCreationsTable);
    res.json({ ...counts, categories: categories?.count ?? 0 });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/vybe/schema", requireAdmin, (_req, res): void => {
  res.json(getVybeCsvSchema());
});

router.get("/admin/vybe/import/template", requireAdmin, (_req, res): void => {
  res.setHeader("Content-Disposition", 'attachment; filename="vybe-creations-template-v1.csv"');
  res.type("text/csv; charset=utf-8").send(buildVybeCsvTemplate());
});

router.post("/admin/vybe/import/validate", requireAdmin, async (req, res): Promise<void> => {
  const parsedBody = csvImportRequestSchema.safeParse(req.body);
  if (!parsedBody.success) {
    csvRequestError(parsedBody.error, res);
    return;
  }
  const input = parsedBody.data;
  let rows: VybeCsvRow[];
  try {
    rows = parseAndValidateVybeCsv(input.csv, input.mapping);
  } catch (error) {
    csvRequestError(error, res);
    return;
  }
  await validateCsvAssetReferences(rows);
  const slugs = rows.filter((row) => row.slug).map((row) => row.slug);
  const stored = slugs.length
    ? await db.select({ slug: vybeCreationsTable.slug }).from(vybeCreationsTable).where(inArray(vybeCreationsTable.slug, slugs))
    : [];
  const conflicts = conflictSummary(rows, new Set(stored.map((row) => row.slug)), input.strategy);
  const results = rows.map((row) => ({
    row: row.row,
    slug: row.slug,
    valid: row.errors.length === 0,
    errors: row.errors,
    warnings: [
      ...row.warnings,
      ...(!input.publishImported && row.data?.status === "PUBLISHED"
        ? ["Publication status will be changed to DRAFT by the default import safety setting."]
        : []),
    ],
    action: row.errors.length
      ? "invalid"
      : input.strategy === "create-only" && stored.some((entry) => entry.slug === row.slug)
        ? "skip"
        : input.strategy === "update-existing" && !stored.some((entry) => entry.slug === row.slug)
          ? "skip"
          : stored.some((entry) => entry.slug === row.slug) ? "update" : "create",
  }));
  res.json({ schemaVersion: "1", strategy: input.strategy, publishImported: input.publishImported, counts: conflicts, rows: results });
});

router.post("/admin/vybe/import/commit", requireAdmin, async (req: AuthenticatedRequest, res, next): Promise<void> => {
  const parsedBody = csvCommitRequestSchema.safeParse(req.body);
  if (!parsedBody.success) {
    csvRequestError(parsedBody.error, res);
    return;
  }
  const input = parsedBody.data;
  try {
    const [prior] = await db.select().from(vybeCsvImportJobsTable)
      .where(eq(vybeCsvImportJobsTable.idempotencyKey, input.idempotencyKey)).limit(1);
    if (prior) {
      res.json({ job: prior, report: prior.report, alreadyProcessed: true });
      return;
    }

    const rows = parseAndValidateVybeCsv(input.csv, input.mapping);
    await validateCsvAssetReferences(rows);
    const started = new Date();
    const results: Array<{ row: number; slug: string; action: string; message: string }> = [];
    let importedRows = 0;
    let skippedRows = 0;
    let failedRows = 0;
    const errors = rows.flatMap((row) => row.errors);
    for (const row of rows) {
      if (row.errors.length) {
        failedRows += 1;
        results.push({ row: row.row, slug: row.slug, action: "failed", message: row.errors.map((error) => `${error.column}: ${error.message}`).join("; ") });
      }
    }

    const job = await db.transaction(async (tx) => {
      const [createdJob] = await tx.insert(vybeCsvImportJobsTable).values({
        idempotencyKey: input.idempotencyKey,
        status: "RUNNING",
        strategy: input.strategy,
        totalRows: rows.length,
        adminId: String(req.userId ?? "admin"),
      }).onConflictDoNothing().returning();
      if (!createdJob) throw new Error("This import confirmation has already been processed.");

      for (const row of rows) {
        if (row.errors.length || !row.data) continue;
        const [existing] = await tx.select({
          id: vybeCreationsTable.id,
          status: vybeCreationsTable.status,
          publishedAt: vybeCreationsTable.publishedAt,
        }).from(vybeCreationsTable).where(eq(vybeCreationsTable.slug, row.slug)).limit(1);
        const exists = Boolean(existing);
        if ((input.strategy === "create-only" && exists)
          || (input.strategy === "update-existing" && !exists)) {
          skippedRows += 1;
          results.push({ row: row.row, slug: row.slug, action: "skipped", message: exists ? "Slug already exists." : "No existing creation matched this slug." });
          continue;
        }

        const data = {
          ...row.data,
          status: input.publishImported ? row.data.status : "DRAFT",
        };
        const publishDate = data.status === "PUBLISHED"
          ? existing?.publishedAt ?? started
          : null;
        if (existing) {
          await tx.update(vybeCreationsTable).set({
            ...data,
            updatedAt: started,
            publishedAt: publishDate,
          }).where(eq(vybeCreationsTable.id, existing.id));
          results.push({ row: row.row, slug: row.slug, action: "updated", message: "Existing creation updated." });
        } else {
          await tx.insert(vybeCreationsTable).values({ ...data, publishedAt: publishDate });
          results.push({ row: row.row, slug: row.slug, action: "created", message: "Creation imported." });
        }
        importedRows += 1;
      }

      const status = failedRows ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
      const report = { status, strategy: input.strategy, totalRows: rows.length, importedRows, skippedRows, failedRows, results, errors };
      const [updatedJob] = await tx.update(vybeCsvImportJobsTable).set({
        status,
        importedRows,
        skippedRows,
        failedRows,
        report,
        updatedAt: new Date(),
      }).where(eq(vybeCsvImportJobsTable.id, createdJob.id)).returning();
      return { job: updatedJob, report };
    });
    logger.info({ jobId: job.job.id, adminId: req.userId, strategy: input.strategy, totalRows: rows.length, importedRows, skippedRows, failedRows }, "VYBE CSV import completed");
    res.status(failedRows ? 207 : 201).json(job);
  } catch (error) {
    if (databaseErrorCode(error) === "23505" || (error instanceof Error && error.message.includes("already been processed"))) {
      const [prior] = await db.select().from(vybeCsvImportJobsTable)
        .where(eq(vybeCsvImportJobsTable.idempotencyKey, input.idempotencyKey)).limit(1);
      if (prior) {
        res.json({ job: prior, report: prior.report, alreadyProcessed: true });
        return;
      }
    }
    if (error instanceof Error && (error.message.includes("CSV") || error.message.includes("Map CSV"))) {
      csvRequestError(error, res);
      return;
    }
    next(error);
  }
});

router.get("/admin/vybe/import/jobs", requireAdmin, async (req, res, next): Promise<void> => {
  const rawLimit = Number(req.query.limit) || 10;
  const limit = Math.max(1, Math.min(Math.floor(rawLimit), 50));
  try {
    const jobs = await db.select({
      id: vybeCsvImportJobsTable.id,
      status: vybeCsvImportJobsTable.status,
      strategy: vybeCsvImportJobsTable.strategy,
      totalRows: vybeCsvImportJobsTable.totalRows,
      importedRows: vybeCsvImportJobsTable.importedRows,
      skippedRows: vybeCsvImportJobsTable.skippedRows,
      failedRows: vybeCsvImportJobsTable.failedRows,
      createdAt: vybeCsvImportJobsTable.createdAt,
    }).from(vybeCsvImportJobsTable).orderBy(desc(vybeCsvImportJobsTable.createdAt)).limit(limit);
    res.json({ jobs });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/vybe/import/jobs/:id", requireAdmin, async (req, res, next): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid VYBE import job id." });
    return;
  }
  try {
    const [job] = await db.select().from(vybeCsvImportJobsTable)
      .where(eq(vybeCsvImportJobsTable.id, id)).limit(1);
    if (!job) {
      res.status(404).json({ error: "VYBE import job not found." });
      return;
    }
    res.json(job);
  } catch (error) {
    next(error);
  }
});

router.get("/admin/vybe/import/jobs/:id/report", requireAdmin, async (req, res, next): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid VYBE import job id." });
    return;
  }
  try {
    const [job] = await db.select().from(vybeCsvImportJobsTable)
      .where(eq(vybeCsvImportJobsTable.id, id)).limit(1);
    if (!job) {
      res.status(404).json({ error: "VYBE import job not found." });
      return;
    }
    const report = job.report as {
      errors?: VybeCsvRow["errors"];
      results?: Array<{ row: number; slug: string }>;
    };
    const rows = (report.errors ?? []).map((error) => ({
      row: error.row,
      slug: report.results?.find((result) => result.row === error.row)?.slug ?? "",
      errors: [error],
      warnings: [],
    }));
    res.setHeader("Content-Disposition", `attachment; filename="vybe-import-${id}-errors.csv"`);
    res.type("text/csv; charset=utf-8").send(buildVybeCsvErrorReport(rows));
  } catch (error) {
    next(error);
  }
});

router.get("/admin/vybe/export", requireAdmin, async (req: AuthenticatedRequest, res, next): Promise<void> => {
  try {
    const query = req.query as Record<string, unknown>;
    const conditions = [adminQueryConditions(query)].filter(Boolean);
    const rawIds = typeof query.ids === "string" ? query.ids.split(",").filter(Boolean) : [];
    let where = conditions[0];
    if (rawIds.length) {
      if (rawIds.length > 500) {
        res.status(400).json({ error: "Select no more than 500 VYBE creations per export." });
        return;
      }
      const ids = rawIds.map(Number);
      if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
        res.status(400).json({ error: "Export IDs must be positive integers." });
        return;
      }
      const selected = inArray(vybeCreationsTable.id, ids);
      where = where ? and(where, selected) : selected;
    }
    const [totalRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(vybeCreationsTable).where(where);
    const total = totalRow?.count ?? 0;
    const order = query.sort === "title" ? asc(vybeCreationsTable.title)
      : query.sort === "status" ? asc(vybeCreationsTable.status)
        : query.sort === "featured" ? desc(vybeCreationsTable.featured)
          : asc(vybeCreationsTable.id);
    res.setHeader("Content-Disposition", 'attachment; filename="vybe-creations.csv"');
    res.type("text/csv; charset=utf-8");
    let first = true;
    for (let offset = 0; offset < total; offset += 200) {
      const batch = await db.select().from(vybeCreationsTable).where(where)
        .orderBy(order, asc(vybeCreationsTable.id)).limit(200).offset(offset);
      const csv = buildVybeCsv(batch as unknown as Array<Record<string, unknown>>);
      const content = first ? csv : csv.slice(csv.indexOf("\r\n") + 2);
      first = false;
      if (!res.write(content + "\r\n")) await new Promise<void>((resolve) => res.once("drain", resolve));
    }
    if (first) res.write(buildVybeCsv([]));
    logger.info({ adminId: req.userId, exportedRows: total, selectedRows: rawIds.length || undefined }, "VYBE CSV export completed");
    res.end();
  } catch (error) {
    if (res.headersSent) {
      res.destroy(error instanceof Error ? error : undefined);
      return;
    }
    next(error);
  }
});

router.get("/admin/vybe", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const query = req.query as Record<string, unknown>;
    const { page, pageSize, offset } = getPagination(query);
    const where = adminQueryConditions(query);
    const orderBy = query.sort === "newest"
      ? [desc(vybeCreationsTable.publishedAt)]
      : query.sort === "title"
        ? [asc(vybeCreationsTable.title)]
        : query.sort === "featured"
          ? [desc(vybeCreationsTable.featured), vybeCreationsTable.featuredPosition, desc(vybeCreationsTable.publishedAt)]
          : [desc(vybeCreationsTable.updatedAt)];
    const [items, totals, categories] = await Promise.all([
      db.select().from(vybeCreationsTable).where(where)
        .orderBy(...orderBy)
        .limit(pageSize).offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(vybeCreationsTable).where(where),
      db.selectDistinct({ category: vybeCreationsTable.category }).from(vybeCreationsTable)
        .orderBy(vybeCreationsTable.category),
    ]);
    res.json({ items, page, pageSize, total: totals[0]?.total ?? 0, categories: categories.map((item) => item.category) });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/vybe", requireAdmin, async (req, res, next): Promise<void> => {
  const parsed = vybeCreationInputSchema.safeParse(req.body);
  if (!parsed.success) {
    handleInvalidBody(parsed.error, res);
    return;
  }
  try {
    const [item] = await db.insert(vybeCreationsTable).values({
      ...parsed.data,
      publishedAt: parsed.data.status === "PUBLISHED" ? new Date() : null,
    }).returning();
    res.status(201).json(item);
  } catch (error) {
    if (databaseErrorCode(error) === "23505") {
      res.status(409).json({ error: "A VYBE creation with that slug already exists." });
      return;
    }
    next(error);
  }
});

router.patch("/admin/vybe/:id", requireAdmin, async (req, res, next): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid VYBE id." });
    return;
  }
  const parsed = vybeCreationInputSchema.safeParse(req.body);
  if (!parsed.success) {
    handleInvalidBody(parsed.error, res);
    return;
  }
  try {
    const [existing] = await db.select({
      id: vybeCreationsTable.id,
      status: vybeCreationsTable.status,
      publishedAt: vybeCreationsTable.publishedAt,
    }).from(vybeCreationsTable).where(eq(vybeCreationsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "VYBE creation not found." });
      return;
    }
    const publishedAt = parsed.data.status !== "PUBLISHED"
      ? null
      : existing.status === "PUBLISHED" ? existing.publishedAt ?? new Date() : new Date();
    const [item] = await db.update(vybeCreationsTable)
      .set({ ...parsed.data, updatedAt: new Date(), publishedAt })
      .where(eq(vybeCreationsTable.id, id))
      .returning();
    res.json(item);
  } catch (error) {
    if (databaseErrorCode(error) === "23505") {
      res.status(409).json({ error: "A VYBE creation with that slug already exists." });
      return;
    }
    next(error);
  }
});

router.post("/admin/vybe/:id/duplicate", requireAdmin, async (req, res, next): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid VYBE id." });
    return;
  }
  try {
    const [source] = await db.select().from(vybeCreationsTable).where(eq(vybeCreationsTable.id, id)).limit(1);
    if (!source) {
      res.status(404).json({ error: "VYBE creation not found." });
      return;
    }
    const baseSlug = `${source.slug}-copy`;
    let slug = baseSlug;
    for (let suffix = 2; ; suffix += 1) {
      const [match] = await db.select({ id: vybeCreationsTable.id })
        .from(vybeCreationsTable).where(eq(vybeCreationsTable.slug, slug)).limit(1);
      if (!match) break;
      slug = `${baseSlug}-${suffix}`;
    }
    const { id: _sourceId, createdAt: _createdAt, updatedAt: _updatedAt, publishedAt: _publishedAt, ...content } = source;
    const [item] = await db.insert(vybeCreationsTable).values({
      ...content,
      title: `${source.title} (copy)`.slice(0, 160),
      slug,
      status: "DRAFT",
      featured: false,
      featuredPosition: 0,
      trending: false,
      publishedAt: null,
    }).returning();
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

router.delete("/admin/vybe/:id", requireAdmin, async (req, res, next): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid VYBE id." });
    return;
  }
  try {
    const [deleted] = await db.delete(vybeCreationsTable)
      .where(eq(vybeCreationsTable.id, id)).returning({ id: vybeCreationsTable.id });
    if (!deleted) {
      res.status(404).json({ error: "VYBE creation not found." });
      return;
    }
    res.json({ deleted: true, id });
  } catch (error) {
    next(error);
  }
});

export default router;
