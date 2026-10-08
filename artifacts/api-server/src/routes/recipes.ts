import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import express, { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import {
  CreateAdminRecipeBody,
  CreateSubmissionBody,
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
  ListAudiencesResponseItem,
  GetRecipeResponse,
  SubmitFeedbackBody,
  SubmitSuggestionBody,
  UpdateAdminRecipeBody,
  UpdateAdminRecipeParams,
  UpdateAdminSubmissionBody,
} from "@workspace/api-zod";
import {
  audiencesTable,
  categoriesTable,
  db,
  eventsTable,
  feedbackTable,
  historyTable,
  recipesTable,
  savedRecipesTable,
  submissionsTable,
  suggestionsTable,
} from "@workspace/db";
import { requireAdmin, requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { mapRecipeCsvRecord, normalizeRecipeCsvHeader, parseRecipeCsv } from "../lib/recipe-csv-import";

const router: IRouter = Router();

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
    audience ? eq(audiencesTable.slug, audience) : undefined,
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
  const [recipeOfDayRow] = await db
    .select(cardColumns)
    .from(recipesTable)
    .innerJoin(categoriesTable, eq(recipesTable.categoryId, categoriesTable.id))
    .innerJoin(audiencesTable, eq(recipesTable.audienceId, audiencesTable.id))
    .where(and(eq(recipesTable.status, "PUBLISHED"), eq(recipesTable.recipeOfDay, true)))
    .limit(1);
  const [trending, popular, categories, audiences] = await Promise.all([
    fetchCards({ where: eq(recipesTable.status, "PUBLISHED"), orderBy: desc(sql`${recipesTable.viewCount} + ${recipesTable.copyCount} * 3 + ${recipesTable.saveCount} * 4`), limit: 6 }),
    fetchCards({ where: eq(recipesTable.status, "PUBLISHED"), orderBy: desc(recipesTable.copyCount), limit: 6 }),
    db.select({ id: categoriesTable.id, name: categoriesTable.name, slug: categoriesTable.slug, description: categoriesTable.description, recipeCount: count(recipesTable.id) }).from(categoriesTable).leftJoin(recipesTable, and(eq(recipesTable.categoryId, categoriesTable.id), eq(recipesTable.status, "PUBLISHED"))).groupBy(categoriesTable.id).orderBy(asc(categoriesTable.name)),
    db.select({ id: audiencesTable.id, name: audiencesTable.name, slug: audiencesTable.slug, description: audiencesTable.description, recipeCount: count(recipesTable.id) }).from(audiencesTable).leftJoin(recipesTable, and(eq(recipesTable.audienceId, audiencesTable.id), eq(recipesTable.status, "PUBLISHED"))).groupBy(audiencesTable.id).orderBy(asc(audiencesTable.name)),
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
  const rows = await db.select({ id: audiencesTable.id, name: audiencesTable.name, slug: audiencesTable.slug, description: audiencesTable.description, recipeCount: count(recipesTable.id) }).from(audiencesTable).leftJoin(recipesTable, and(eq(recipesTable.audienceId, audiencesTable.id), eq(recipesTable.status, "PUBLISHED"))).groupBy(audiencesTable.id).orderBy(asc(audiencesTable.name));
  res.json(ListAudiencesResponse.parse(rows.map((row) => ({ ...row, recipeCount: Number(row.recipeCount) }))));
});

router.get("/audiences/:slug", async (req, res): Promise<void> => {
  const params = GetAudienceParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [audience] = await db.select().from(audiencesTable).where(eq(audiencesTable.slug, params.data.slug));
  if (!audience) { res.status(404).json({ error: "Audience not found" }); return; }
  const recipes = await fetchCards({ where: and(eq(recipesTable.audienceId, audience.id), eq(recipesTable.status, "PUBLISHED")), limit: 50 });
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
  await db.insert(feedbackTable).values({ recipeId: parsed.data.recipeId, helpful: parsed.data.helpful, note: parsed.data.note ?? null });
  const field = parsed.data.helpful ? recipesTable.positiveFeedbackCount : recipesTable.negativeFeedbackCount;
  await db.update(recipesTable).set({ [field.name]: sql`${field} + 1` }).where(eq(recipesTable.id, parsed.data.recipeId));
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
  const [saved] = await db.select({ count: count() }).from(savedRecipesTable).where(eq(savedRecipesTable.userId, userId));
  const [history] = await db.select({ count: count() }).from(historyTable).where(eq(historyTable.userId, userId));
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

async function adminRecipeRows() {
  return db.select({ recipe: recipesTable, category: categoriesTable, audience: audiencesTable }).from(recipesTable).innerJoin(categoriesTable, eq(recipesTable.categoryId, categoriesTable.id)).innerJoin(audiencesTable, eq(recipesTable.audienceId, audiencesTable.id)).orderBy(desc(recipesTable.updatedAt));
}

router.get("/admin/summary", requireAdmin, async (_req, res): Promise<void> => {
  const [totals] = await db.select({
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
  }).from(recipesTable);
  const [submissionCount] = await db.select({ pendingSubmissions: count() }).from(submissionsTable).where(eq(submissionsTable.status, "PENDING"));
  res.json(GetAdminSummaryResponse.parse(Object.fromEntries(Object.entries({ ...totals, ...submissionCount }).map(([key, value]) => [key, Number(value)]))));
});

router.get("/admin/recipes", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListAdminRecipesQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const rows = await adminRecipeRows();
  const filtered = rows.filter(({ recipe }) => (!parsed.data.q || recipe.title.toLowerCase().includes(parsed.data.q.toLowerCase())) && (!parsed.data.status || recipe.status === parsed.data.status));
  res.json({ items: filtered.map(({ recipe, category, audience }) => recipeResponse(recipe, category, audience)), page: parsed.data.page, pageSize: 50, total: filtered.length, query: parsed.data.q ?? "" });
});

router.post("/admin/recipes", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAdminRecipeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [created] = await db.insert(recipesTable).values({
    ...parsed.data,
    testedAt: parsed.data.testedAt ? parsed.data.testedAt.toISOString().slice(0, 10) : null,
  }).returning();
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

  const [categories, audiences] = await Promise.all([
    db.select().from(categoriesTable),
    db.select().from(audiencesTable),
  ]);
  const categoryByNameOrSlug = new Map(categories.flatMap((item) => [
    [normalizeRecipeCsvHeader(item.name), item] as const,
    [normalizeRecipeCsvHeader(item.slug), item] as const,
  ]));
  const audienceByNameOrSlug = new Map(audiences.flatMap((item) => [
    [normalizeRecipeCsvHeader(item.name), item] as const,
    [normalizeRecipeCsvHeader(item.slug), item] as const,
  ]));

  const rowData = records.map((record) => ({
    record,
    categoryKey: normalizeRecipeCsvHeader(record.category ?? ""),
    audienceKey: normalizeRecipeCsvHeader(record["target audience"] ?? record.audience ?? ""),
  }));
  const mappedSlugs = rowData.map(({ record }) =>
    normalizeRecipeCsvHeader(record["url slug"] ?? record.slug ?? "").replace(/ /g, "-"),
  ).filter(Boolean);
  const existingSlugs = new Set(mappedSlugs.length
    ? (await db.select({ slug: recipesTable.slug }).from(recipesTable).where(inArray(recipesTable.slug, mappedSlugs))).map(({ slug }) => slug)
    : []);
  const seenSlugs = new Set<string>();
  const results: Array<{ row: number; slug: string; status: "created" | "failed"; message: string }> = [];

  for (const [index, row] of rowData.entries()) {
    const rawSlug = row.record["url slug"] ?? row.record.slug ?? "";
    const slug = rawSlug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    const rowNumber = index + 2;

    if (!slug) {
      results.push({ row: rowNumber, slug: rawSlug, status: "failed", message: "URL Slug is required." });
      continue;
    }
    if (existingSlugs.has(slug) || seenSlugs.has(slug)) {
      results.push({ row: rowNumber, slug, status: "failed", message: "This slug already exists; existing recipes are never overwritten." });
      continue;
    }
    seenSlugs.add(slug);

    const category = categoryByNameOrSlug.get(row.categoryKey);
    const audience = audienceByNameOrSlug.get(row.audienceKey);
    if (!category || !audience) {
      const missing = [!category ? `category "${row.record.category ?? ""}"` : "", !audience ? `target audience "${row.record["target audience"] ?? row.record.audience ?? ""}"` : ""].filter(Boolean).join(" and ");
      results.push({ row: rowNumber, slug, status: "failed", message: `Unknown ${missing}; use an existing name or slug.` });
      continue;
    }

    const parsed = CreateAdminRecipeBody.safeParse(mapRecipeCsvRecord(row.record, category.id, audience.id));
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      results.push({ row: rowNumber, slug, status: "failed", message });
      continue;
    }

    try {
      const [created] = await db.insert(recipesTable).values({
        ...parsed.data,
        slug,
        testedAt: parsed.data.testedAt ? parsed.data.testedAt.toISOString().slice(0, 10) : null,
        publishedAt: parsed.data.status === "PUBLISHED" ? new Date() : null,
      }).returning();
      results.push({ row: rowNumber, slug: created.slug, status: "created", message: created.status });
    } catch {
      results.push({ row: rowNumber, slug, status: "failed", message: "Recipe could not be saved; check required fields and database constraints." });
    }
  }

  const createdCount = results.filter((result) => result.status === "created").length;
  res.json({ createdCount, failedCount: results.length - createdCount, results });
});

router.patch("/admin/recipes/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAdminRecipeParams.safeParse(req.params);
  const parsed = UpdateAdminRecipeBody.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid recipe data." }); return; }
  const [updated] = await db.update(recipesTable).set({
    ...parsed.data,
    testedAt: parsed.data.testedAt ? parsed.data.testedAt.toISOString().slice(0, 10) : null,
    updatedAt: new Date(),
    publishedAt: parsed.data.status === "PUBLISHED" ? new Date() : undefined,
  }).where(eq(recipesTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Recipe not found" }); return; }
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