import { and, asc, count, countDistinct, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import express, { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import {
  CreateAdminRecipeBody,
  CreateAdminCategoryBody,
  CreateAdminAudienceBody,
  CreateSubmissionBody,
  DeleteAdminCategoryParams,
  DeleteAdminRecipeParams,
  DuplicateAdminRecipeParams,
  GenerateDraftRecipeBody,
  TrackEventBody,
  GetAdminAnalyticsResponse,
  GetAdminSummaryResponse,
  GetAudienceParams,
  GetCategoryParams,
  GetRecipeParams,
  GetRelatedRecipesParams,
  ImportAdminRecipesCsvBody,
  ListAdminRecipesQueryParams,
  ListRecipesQueryParams,
  ListCategoriesResponse,
  ListHistoryResponse,
  ListRecipesResponse,
  ListSavedRecipesResponse,
  ListAudiencesResponse,
  ListAdminSubmissionsResponse,
  BulkUpdateAdminRecipesBody,
  ListAudiencesResponseItem,
  GetRecipeResponse,
  SubmitFeedbackBody,
  SubmitSuggestionBody,
  UpdateAdminRecipeBody,
  UpdateAdminRecipeParams,
  UpdateAdminSubmissionBody,
  UpdateAdminCategoryBody,
  UpdateAdminCategoryParams,
  UpdateAdminAudienceBody,
  UpdateAdminAudienceParams,
} from "@workspace/api-zod";
import {
  audiencesTable,
  categoriesTable,
  db,
  eventsTable,
  feedbackTable,
  historyTable,
  recipesTable,
  recipeAudiencesTable,
  savedRecipesTable,
  submissionsTable,
  suggestionsTable,
} from "@workspace/db";
import { requireAdmin, requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import {
  mapRecipeCsvRecord,
  createRecipeTaxonomyCandidate,
  findRecipeTaxonomy,
  normalizeRecipeCsvHeader,
  parseRecipeCsv,
  recipeTaxonomySlug,
  splitRecipeCsvAudiences,
} from "../lib/recipe-csv-import";
import { buildRecipeCsvExport } from "../lib/recipe-csv-export";
import { validateRecipeLayout } from "../lib/recipe-layout";
import { validateRecipePromptConfiguration } from "../lib/recipe-inputs";
import { getRecipeMediaConfig, getRecipeMediaMaxBytes, listRecipeMedia, uploadRecipeMedia } from "../lib/recipe-media";

const router: IRouter = Router();
const allowedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];

const cardColumns = {
  id: recipesTable.id,
  title: recipesTable.title,
  slug: recipesTable.slug,
  shortDescription: recipesTable.shortDescription,
  category: categoriesTable.name,
  categorySlug: categoriesTable.slug,
  audience: audiencesTable.name,
  audienceSlug: audiencesTable.slug,
  difficulty: recipesTable.difficulty,
  estimatedTime: recipesTable.estimatedTime,
  language: recipesTable.language,
  aiTools: recipesTable.aiTools,
  tags: recipesTable.tags,
  featured: recipesTable.featured,
  trending: recipesTable.trending,
  viewCount: recipesTable.viewCount,
  copyCount: recipesTable.copyCount,
  saveCount: recipesTable.saveCount,
};

async function fetchCards(options: {
  where?: ReturnType<typeof and>;
  orderBy?: ReturnType<typeof desc> | ReturnType<typeof asc>;
  limit?: number;
  offset?: number;
}) {
  const query = db
    .select(cardColumns)
    .from(recipesTable)
    .innerJoin(categoriesTable, eq(recipesTable.categoryId, categoriesTable.id))
    .innerJoin(audiencesTable, eq(recipesTable.audienceId, audiencesTable.id))
    .where(options.where)
    .orderBy(options.orderBy ?? desc(recipesTable.updatedAt))
    .limit(options.limit ?? 12)
    .offset(options.offset ?? 0);
  return await query;
}

function parseId(value: string | string[] | undefined): number {
  return Number(Array.isArray(value) ? value[0] : value);
}

function recipeResponse(recipe: typeof recipesTable.$inferSelect, category: typeof categoriesTable.$inferSelect, audience: typeof audiencesTable.$inferSelect) {
  return {
    ...recipe,
    category: category.name,
    categorySlug: category.slug,
    audience: audience.name,
    audienceSlug: audience.slug,
    publishedAt: recipe.publishedAt,
  };
}

async function replaceRecipeAudiences(recipeId: number, audienceIds: number[]) {
  const uniqueIds = [...new Set(audienceIds)];
  await db.delete(recipeAudiencesTable).where(eq(recipeAudiencesTable.recipeId, recipeId));
  if (uniqueIds.length) {
    await db.insert(recipeAudiencesTable)
      .values(uniqueIds.map((audienceId) => ({ recipeId, audienceId })))
      .onConflictDoNothing();
  }
}

async function addRecipeAudiences(recipeId: number, audienceIds: number[]) {
  const uniqueIds = [...new Set(audienceIds)];
  if (uniqueIds.length) {
    await db.insert(recipeAudiencesTable)
      .values(uniqueIds.map((audienceId) => ({ recipeId, audienceId })))
      .onConflictDoNothing();
  }
}

async function findRecipe(slug: string) {
  const [row] = await db
    .select({ recipe: recipesTable, category: categoriesTable, audience: audiencesTable })
    .from(recipesTable)
    .innerJoin(categoriesTable, eq(recipesTable.categoryId, categoriesTable.id))
    .innerJoin(audiencesTable, eq(recipesTable.audienceId, audiencesTable.id))
    .where(eq(recipesTable.slug, slug));
  return row;
}

router.get("/recipes", async (req, res): Promise<void> => {
  const parsed = ListRecipesQueryParams.safeParse(req.query);
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const page = Number(req.query.page ?? 1);
  const pageSize = Math.min(Number(req.query.pageSize ?? 12), 50);
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const audience = typeof req.query.audience === "string" ? req.query.audience : undefined;
  const difficulty = typeof req.query.difficulty === "string" ? req.query.difficulty : undefined;
  const tool = typeof req.query.tool === "string" ? req.query.tool : undefined;
  const language = typeof req.query.language === "string" ? req.query.language : undefined;
  const sort = typeof req.query.sort === "string" ? req.query.sort : "relevance";
  void parsed;

  const filters = [
    eq(recipesTable.status, "PUBLISHED"),
    category ? eq(categoriesTable.slug, category) : undefined,
    audience ? inArray(
      recipesTable.id,
      db.select({ recipeId: recipeAudiencesTable.recipeId })
        .from(recipeAudiencesTable)
        .innerJoin(audiencesTable, eq(recipeAudiencesTable.audienceId, audiencesTable.id))
        .where(eq(audiencesTable.slug, audience)),
    ) : undefined,
    difficulty ? eq(recipesTable.difficulty, difficulty) : undefined,
    tool ? sql`${recipesTable.aiTools}::text ILIKE ${`%${tool}%`}` : undefined,
    language ? eq(recipesTable.language, language) : undefined,
    query
      ? or(
          ilike(recipesTable.title, `%${query}%`),
          ilike(recipesTable.shortDescription, `%${query}%`),
          ilike(recipesTable.problem, `%${query}%`),
          ilike(recipesTable.subcategory, `%${query}%`),
          sql`${recipesTable.tags}::text ILIKE ${`%${query}%`}`,
        )
      : undefined,
  ].filter(Boolean) as Array<ReturnType<typeof eq>>;
  const where = and(...filters);
  const orderBy =
    sort === "newest"
      ? desc(recipesTable.publishedAt)
      : sort === "popular"
        ? desc(sql`${recipesTable.viewCount} + ${recipesTable.copyCount} * 3 + ${recipesTable.saveCount} * 4`)
        : desc(recipesTable.featured);
  const [items, totalRows] = await Promise.all([
    fetchCards({ where, orderBy, limit: pageSize, offset: (page - 1) * pageSize }),
    db
      .select({ total: count() })
      .from(recipesTable)
      .innerJoin(categoriesTable, eq(recipesTable.categoryId, categoriesTable.id))
      .innerJoin(audiencesTable, eq(recipesTable.audienceId, audiencesTable.id))
      .where(where),
  ]);
  res.json(ListRecipesResponse.parse({ items, page, pageSize, total: Number(totalRows[0]?.total ?? 0), query }));
});

router.get("/recipes/:slug", async (req, res): Promise<void> => {
  const params = GetRecipeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const row = await findRecipe(params.data.slug);
  if (!row || row.recipe.status !== "PUBLISHED") {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }
  await db
    .update(recipesTable)
    .set({ viewCount: sql`${recipesTable.viewCount} + 1`, updatedAt: new Date() })
    .where(eq(recipesTable.id, row.recipe.id));
  await db.insert(eventsTable).values({ type: "recipe_view", recipeId: row.recipe.id });
  const viewerId = getAuth(req).userId;
  if (viewerId) {
    await db.insert(historyTable).values({ userId: viewerId, recipeId: row.recipe.id }).onConflictDoNothing();
  }
  res.json(GetRecipeResponse.parse(recipeResponse({ ...row.recipe, viewCount: row.recipe.viewCount + 1 }, row.category, row.audience)));
});

router.get("/recipes/:slug/related", async (req, res): Promise<void> => {
  const params = GetRecipeParams.safeParse(req.params);
  const limit = Math.max(1, Math.min(Number(req.query.limit ?? 3), 6));
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const row = await findRecipe(params.data.slug);
  if (!row) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }
  const candidates = await db
    .select({ recipe: recipesTable, category: categoriesTable, audience: audiencesTable })
    .from(recipesTable)
    .innerJoin(categoriesTable, eq(recipesTable.categoryId, categoriesTable.id))
    .innerJoin(audiencesTable, eq(recipesTable.audienceId, audiencesTable.id))
    .where(and(eq(recipesTable.status, "PUBLISHED"), sql`${recipesTable.id} <> ${row.recipe.id}`))
    .orderBy(desc(recipesTable.updatedAt))
    .limit(100);

  const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const sourceGuide = row.recipe.guide as { bestFor?: { tasks?: string[] }; useCases?: Array<{ name?: string }> } | null;
  const sourceTasks = new Set([
    ...(sourceGuide?.bestFor?.tasks ?? []),
    ...(sourceGuide?.useCases?.map((item) => item.name ?? "") ?? []),
  ].map(normalize).filter(Boolean));
  const sourceTags = new Set((row.recipe.tags ?? []).map(normalize).filter(Boolean));
  const sourceTools = new Set((row.recipe.aiTools ?? []).map(normalize).filter(Boolean));

  const related = candidates
    .map((candidate) => {
      const candidateGuide = candidate.recipe.guide as { bestFor?: { tasks?: string[] }; useCases?: Array<{ name?: string }> } | null;
      const candidateTasks = [
        ...(candidateGuide?.bestFor?.tasks ?? []),
        ...(candidateGuide?.useCases?.map((item) => item.name ?? "") ?? []),
      ].map(normalize).filter(Boolean);
      const sharedTasks = candidateTasks.filter((task) => sourceTasks.has(task)).length;
      const sharedTags = (candidate.recipe.tags ?? []).map(normalize).filter((tag) => sourceTags.has(tag)).length;
      const sharedTools = (candidate.recipe.aiTools ?? []).map(normalize).filter((tool) => sourceTools.has(tool)).length;
      const engagement = Math.log1p(candidate.recipe.viewCount + candidate.recipe.copyCount * 3 + candidate.recipe.saveCount * 4);
      const score =
        (candidate.recipe.categoryId === row.recipe.categoryId ? 5 : 0) +
        (candidate.recipe.audienceId === row.recipe.audienceId ? 3 : 0) +
        sharedTasks * 4 + sharedTags * 2 + sharedTools + engagement * 0.1;
      return { ...candidate, score };
    })
    .sort((left, right) => right.score - left.score || right.recipe.updatedAt.getTime() - left.recipe.updatedAt.getTime())
    .slice(0, limit)
    .map(({ recipe, category, audience }) => ({
      id: recipe.id,
      title: recipe.title,
      slug: recipe.slug,
      shortDescription: recipe.shortDescription,
      category: category.name,
      categorySlug: category.slug,
      audience: audience.name,
      audienceSlug: audience.slug,
      difficulty: recipe.difficulty,
      estimatedTime: recipe.estimatedTime,
      language: recipe.language,
      aiTools: recipe.aiTools,
      tags: recipe.tags,
      featured: recipe.featured,
      trending: recipe.trending,
      viewCount: recipe.viewCount,
      copyCount: recipe.copyCount,
      saveCount: recipe.saveCount,
    }));
  res.json(related);
});

router.get("/home", async (_req, res): Promise<void> => {
  const [[recipeOfDayRow], trending, popular, categories, audiences] = await Promise.all([
    db
      .select(cardColumns)
      .from(recipesTable)
      .innerJoin(categoriesTable, eq(recipesTable.categoryId, categoriesTable.id))
      .innerJoin(audiencesTable, eq(recipesTable.audienceId, audiencesTable.id))
      .where(and(eq(recipesTable.status, "PUBLISHED"), eq(recipesTable.recipeOfDay, true)))
      .limit(1),
    fetchCards({ where: eq(recipesTable.status, "PUBLISHED"), orderBy: desc(sql`${recipesTable.viewCount} + ${recipesTable.copyCount} * 3 + ${recipesTable.saveCount} * 4`), limit: 6 }),
    fetchCards({ where: eq(recipesTable.status, "PUBLISHED"), orderBy: desc(recipesTable.copyCount), limit: 6 }),
    db.select({ id: categoriesTable.id, name: categoriesTable.name, slug: categoriesTable.slug, description: categoriesTable.description, recipeCount: count(recipesTable.id) }).from(categoriesTable).leftJoin(recipesTable, and(eq(recipesTable.categoryId, categoriesTable.id), eq(recipesTable.status, "PUBLISHED"))).groupBy(categoriesTable.id).orderBy(desc(count(recipesTable.id)), asc(categoriesTable.name)).limit(8),
    db.select({ id: audiencesTable.id, name: audiencesTable.name, slug: audiencesTable.slug, description: audiencesTable.description, recipeCount: countDistinct(recipesTable.id) }).from(audiencesTable).leftJoin(recipeAudiencesTable, eq(recipeAudiencesTable.audienceId, audiencesTable.id)).leftJoin(recipesTable, and(eq(recipeAudiencesTable.recipeId, recipesTable.id), eq(recipesTable.status, "PUBLISHED"))).groupBy(audiencesTable.id).orderBy(desc(countDistinct(recipesTable.id)), asc(audiencesTable.name)).limit(8),
  ]);
  const normalizedCategories = categories.map((item) => ({ ...item, recipeCount: Number(item.recipeCount) }));
  const normalizedAudiences = audiences.map((item) => ({ ...item, recipeCount: Number(item.recipeCount) }));
  res.json({
    recipeOfDay: recipeOfDayRow ?? null,
    trending,
    popular,
    categories: normalizedCategories,
    audiences: normalizedAudiences,
  });
});

router.get("/categories", async (_req, res): Promise<void> => {
  const rows = await db.select({ id: categoriesTable.id, name: categoriesTable.name, slug: categoriesTable.slug, description: categoriesTable.description, recipeCount: count(recipesTable.id) }).from(categoriesTable).leftJoin(recipesTable, and(eq(recipesTable.categoryId, categoriesTable.id), eq(recipesTable.status, "PUBLISHED"))).groupBy(categoriesTable.id).orderBy(asc(categoriesTable.name));
  res.json(ListCategoriesResponse.parse(rows.map((row) => ({ ...row, recipeCount: Number(row.recipeCount) }))));
});

router.get("/categories/:slug", async (req, res): Promise<void> => {
  const params = GetCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.slug, params.data.slug));
  if (!category) { res.status(404).json({ error: "Category not found" }); return; }
  const recipes = await fetchCards({ where: and(eq(recipesTable.categoryId, category.id), eq(recipesTable.status, "PUBLISHED")), limit: 50 });
  res.json({ name: category.name, slug: category.slug, description: category.description, recipes });
});

