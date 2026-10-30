import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { db, imagekitMediaAssetsTable, recipesTable, vybeCreationsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";
import { createImageKitUploadAuth, deleteImageKitFile, fetchImageKitFile, getImageKitConfig, validateImageKitAssetInput } from "../lib/imagekit";

const router: IRouter = Router();

function imageKitNotConfigured(res: Response): void {
  res.status(503).json({ error: "ImageKit is not configured on the API server." });
}

function getRequiredImageKitConfig(res: Response) {
  try {
    const config = getImageKitConfig();
    if (!config) imageKitNotConfigured(res);
    return config;
  } catch (error) {
    res.status(503).json({
      error: error instanceof Error
        ? `ImageKit configuration is invalid: ${error.message}`
        : "ImageKit configuration is invalid.",
    });
    return undefined;
  }
}

function isMissingMediaTable(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "42P01";
}

function requireImageKitMediaSchema(_req: Request, res: Response, next: NextFunction): void {
  db.execute(sql`select 1 from imagekit_media_assets limit 0`)
    .then(() => next())
    .catch((error: unknown) => {
      if (isMissingMediaTable(error)) {
        res.status(503).json({
          error: "The ImageKit media database migration is missing. Apply lib/db/migrations/0004_imagekit_media_assets.sql, then retry.",
        });
        return;
      }
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
      res.status(503).json({
        error: "The ImageKit media database could not be reached. Check the API database connection and migration 0004.",
        ...(code ? { code } : {}),
      });
    });
}

router.get("/admin/imagekit/config", requireAdmin, (_req, res): void => {
  let config;
  try {
    config = getImageKitConfig();
  } catch (error) {
    res.status(503).json({
      error: error instanceof Error
        ? `ImageKit configuration is invalid: ${error.message}`
        : "ImageKit configuration is invalid.",
    });
    return;
  }
  if (!config) {
    res.json({ configured: false });
    return;
  }
  res.json({
    configured: true,
    publicKey: config.publicKey,
    urlEndpoint: config.urlEndpoint,
    maxFileSizeBytes: config.maxFileSizeBytes,
  });
});

router.get("/admin/imagekit/auth", requireAdmin, (_req, res): void => {
  const config = getRequiredImageKitConfig(res);
  if (!config) return;
  res.json(createImageKitUploadAuth(config));
});

router.get("/admin/imagekit/assets", requireAdmin, requireImageKitMediaSchema, async (req, res): Promise<void> => {
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 200) : "";
  const fileType = req.query.fileType === "image" || req.query.fileType === "non-image" ? req.query.fileType : undefined;
  const page = Math.max(1, Math.min(Number(req.query.page ?? 1) || 1, 100_000));
  const pageSize = Math.max(1, Math.min(Number(req.query.pageSize ?? 24) || 24, 50));
  const filters = [];
  if (query) {
    filters.push(or(
        ilike(imagekitMediaAssetsTable.fileName, `%${query}%`),
        ilike(imagekitMediaAssetsTable.alt, `%${query}%`),
        sql`${imagekitMediaAssetsTable.tags}::text ILIKE ${`%${query}%`}`,
        ilike(imagekitMediaAssetsTable.filePath, `%${query}%`),
      )!);
  }
  if (fileType) filters.push(eq(imagekitMediaAssetsTable.fileType, fileType));
  const where = filters.length ? and(...filters) : undefined;
  const [items, totals] = await Promise.all([
    db.select().from(imagekitMediaAssetsTable).where(where)
      .orderBy(desc(imagekitMediaAssetsTable.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(imagekitMediaAssetsTable).where(where),
  ]);
  res.json({ items, page, pageSize, total: totals[0]?.total ?? 0 });
});

router.post("/admin/imagekit/assets", requireAdmin, requireImageKitMediaSchema, async (req, res, next): Promise<void> => {
  try {
    const config = getRequiredImageKitConfig(res);
    if (!config) return;
    const input = validateImageKitAssetInput(req.body);
    if (!input) {
      res.status(400).json({ error: "Image asset metadata is invalid." });
      return;
    }
    const remote = await fetchImageKitFile(config, input.fileId);
    if (remote.filePath !== input.filePath || remote.url !== input.url || remote.size !== input.size || remote.name !== input.name || remote.fileType !== input.fileType) {
      res.status(400).json({ error: "Image metadata does not match the verified ImageKit asset." });
      return;
    }
    const [item] = await db.insert(imagekitMediaAssetsTable).values({
      fileId: remote.fileId,
      filePath: remote.filePath,
      url: remote.url,
      fileName: remote.name,
      fileType: remote.fileType,
      size: remote.size,
      alt: input.alt,
      tags: input.tags,
    }).onConflictDoUpdate({
      target: imagekitMediaAssetsTable.filePath,
      set: {
        fileId: remote.fileId,
        url: remote.url,
        fileName: remote.name,
        fileType: remote.fileType,
        size: remote.size,
        alt: input.alt,
        tags: input.tags,
        updatedAt: new Date(),
      },
    }).returning();
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

router.patch("/admin/imagekit/assets/:fileId", requireAdmin, requireImageKitMediaSchema, async (req, res): Promise<void> => {
  const fileId = String(req.params.fileId ?? "");
  const body = req.body as { alt?: unknown; tags?: unknown };
  const patch: { alt?: string; tags?: string[]; updatedAt: Date } = { updatedAt: new Date() };
  if (body.alt !== undefined) {
    if (typeof body.alt !== "string" || body.alt.length > 500) {
      res.status(400).json({ error: "Alt text must be 500 characters or fewer." });
      return;
    }
    patch.alt = body.alt.trim();
  }
  if (body.tags !== undefined) {
    if (
      !Array.isArray(body.tags)
      || body.tags.length > 20
      || !body.tags.every((tag) => typeof tag === "string" && tag.trim().length > 0 && tag.length <= 50)
    ) {
      res.status(400).json({ error: "Provide at most 20 tags, each between 1 and 50 characters." });
      return;
    }
    patch.tags = [...new Set((body.tags as string[]).map((tag) => tag.trim()))];
  }
  const [item] = await db.update(imagekitMediaAssetsTable).set(patch)
    .where(eq(imagekitMediaAssetsTable.fileId, fileId)).returning();
  if (!item) {
    res.status(404).json({ error: "ImageKit asset not found." });
    return;
  }
  res.json(item);
});

router.delete("/admin/imagekit/assets/:fileId", requireAdmin, requireImageKitMediaSchema, async (req, res, next): Promise<void> => {
  try {
    const fileId = String(req.params.fileId ?? "");
    const [asset] = await db.select().from(imagekitMediaAssetsTable)
      .where(eq(imagekitMediaAssetsTable.fileId, fileId)).limit(1);
    if (!asset) {
      res.status(404).json({ error: "ImageKit asset not found." });
      return;
    }
    const [recipeReferences, vybeReferences] = await Promise.all([
      db.select({
      id: recipesTable.id,
      slug: recipesTable.slug,
      title: recipesTable.title,
      }).from(recipesTable).where(or(
      sql`${recipesTable.guide} @> jsonb_build_object('imagesJson', jsonb_build_array(jsonb_build_object('fileId', ${fileId})))`,
      sql`${recipesTable.guide} @> jsonb_build_object('imagesJson', jsonb_build_array(jsonb_build_object('url', ${asset.url})))`,
      sql`${recipesTable.guide} @> jsonb_build_object('customContent', jsonb_build_object('images', jsonb_build_array(jsonb_build_object('fileId', ${fileId}))))`,
      sql`${recipesTable.guide} @> jsonb_build_object('customContent', jsonb_build_object('images', jsonb_build_array(jsonb_build_object('url', ${asset.url}))))`,
      sql`${recipesTable.layoutConfig} @> jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('imageUrl', ${asset.url})))`,
      )).limit(10),
      db.select({
        id: vybeCreationsTable.id,
        slug: vybeCreationsTable.slug,
        title: vybeCreationsTable.title,
      }).from(vybeCreationsTable).where(or(
        eq(vybeCreationsTable.imageUrl, asset.url),
        eq(vybeCreationsTable.videoUrl, asset.url),
        eq(vybeCreationsTable.posterUrl, asset.url),
        sql`${vybeCreationsTable.mediaAssets} @> ${JSON.stringify([{ assetId: fileId }])}::jsonb`,
        sql`${vybeCreationsTable.visualReferences} @> ${JSON.stringify([{ assetId: fileId }])}::jsonb`,
        sql`${vybeCreationsTable.exampleOutputs} @> ${JSON.stringify([{ assetId: fileId }])}::jsonb`,
        sql`${vybeCreationsTable.mediaAssets} @> ${JSON.stringify([{ url: asset.url }])}::jsonb`,
        sql`${vybeCreationsTable.visualReferences} @> ${JSON.stringify([{ url: asset.url }])}::jsonb`,
        sql`${vybeCreationsTable.exampleOutputs} @> ${JSON.stringify([{ url: asset.url }])}::jsonb`,
      )).limit(10),
    ]);
    if (recipeReferences.length || vybeReferences.length) {
      res.status(409).json({
        error: "This media asset is still referenced by content. Replace or remove those references before deleting it.",
        references: [
          ...recipeReferences.map(({ slug, title }) => ({ slug, title, catalogue: "TASKBAKE" })),
          ...vybeReferences.map(({ slug, title }) => ({ slug, title, catalogue: "VYBE" })),
        ],
      });
      return;
    }

    const config = getRequiredImageKitConfig(res);
    if (!config) return;
    await deleteImageKitFile(config, asset.fileId);
    await db.delete(imagekitMediaAssetsTable).where(eq(imagekitMediaAssetsTable.fileId, asset.fileId));
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

export default router;