router.get("/audiences", async (_req, res): Promise<void> => {
  const rows = await db.select({ id: audiencesTable.id, name: audiencesTable.name, slug: audiencesTable.slug, description: audiencesTable.description, recipeCount: countDistinct(recipesTable.id) }).from(audiencesTable).leftJoin(recipeAudiencesTable, eq(recipeAudiencesTable.audienceId, audiencesTable.id)).leftJoin(recipesTable, and(eq(recipeAudiencesTable.recipeId, recipesTable.id), eq(recipesTable.status, "PUBLISHED"))).groupBy(audiencesTable.id).orderBy(asc(audiencesTable.name));
  res.json(ListAudiencesResponse.parse(rows.map((row) => ({ ...row, recipeCount: Number(row.recipeCount) }))));
});

router.get("/audiences/:slug", async (req, res): Promise<void> => {
  const params = GetAudienceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [audience] = await db.select().from(audiencesTable).where(eq(audiencesTable.slug, params.data.slug));
  if (!audience) { res.status(404).json({ error: "Audience not found" }); return; }
  const recipes = await fetchCards({
    where: and(
      inArray(
        recipesTable.id,
        db.select({ recipeId: recipeAudiencesTable.recipeId })
          .from(recipeAudiencesTable)
          .where(eq(recipeAudiencesTable.audienceId, audience.id)),
      ),
      eq(recipesTable.status, "PUBLISHED"),
    ),
    limit: 50,
  });
  res.json({ name: audience.name, slug: audience.slug, description: audience.description, recipes });
});

router.post("/events", async (req, res): Promise<void> => {
  const parsed = TrackEventBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await db.insert(eventsTable).values({
    type: parsed.data.type,
    recipeId: parsed.data.recipeId ?? null,
    query: parsed.data.query ?? null,
    metadata: parsed.data.metadata ?? null,
  });
  if (parsed.data.recipeId && ["recipe_copy", "recipe_share"].includes(parsed.data.type)) {
    const field = parsed.data.type === "recipe_copy" ? recipesTable.copyCount : recipesTable.shareCount;
    await db.update(recipesTable).set({ [field.name]: sql`${field} + 1` }).where(eq(recipesTable.id, parsed.data.recipeId));
  }
  res.sendStatus(204);
});

router.post("/feedback", async (req, res): Promise<void> => {
  const parsed = SubmitFeedbackBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const counterUpdate = parsed.data.helpful
    ? { positiveFeedbackCount: sql`${recipesTable.positiveFeedbackCount} + 1` }
    : { negativeFeedbackCount: sql`${recipesTable.negativeFeedbackCount} + 1` };
  await db.transaction(async (tx) => {
    await tx.insert(feedbackTable).values({
      recipeId: parsed.data.recipeId,
      helpful: parsed.data.helpful,
      note: parsed.data.note ?? null,
    });
    await tx.update(recipesTable)
      .set(counterUpdate)
      .where(eq(recipesTable.id, parsed.data.recipeId));
  });
  res.status(201).json({ message: "Thanks for the feedback." });
});

router.post("/suggestions", async (req, res): Promise<void> => {
  const parsed = SubmitSuggestionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await db.insert(suggestionsTable).values({ query: parsed.data.query.trim() });
  await db.insert(eventsTable).values({ type: "search", query: parsed.data.query.trim() });
  res.status(201).json({ message: "Suggestion saved." });
});

router.post("/submissions", async (req, res): Promise<void> => {
  const parsed = CreateSubmissionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await db.insert(submissionsTable).values(parsed.data);
  await db.insert(eventsTable).values({ type: "recipe_submission" });
  res.status(201).json({ message: "Thanks — your workflow is in the review queue." });
});

router.get("/me", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.userId!;
  const [[saved], [history]] = await Promise.all([
    db.select({ count: count() }).from(savedRecipesTable).where(eq(savedRecipesTable.userId, userId)),
    db.select({ count: count() }).from(historyTable).where(eq(historyTable.userId, userId)),
  ]);
  res.json({ userId, displayName: "AI Recipes member", savedCount: Number(saved?.count ?? 0), historyCount: Number(history?.count ?? 0) });
});

router.get("/me/saved", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const rows = await db.select(cardColumns).from(savedRecipesTable).innerJoin(recipesTable, eq(savedRecipesTable.recipeId, recipesTable.id)).innerJoin(categoriesTable, eq(recipesTable.categoryId, categoriesTable.id)).innerJoin(audiencesTable, eq(recipesTable.audienceId, audiencesTable.id)).where(eq(savedRecipesTable.userId, req.userId!)).orderBy(desc(savedRecipesTable.createdAt));
  res.json(ListSavedRecipesResponse.parse(rows));
});

router.post("/me/saved/:recipeId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const recipeId = parseId(req.params.recipeId);
  const [saved] = await db.insert(savedRecipesTable).values({ userId: req.userId!, recipeId }).onConflictDoNothing().returning();
  if (saved) {
    await db.update(recipesTable).set({ saveCount: sql`${recipesTable.saveCount} + 1` }).where(eq(recipesTable.id, recipeId));
    await db.insert(eventsTable).values({ type: "recipe_save", recipeId, userId: req.userId! });
  }
  res.status(201).send();
});

router.delete("/me/saved/:recipeId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const recipeId = parseId(req.params.recipeId);
  const [removed] = await db.delete(savedRecipesTable).where(and(eq(savedRecipesTable.userId, req.userId!), eq(savedRecipesTable.recipeId, recipeId))).returning();
  if (removed) {
    await db.update(recipesTable).set({ saveCount: sql`GREATEST(${recipesTable.saveCount} - 1, 0)` }).where(eq(recipesTable.id, recipeId));
    await db.insert(eventsTable).values({ type: "recipe_unsave", recipeId, userId: req.userId! });
  }
  res.sendStatus(204);
});

router.get("/me/history", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const rows = await db.select(cardColumns).from(historyTable).innerJoin(recipesTable, eq(historyTable.recipeId, recipesTable.id)).innerJoin(categoriesTable, eq(recipesTable.categoryId, categoriesTable.id)).innerJoin(audiencesTable, eq(recipesTable.audienceId, audiencesTable.id)).where(eq(historyTable.userId, req.userId!)).orderBy(desc(historyTable.viewedAt)).limit(20);
  res.json(ListHistoryResponse.parse(rows));
});

router.get("/admin/summary", requireAdmin, async (_req, res): Promise<void> => {
  const [[totals], [submissionCount]] = await Promise.all([
    db.select({
      totalRecipes: count(recipesTable.id),
      publishedRecipes: sql<number>`count(*) filter (where ${recipesTable.status} = 'PUBLISHED')`,
      draftRecipes: sql<number>`count(*) filter (where ${recipesTable.status} in ('DRAFT', 'IDEA'))`,
      testingRecipes: sql<number>`count(*) filter (where ${recipesTable.status} = 'TESTING')`,
      views: sql<number>`coalesce(sum(${recipesTable.viewCount}), 0)`,
      copies: sql<number>`coalesce(sum(${recipesTable.copyCount}), 0)`,
      saves: sql<number>`coalesce(sum(${recipesTable.saveCount}), 0)`,
      shares: sql<number>`coalesce(sum(${recipesTable.shareCount}), 0)`,
      positiveFeedback: sql<number>`coalesce(sum(${recipesTable.positiveFeedbackCount}), 0)`,
      negativeFeedback: sql<number>`coalesce(sum(${recipesTable.negativeFeedbackCount}), 0)`,
    }).from(recipesTable),
    db.select({ pendingSubmissions: count() }).from(submissionsTable).where(eq(submissionsTable.status, "PENDING")),
  ]);
  res.json(GetAdminSummaryResponse.parse(Object.fromEntries(Object.entries({ ...totals, ...submissionCount }).map(([key, value]) => [key, Number(value)]))));
});

router.get("/admin/media", requireAdmin, async (req, res): Promise<void> => {
  const recipeId = req.query.recipeId === undefined ? undefined : Number(req.query.recipeId);
  if (recipeId !== undefined && (!Number.isSafeInteger(recipeId) || recipeId <= 0)) {
    res.status(400).json({ error: "Invalid recipe ID." });
    return;
  }
  if (!getRecipeMediaConfig()) {
    res.json({ configured: false, items: [] });
    return;
  }
  const items = await listRecipeMedia(recipeId ? `recipes/${recipeId}/` : "recipes/");
  res.json({ configured: true, items });
});

const parseRecipeImage = express.raw({ type: allowedImageTypes, limit: getRecipeMediaMaxBytes() });
router.post("/admin/media/upload", requireAdmin, (req, res, next) => {
  parseRecipeImage(req, res, (error?: NodeJS.ErrnoException & { status?: number }) => {
    if (error) {
      res.status(error.status === 413 ? 413 : 400).json({ error: error.status === 413 ? "Image exceeds the configured size limit." : "Image upload could not be read." });
      return;
    }
    next();
  });
}, async (req, res): Promise<void> => {
  const recipeId = req.query.recipeId === undefined ? undefined : Number(req.query.recipeId);
  const purpose = req.query.purpose === "cover" ? "cover" : req.query.purpose === undefined || req.query.purpose === "sections" ? "sections" : undefined;
  const contentType = req.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (recipeId !== undefined && (!Number.isSafeInteger(recipeId) || recipeId <= 0)) {
    res.status(400).json({ error: "Invalid recipe ID." });
    return;
  }
  if (!purpose || !allowedImageTypes.includes(contentType) || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    res.status(400).json({ error: "Upload a JPEG, PNG, WebP, or AVIF image and choose a valid purpose." });
    return;
  }
  if (!getRecipeMediaConfig()) {
    res.status(503).json({ error: "Recipe image storage is not configured." });
    return;
  }
  try {
    const item = await uploadRecipeMedia({ bytes: req.body, contentType, recipeId, purpose });
    if (!item) {
      res.status(503).json({ error: "Recipe image storage is not configured." });
      return;
    }
    res.status(201).json(item);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Image content")) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.post("/admin/categories", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAdminCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [category] = await db.insert(categoriesTable).values(parsed.data).returning();
    res.status(201).json({ ...category, recipeCount: 0 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "A category with this slug already exists." });
      return;
    }
    throw error;
  }
});

router.patch("/admin/categories/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAdminCategoryParams.safeParse(req.params);
  const parsed = UpdateAdminCategoryBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid category data." });
    return;
  }
  try {
    const [category] = await db.update(categoriesTable)
      .set(parsed.data)
      .where(eq(categoriesTable.id, params.data.id))
      .returning();
    if (!category) {
      res.status(404).json({ error: "Category not found." });
      return;
    }
    const [result] = await db.select({ recipeCount: count(recipesTable.id) })
      .from(recipesTable)
      .where(and(eq(recipesTable.categoryId, category.id), eq(recipesTable.status, "PUBLISHED")));
    res.json({ ...category, recipeCount: Number(result?.recipeCount ?? 0) });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "A category with this slug already exists." });
      return;
    }
    throw error;
  }
});

router.delete("/admin/categories/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteAdminCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid category ID." });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [category] = await tx.select({ id: categoriesTable.id })
        .from(categoriesTable)
        .where(eq(categoriesTable.id, params.data.id));
      if (!category) return { kind: "not-found" as const };

      const [usage] = await tx.select({ recipeCount: count(recipesTable.id) })
        .from(recipesTable)
        .where(eq(recipesTable.categoryId, category.id));
      const recipeCount = Number(usage?.recipeCount ?? 0);
      if (recipeCount > 0) return { kind: "in-use" as const, recipeCount };

      const [deleted] = await tx.delete(categoriesTable)
        .where(eq(categoriesTable.id, category.id))
        .returning({ id: categoriesTable.id });
      return deleted ? { kind: "deleted" as const } : { kind: "not-found" as const };
    });

    if (result.kind === "not-found") {
      res.status(404).json({ error: "Category not found." });
      return;
    }
    if (result.kind === "in-use") {
      res.status(409).json({
        error: `Category cannot be deleted while ${result.recipeCount} recipe${result.recipeCount === 1 ? " is" : "s are"} assigned to it.`,
      });
      return;
    }
    res.status(204).end();
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23503") {
      res.status(409).json({ error: "Category cannot be deleted while recipes are assigned to it." });
      return;
    }
    throw error;
  }
});

router.post("/admin/audiences", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAdminAudienceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [audience] = await db.insert(audiencesTable).values(parsed.data).returning();
    res.status(201).json({ ...audience, recipeCount: 0 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "An audience with this slug already exists." });
      return;
    }
    throw error;
  }
});

router.patch("/admin/audiences/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAdminAudienceParams.safeParse(req.params);
  const parsed = UpdateAdminAudienceBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid audience data." });
    return;
  }
  try {
    const [audience] = await db.update(audiencesTable)
      .set(parsed.data)
      .where(eq(audiencesTable.id, params.data.id))
      .returning();
    if (!audience) {
      res.status(404).json({ error: "Audience not found." });
      return;
    }
    const [result] = await db.select({ recipeCount: countDistinct(recipesTable.id) })
      .from(recipeAudiencesTable)
      .innerJoin(recipesTable, eq(recipeAudiencesTable.recipeId, recipesTable.id))
      .where(and(eq(recipeAudiencesTable.audienceId, audience.id), eq(recipesTable.status, "PUBLISHED")));
    res.json({ ...audience, recipeCount: Number(result?.recipeCount ?? 0) });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "An audience with this slug already exists." });
      return;
    }
    throw error;
  }
});

router.get("/admin/recipes", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListAdminRecipesQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const pageSize = 50;
  const offset = (parsed.data.page - 1) * pageSize;
  const search = parsed.data.q?.trim();
  const where = and(
    search
      ? or(
          ilike(recipesTable.title, `%${search}%`),
          ilike(recipesTable.shortDescription, `%${search}%`),
          ilike(recipesTable.problem, `%${search}%`),
          ilike(recipesTable.subcategory, `%${search}%`),
        )
      : undefined,
    parsed.data.status ? eq(recipesTable.status, parsed.data.status) : undefined,
    parsed.data.category ? eq(categoriesTable.slug, parsed.data.category) : undefined,
  );
  const [items, [totalRow]] = await Promise.all([
    db.select({ ...cardColumns, status: recipesTable.status })
      .from(recipesTable)
      .innerJoin(categoriesTable, eq(recipesTable.categoryId, categoriesTable.id))
      .innerJoin(audiencesTable, eq(recipesTable.audienceId, audiencesTable.id))
      .where(where)
      .orderBy(desc(recipesTable.updatedAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count(recipesTable.id) })
      .from(recipesTable)
      .innerJoin(categoriesTable, eq(recipesTable.categoryId, categoriesTable.id))
      .where(where),
  ]);
  res.json({ items, page: parsed.data.page, pageSize, total: Number(totalRow?.total ?? 0), query: search ?? "" });
});

router.post("/admin/recipes/bulk-update", requireAdmin, async (req, res): Promise<void> => {
  const parsed = BulkUpdateAdminRecipesBody.safeParse(req.body);
  if (!parsed.success
    || (!parsed.data.status && parsed.data.categoryId === undefined)
    || (parsed.success && new Set(parsed.data.ids).size !== parsed.data.ids.length)) {
    res.status(400).json({
      error: !parsed.success
        ? parsed.error.message
        : new Set(parsed.data.ids).size !== parsed.data.ids.length
          ? "Recipe IDs must be unique."
          : "Choose a status or category update.",
    });
    return;
  }
  const { categoryId, status } = parsed.data;

  const result = await db.transaction(async (tx) => {
    if (categoryId !== undefined) {
      const [category] = await tx.select({ id: categoriesTable.id })
        .from(categoriesTable)
        .where(eq(categoriesTable.id, categoryId));
      if (!category) return { kind: "not-found" as const, error: "Category not found." };
    }

    const existing = await tx.select({ id: recipesTable.id })
      .from(recipesTable)
      .where(inArray(recipesTable.id, parsed.data.ids));
    if (existing.length !== parsed.data.ids.length) {
      const existingIds = new Set(existing.map(({ id }) => id));
      const missingIds = parsed.data.ids.filter((id) => !existingIds.has(id));
      return { kind: "not-found" as const, error: `Recipes not found: ${missingIds.join(", ")}.` };
    }

    const updated = await tx.update(recipesTable).set({
      ...(status ? { status, publishedAt: new Date() } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
      updatedAt: new Date(),
    }).where(inArray(recipesTable.id, parsed.data.ids)).returning({ id: recipesTable.id });
    return { kind: "updated" as const, updatedCount: updated.length };
  });

  if (result.kind === "not-found") {
    res.status(404).json({ error: result.error });
    return;
  }
  res.json(result);
});

router.get("/admin/recipes/export-csv", requireAdmin, async (_req, res): Promise<void> => {
  const [rows, audienceRows] = await Promise.all([
    db.select({
      recipe: recipesTable,
      category: categoriesTable.name,
      audience: audiencesTable.name,
    }).from(recipesTable)
      .innerJoin(categoriesTable, eq(recipesTable.categoryId, categoriesTable.id))
      .innerJoin(audiencesTable, eq(recipesTable.audienceId, audiencesTable.id))
      .orderBy(asc(recipesTable.id)),
    db.select({ recipeId: recipeAudiencesTable.recipeId, audience: audiencesTable.name })
      .from(recipeAudiencesTable)
      .innerJoin(audiencesTable, eq(recipeAudiencesTable.audienceId, audiencesTable.id)),
  ]);
  const audienceNamesByRecipe = new Map<number, string[]>();
  for (const item of audienceRows) {
    audienceNamesByRecipe.set(item.recipeId, [...(audienceNamesByRecipe.get(item.recipeId) ?? []), item.audience]);
  }
  const csv = buildRecipeCsvExport(rows.map(({ recipe, category, audience }) => ({
    recipe,
    category,
    audience,
    audiences: audienceNamesByRecipe.get(recipe.id) ?? [],
  })));
  res.status(200)
    .setHeader("Content-Disposition", 'attachment; filename="ai-recipes-v2.csv"')
    .type("text/csv; charset=utf-8")
    .send(csv);
});

router.post("/admin/recipes", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAdminRecipeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const layoutError = validateRecipeLayout(parsed.data.layoutMode, parsed.data.layoutConfig);
  if (layoutError) { res.status(400).json({ error: layoutError }); return; }
  const promptConfigurationError = validateRecipePromptConfiguration(parsed.data.guide, parsed.data.prompt);
  if (promptConfigurationError) { res.status(400).json({ error: promptConfigurationError }); return; }
  const [created] = await db.insert(recipesTable).values({
    ...parsed.data,
    testedAt: parsed.data.testedAt ? parsed.data.testedAt.toISOString().slice(0, 10) : null,
  }).returning();
  await addRecipeAudiences(created.id, [created.audienceId]);
  const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, created.categoryId));
  const [audience] = await db.select().from(audiencesTable).where(eq(audiencesTable.id, created.audienceId));
  res.status(201).json(recipeResponse(created, category, audience));
});

const parseCsvBody = express.text({ type: "text/csv", limit: "5mb" });

router.post("/admin/recipes/import-csv", requireAdmin, (req, res, next) => {
  parseCsvBody(req, res, (error?: NodeJS.ErrnoException & { status?: number }) => {
    if (error) {
      res.status(error.status ?? 400).json({ error: "CSV upload must be valid and no larger than 5 MB." });
      return;
    }
    next();
  });
}, async (req, res): Promise<void> => {
  const parsedBody = ImportAdminRecipesCsvBody.safeParse(req.body);
  const csvText = typeof req.body === "string" ? req.body : parsedBody.success ? parsedBody.data.csv : "";
  const preview = parsedBody.success && parsedBody.data.preview === true;
  if (!csvText.trim()) {
    res.status(400).json({ error: "Upload a CSV file with a header row and at least one recipe." });
    return;
  }

  let records;
  try {
    records = parseRecipeCsv(csvText);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "The CSV could not be parsed." });
    return;
  }

  if (records.length > 500) {
    res.status(400).json({ error: "A CSV import can contain at most 500 recipes." });
    return;
  }

  const rows = records.map((record, index) => ({
    record,
    rowNumber: index + 2,
    categoryName: (record.category ?? "").trim().replace(/\s+/g, " "),
    audienceNames: splitRecipeCsvAudiences(record["target audience"] ?? record.audience ?? ""),
    slug: (record["url slug"] ?? record.slug ?? "").trim().toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""),
  }));
  const [existingCategories, existingAudiences, existingRecipes] = await Promise.all([
    db.select().from(categoriesTable),
    db.select().from(audiencesTable),
    db.select({ id: recipesTable.id, slug: recipesTable.slug }).from(recipesTable),
  ]);
  const categoryByNameOrSlug = new Map(existingCategories.flatMap((item) => [
    [normalizeRecipeCsvHeader(item.name), item] as const,
    [normalizeRecipeCsvHeader(item.slug), item] as const,
  ]));
  const audienceByNameOrSlug = new Map(existingAudiences.flatMap((item) => [
    [normalizeRecipeCsvHeader(item.name), item] as const,
    [normalizeRecipeCsvHeader(item.slug), item] as const,
  ]));
  const newCategories = new Map<string, { name: string; slug: string; description: string }>();
  const newAudiences = new Map<string, { name: string; slug: string; description: string }>();
  for (const row of rows) {
    const key = normalizeRecipeCsvHeader(row.categoryName);
    const categorySlugKey = normalizeRecipeCsvHeader(recipeTaxonomySlug(row.categoryName));
    if (key && !categoryByNameOrSlug.has(key)) {
      const existingBySlug = categoryByNameOrSlug.get(categorySlugKey);
      if (existingBySlug) {
        categoryByNameOrSlug.set(key, existingBySlug);
      } else {
        const candidate = createRecipeTaxonomyCandidate(row.categoryName);
        if (candidate.insert.slug) {
          categoryByNameOrSlug.set(key, candidate.lookup);
          categoryByNameOrSlug.set(normalizeRecipeCsvHeader(candidate.insert.slug), candidate.lookup);
          newCategories.set(key, candidate.insert);
        }
      }
    }
    for (const audienceName of row.audienceNames) {
      const audienceKey = normalizeRecipeCsvHeader(audienceName);
      if (!audienceKey || audienceByNameOrSlug.has(audienceKey)) continue;
      const audienceSlugKey = normalizeRecipeCsvHeader(recipeTaxonomySlug(audienceName));
      const existingBySlug = audienceByNameOrSlug.get(audienceSlugKey);
      if (existingBySlug) {
        audienceByNameOrSlug.set(audienceKey, existingBySlug);
        continue;
      }
      const candidate = createRecipeTaxonomyCandidate(audienceName);
      if (candidate.insert.slug) {
        audienceByNameOrSlug.set(audienceKey, candidate.lookup);
        audienceByNameOrSlug.set(normalizeRecipeCsvHeader(candidate.insert.slug), candidate.lookup);
        newAudiences.set(audienceKey, candidate.insert);
      }
    }
  }

  const existingRecipesBySlug = new Map(existingRecipes.map((recipe) => [recipe.slug, recipe]));
  const seenSlugs = new Set<string>();
  const plannedRows: Array<{
    row: number;
    slug: string;
    data: ReturnType<typeof CreateAdminRecipeBody.parse>;
    categoryKey: string;
    categorySlug: string;
    audienceKeys: string[];
    audienceSlugs: string[];
    action: "create" | "update";
    existingRecipeId?: number;
  }> = [];
  const results: Array<{ row: number; slug: string; status: "planned" | "created" | "updated" | "failed"; message: string; warnings?: string[] }> = [];

  for (const row of rows) {
    const slug = row.slug;
    if (!slug) {
      results.push({ row: row.rowNumber, slug: row.record["url slug"] ?? "", status: "failed", message: "URL Slug is required and must contain letters, numbers, or hyphens." });
      continue;
    }
    const actionValue = normalizeRecipeCsvHeader(row.record["csv action"]?.trim() || "create");
    const action = actionValue === "update" ? "update" : actionValue === "create" ? "create" : undefined;
    const existingRecipe = existingRecipesBySlug.get(slug);
    if (!action) {
      results.push({ row: row.rowNumber, slug, status: "failed", message: 'CSV Action must be either "create" or "update".' });
      continue;
    }
    if ((action === "create" && existingRecipe) || (action === "update" && !existingRecipe) || seenSlugs.has(slug)) {
      results.push({
        row: row.rowNumber,
        slug,
        status: "failed",
        message: seenSlugs.has(slug)
          ? "This slug appears more than once in the CSV."
          : action === "create"
            ? "This slug already exists; set CSV Action to update to explicitly replace its recipe content."
            : "CSV Action is update, but no existing recipe has this slug.",
      });
      continue;
    }
    seenSlugs.add(slug);

    const categoryKey = normalizeRecipeCsvHeader(row.categoryName);
    const audienceKeys = row.audienceNames.map(normalizeRecipeCsvHeader);
    const category = categoryByNameOrSlug.get(categoryKey);
    const rowAudiences = audienceKeys.map((key) => audienceByNameOrSlug.get(key));
    if (!category || !audienceKeys.length || rowAudiences.some((item) => !item)) {
      const missing = [
        !category ? `category "${row.categoryName}"` : "",
        ...row.audienceNames.filter((_, index) => !rowAudiences[index]).map((name) => `target audience "${name}"`),
        !audienceKeys.length ? "target audience is empty" : "",
      ].filter(Boolean).join(" and ");
      results.push({ row: row.rowNumber, slug, status: "failed", message: `Could not resolve ${missing}.` });
      continue;
    }

    try {
      const input = mapRecipeCsvRecord(row.record, category.id, rowAudiences[0]!.id);
      const parsed = CreateAdminRecipeBody.safeParse(input);
      if (!parsed.success) {
        const message = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
        results.push({ row: row.rowNumber, slug, status: "failed", message });
        continue;
      }
      const layoutError = validateRecipeLayout(parsed.data.layoutMode, parsed.data.layoutConfig);
      const inputError = validateRecipePromptConfiguration(parsed.data.guide, parsed.data.prompt);
      if (layoutError || inputError) {
        results.push({ row: row.rowNumber, slug, status: "failed", message: [layoutError, inputError].filter(Boolean).join("; ") });
        continue;
      }
      plannedRows.push({
        row: row.rowNumber,
        slug,
        data: parsed.data,
        categoryKey,
        categorySlug: recipeTaxonomySlug(row.categoryName),
        audienceKeys,
        audienceSlugs: row.audienceNames.map(recipeTaxonomySlug),
        action,
        existingRecipeId: existingRecipe?.id,
      });
      results.push({ row: row.rowNumber, slug, status: "planned", message: `${action === "update" ? "Update" : "Create"} · ${parsed.data.status}` });
    } catch (error) {
      results.push({
        row: row.rowNumber,
        slug,
        status: "failed",
        message: error instanceof Error ? error.message : "The recipe row could not be parsed.",
      });
    }
  }

  const failedCount = results.filter((result) => result.status === "failed").length;
  if (preview || failedCount > 0) {
    res.json({
      createdCount: 0,
      failedCount,
      preview,
      results: failedCount ? results.map((result) => result.status === "planned"
        ? { ...result, status: "failed" as const, message: "Not imported because another row needs correction." }
        : result) : results,
    });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      if (newCategories.size) {
        await tx.insert(categoriesTable).values([...newCategories.values()]).onConflictDoNothing();
      }
      if (newAudiences.size) {
        await tx.insert(audiencesTable).values([...newAudiences.values()]).onConflictDoNothing();
      }
      const categories = await tx.select().from(categoriesTable);
      const audiences = await tx.select().from(audiencesTable);
      for (const row of plannedRows) {
        const category = findRecipeTaxonomy(categories, row.categoryKey)
          ?? findRecipeTaxonomy(categories, row.categorySlug);
        const recipeAudiences = row.audienceKeys.map((key, index) =>
          findRecipeTaxonomy(audiences, key)
          ?? findRecipeTaxonomy(audiences, row.audienceSlugs[index] ?? ""),
        );
        if (!category || recipeAudiences.some((item) => !item)) {
          throw new Error(`Could not resolve taxonomy for recipe "${row.slug}" during commit.`);
        }
        const values = {
          ...row.data,
          categoryId: category.id,
          audienceId: recipeAudiences[0]!.id,
          slug: row.slug,
          testedAt: row.data.testedAt ? row.data.testedAt.toISOString().slice(0, 10) : null,
          publishedAt: row.data.status === "PUBLISHED" ? new Date() : null,
        };
        let recipeId: number;
        if (row.action === "update" && row.existingRecipeId) {
          const [updated] = await tx.update(recipesTable).set({ ...values, updatedAt: new Date() })
            .where(eq(recipesTable.id, row.existingRecipeId)).returning({ id: recipesTable.id });
          if (!updated) throw new Error(`Recipe "${row.slug}" no longer exists.`);
          recipeId = updated.id;
          await tx.delete(recipeAudiencesTable).where(eq(recipeAudiencesTable.recipeId, recipeId));
        } else {
          const [created] = await tx.insert(recipesTable).values(values).returning({ id: recipesTable.id });
          recipeId = created.id;
        }
        await tx.insert(recipeAudiencesTable)
          .values(recipeAudiences.map((item) => ({ recipeId, audienceId: item!.id })))
          .onConflictDoNothing();
      }
    });
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error
        ? `CSV import was rolled back: ${error.message}`
        : "CSV import was rolled back because the recipes could not be saved.",
    });
    return;
  }

  res.json({
    createdCount: plannedRows.filter((row) => row.action === "create").length,
    updatedCount: plannedRows.filter((row) => row.action === "update").length,
    failedCount: 0,
    preview: false,
    results: results.map((result, index) => ({
      ...result,
      status: plannedRows[index]?.action === "update" ? "updated" as const : "created" as const,
    })),
  });
});

router.patch("/admin/recipes/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAdminRecipeParams.safeParse(req.params);
  const parsed = UpdateAdminRecipeBody.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid recipe data." }); return; }
  const layoutError = validateRecipeLayout(parsed.data.layoutMode, parsed.data.layoutConfig);
  if (layoutError) { res.status(400).json({ error: layoutError }); return; }
  const promptConfigurationError = validateRecipePromptConfiguration(parsed.data.guide, parsed.data.prompt);
  if (promptConfigurationError) { res.status(400).json({ error: promptConfigurationError }); return; }
  const [previous] = await db.select({ audienceId: recipesTable.audienceId })
    .from(recipesTable)
    .where(eq(recipesTable.id, params.data.id));
  const [updated] = await db.update(recipesTable).set({
    ...parsed.data,
    testedAt: parsed.data.testedAt ? parsed.data.testedAt.toISOString().slice(0, 10) : null,
    updatedAt: new Date(),
    publishedAt: parsed.data.status === "PUBLISHED" ? new Date() : undefined,
  }).where(eq(recipesTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Recipe not found" }); return; }
  if (previous && previous.audienceId !== updated.audienceId) {
    await replaceRecipeAudiences(updated.id, [updated.audienceId]);
  }
  const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, updated.categoryId));
  const [audience] = await db.select().from(audiencesTable).where(eq(audiencesTable.id, updated.audienceId));
  res.json(recipeResponse(updated, category, audience));
});

router.post("/admin/recipes/:id/duplicate", requireAdmin, async (req, res): Promise<void> => {
  const params = DuplicateAdminRecipeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [source] = await db.select().from(recipesTable).where(eq(recipesTable.id, params.data.id));
  if (!source) { res.status(404).json({ error: "Recipe not found" }); return; }
  const [created] = await db.insert(recipesTable).values({ ...source, id: undefined, title: `${source.title} — copy`, slug: `${source.slug}-copy-${Date.now()}`, status: "DRAFT", featured: false, trending: false, recipeOfDay: false, version: "1.0", publishedAt: null, viewCount: 0, copyCount: 0, saveCount: 0, shareCount: 0, positiveFeedbackCount: 0, negativeFeedbackCount: 0, createdAt: undefined, updatedAt: undefined }).returning();
  const sourceAudiences = await db.select({ audienceId: recipeAudiencesTable.audienceId })
    .from(recipeAudiencesTable)
    .where(eq(recipeAudiencesTable.recipeId, source.id));
  await addRecipeAudiences(created.id, sourceAudiences.map(({ audienceId }) => audienceId).length
    ? sourceAudiences.map(({ audienceId }) => audienceId)
    : [created.audienceId]);
  const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, created.categoryId));
  const [audience] = await db.select().from(audiencesTable).where(eq(audiencesTable.id, created.audienceId));
  res.status(201).json(recipeResponse(created, category, audience));
});

router.delete("/admin/recipes/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteAdminRecipeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const recipeId = params.data.id;
  
  await db.delete(savedRecipesTable).where(eq(savedRecipesTable.recipeId, recipeId));
  await db.delete(historyTable).where(eq(historyTable.recipeId, recipeId));
  await db.delete(feedbackTable).where(eq(feedbackTable.recipeId, recipeId));
  await db.delete(eventsTable).where(eq(eventsTable.recipeId, recipeId));
  
  const [deleted] = await db.delete(recipesTable).where(eq(recipesTable.id, recipeId)).returning();
  if (!deleted) { res.status(404).json({ error: "Recipe not found" }); return; }
  res.sendStatus(204);
});

router.post("/admin/recipes/generate-draft", requireAdmin, async (req, res): Promise<void> => {
  const parsed = GenerateDraftRecipeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const input = parsed.data.topicOrPrompt.trim();
  const lower = input.toLowerCase();

  // Smart Category & Audience inference
  const categories = await db.select().from(categoriesTable);
  const audiences = await db.select().from(audiencesTable);

  let chosenCategory = categories[0] ?? { id: 1, name: "Work & Career", slug: "career" };
  let chosenAudience = audiences[0] ?? { id: 1, name: "Working Professionals", slug: "professionals" };

  if (lower.includes("sales") || lower.includes("startup") || lower.includes("business") || lower.includes("outreach") || lower.includes("client") || lower.includes("marketing")) {
    chosenCategory = categories.find((c) => c.slug === "business" || c.slug === "startups") ?? chosenCategory;
    chosenAudience = audiences.find((a) => a.slug === "founders" || a.slug === "freelancers") ?? chosenAudience;
  } else if (lower.includes("code") || lower.includes("developer") || lower.includes("api") || lower.includes("refactor") || lower.includes("bug") || lower.includes("database")) {
    chosenCategory = categories.find((c) => c.slug === "career" || c.slug === "productivity") ?? chosenCategory;
    chosenAudience = audiences.find((a) => a.slug === "professionals") ?? chosenAudience;
  } else if (lower.includes("study") || lower.includes("exam") || lower.includes("revision") || lower.includes("student") || lower.includes("learn") || lower.includes("course")) {
    chosenCategory = categories.find((c) => c.slug === "education" || c.slug === "learning") ?? chosenCategory;
    chosenAudience = audiences.find((a) => a.slug === "students") ?? chosenAudience;
  } else if (lower.includes("write") || lower.includes("blog") || lower.includes("linkedin") || lower.includes("content") || lower.includes("social") || lower.includes("post")) {
    chosenCategory = categories.find((c) => c.slug === "content" || c.slug === "writing") ?? chosenCategory;
    chosenAudience = audiences.find((a) => a.slug === "creators" || a.slug === "professionals") ?? chosenAudience;
  }

  // Generate title & slug
  let cleanTitle = input
    .replace(/^["'`]|["'`]$/g, "")
    .replace(/^(write|create|generate|make|build|draft|help me with|a prompt for)\s+/i, "")
    .trim();
  cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
  if (cleanTitle.length > 70) {
    cleanTitle = cleanTitle.slice(0, 67).trim() + "...";
  }
  const cleanSlug = cleanTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 45) || `workflow-${Date.now()}`;

  const generatedDraft = {
    title: cleanTitle.length >= 3 ? cleanTitle : "High Impact AI Workflow",
    slug: cleanSlug,
    shortDescription: `A practical, step-by-step AI recipe to ${cleanTitle.toLowerCase()} with precision and clear verification.`,
    problem: `When trying to ${cleanTitle.toLowerCase()}, generic prompts often produce vague, superficial, or unverified outputs. This recipe provides structured guidance and tested constraints.`,
    categoryId: chosenCategory.id,
    audienceId: chosenAudience.id,
    subcategory: chosenCategory.name.split("&")[0]?.trim() || "Workflows",
    difficulty: "Beginner",
    estimatedTime: "12 min",
    language: "English",
    aiTools: ["Claude 3.5 Sonnet", "ChatGPT-4o", "Perplexity"],
    requiredInputs: [
      "[Context / Raw Materials or Notes]",
      "[Target Audience / Desired Recipient]",
      "[Key Constraints / Word Limit / Tone]",
      "[Desired Call to Action or Outcome]",
    ],
    steps: [
      "Gather your background notes, context, and required parameters.",
      "Paste the structured prompt into Claude or ChatGPT with your filled brackets.",
      "Review the generated output against the verification notes, adjust tone, and finalize.",
    ],
    prompt: `You are an expert specialist in ${cleanTitle}.

Objective:
Help me ${cleanTitle.toLowerCase()} effectively, cleanly, and without filler.

Inputs & Context:
- Background Information: [INSERT CONTEXT / NOTES]
- Target Audience: [INSERT AUDIENCE]
- Tone & Style: [e.g. Professional, Concise, Action-oriented]
- Key Constraints: [e.g. Maximum 300 words, use bullet points where helpful]

Instructions:
1. First, summarize the core objective in one sentence to ensure clarity.
2. Structure the output clearly with high-value, actionable points.
3. Eliminate generic advice, corporate jargon, and robotic filler.
4. Highlight any critical assumptions or items that require manual verification.

Output Format:
Provide a polished, ready-to-use version followed by 2 alternative variations if applicable.`,
    exampleInput: `Context: Launching our new customer onboarding flow next Monday.
Target Audience: New enterprise users who signed up in the last 14 days.
Tone: Warm, authoritative, concise.
Key Constraints: Under 150 words, one clear action link.`,
    exampleOutput: `Subject: Welcome aboard! Here is your 5-minute setup guide

Hi [Name],

Welcome to [Product]! To help your team get immediate value, we have pre-configured your workspace with starter templates.

Here are the 3 steps to finish onboarding:
1. Invite your core team members (Settings > Members).
2. Connect your first data source (Integrations > Add Source).
3. Schedule your complimentary 20-minute setup walkthrough: [Link].

If you run into any questions, reply directly to this email—our team is here to help.

Best,
[Your Name]`,
    refinementPrompts: [
      "Make this 30% shorter and punchier for mobile readers.",
      "Adapt the tone to be slightly more conversational and empathetic.",
      "Add a secondary follow-up variation for users who have not responded in 48 hours.",
    ],
    verificationNotes: "Check that all placeholder brackets are replaced. Ensure word count meets constraints and tone aligns with brand voice.",
    tags: [cleanSlug.split("-")[0] || "workflow", "ai-productivity", "practical"],
    status: "DRAFT",
    featured: false,
    trending: false,
    recipeOfDay: false,
    version: "1.0",
    testedAt: new Date().toISOString().slice(0, 10),
    testedWith: ["Claude 3.5 Sonnet", "ChatGPT-4o"],
    seoTitle: `${cleanTitle} — Step-by-Step AI Recipe | AI Recipes`,
    seoDescription: `Copy and run this tested AI workflow for ${cleanTitle.toLowerCase()}. Tested for real work and clear results.`,
  };

  res.json(generatedDraft);
});

router.get("/admin/submissions", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(submissionsTable).orderBy(desc(submissionsTable.createdAt));
  res.json(ListAdminSubmissionsResponse.parse(rows));
});

router.patch("/admin/submissions/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdateAdminSubmissionBody.safeParse(req.body);
  if (!parsed.success || isNaN(id)) { res.status(400).json({ error: "Invalid submission data." }); return; }
  const [updated] = await db.update(submissionsTable).set({ status: parsed.data.status }).where(eq(submissionsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Submission not found" }); return; }
  res.json(updated);
});

router.get("/admin/analytics", requireAdmin, async (_req, res): Promise<void> => {
  const searches = await db.select({ query: eventsTable.query, count: count() }).from(eventsTable).where(and(eq(eventsTable.type, "search"), sql`${eventsTable.query} is not null`)).groupBy(eventsTable.query).orderBy(desc(count())).limit(10);
  const gaps = await db.select({ query: suggestionsTable.query, count: count() }).from(suggestionsTable).groupBy(suggestionsTable.query).orderBy(desc(count())).limit(10);
  const health = await fetchCards({ where: eq(recipesTable.status, "PUBLISHED"), orderBy: asc(recipesTable.updatedAt), limit: 6 });
  res.json(GetAdminAnalyticsResponse.parse({ popularSearches: searches.map((item) => ({ query: item.query ?? "", count: Number(item.count) })), searchGaps: gaps.map((item) => ({ query: item.query, count: Number(item.count) })), contentHealth: health.map((recipe) => ({ recipe, reason: "Review freshness and test coverage" })) }));
});

export default router;