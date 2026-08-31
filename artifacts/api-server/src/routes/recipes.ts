import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import {
  CreateAdminRecipeBody,
  CreateSubmissionBody,
  DuplicateAdminRecipeParams,
  TrackEventBody,
  GetAdminAnalyticsResponse,
  GetAdminSummaryResponse,
  GetAudienceParams,
  GetCategoryParams,
  GetRecipeParams,
  GetRelatedRecipesParams,
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
  const limit = Math.min(Number(req.query.limit ?? 3), 6);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const row = await findRecipe(params.data.slug);
  if (!row) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }
  const related = await fetchCards({
    where: and(
      eq(recipesTable.status, "PUBLISHED"),
      sql`${recipesTable.id} <> ${row.recipe.id}`,
      or(eq(recipesTable.categoryId, row.recipe.categoryId), eq(recipesTable.audienceId, row.recipe.audienceId)),
    ),
    limit,
  });
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
  await db.insert(eventsTable).values({ type: parsed.data.type, recipeId: parsed.data.recipeId ?? null, query: parsed.data.query ?? null });
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

router.get("/admin/summary", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
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

router.get("/admin/recipes", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListAdminRecipesQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const rows = await adminRecipeRows();
  const filtered = rows.filter(({ recipe }) => (!parsed.data.q || recipe.title.toLowerCase().includes(parsed.data.q.toLowerCase())) && (!parsed.data.status || recipe.status === parsed.data.status));
  res.json({ items: filtered.map(({ recipe, category, audience }) => recipeResponse(recipe, category, audience)), page: parsed.data.page, pageSize: 50, total: filtered.length, query: parsed.data.q ?? "" });
});

router.post("/admin/recipes", requireAuth, requireAdmin, async (req, res): Promise<void> => {
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

router.patch("/admin/recipes/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
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

router.post("/admin/recipes/:id/duplicate", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = DuplicateAdminRecipeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [source] = await db.select().from(recipesTable).where(eq(recipesTable.id, params.data.id));
  if (!source) { res.status(404).json({ error: "Recipe not found" }); return; }
  const [created] = await db.insert(recipesTable).values({ ...source, id: undefined, title: `${source.title} — copy`, slug: `${source.slug}-copy-${Date.now()}`, status: "DRAFT", featured: false, trending: false, recipeOfDay: false, version: "1.0", publishedAt: null, viewCount: 0, copyCount: 0, saveCount: 0, shareCount: 0, positiveFeedbackCount: 0, negativeFeedbackCount: 0, createdAt: undefined, updatedAt: undefined }).returning();
  const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, created.categoryId));
  const [audience] = await db.select().from(audiencesTable).where(eq(audiencesTable.id, created.audienceId));
  res.status(201).json(recipeResponse(created, category, audience));
});

router.get("/admin/submissions", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(submissionsTable).orderBy(desc(submissionsTable.createdAt));
  res.json(ListAdminSubmissionsResponse.parse(rows));
});

router.get("/admin/analytics", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const searches = await db.select({ query: eventsTable.query, count: count() }).from(eventsTable).where(and(eq(eventsTable.type, "search"), sql`${eventsTable.query} is not null`)).groupBy(eventsTable.query).orderBy(desc(count())).limit(10);
  const gaps = await db.select({ query: suggestionsTable.query, count: count() }).from(suggestionsTable).groupBy(suggestionsTable.query).orderBy(desc(count())).limit(10);
  const health = await fetchCards({ where: eq(recipesTable.status, "PUBLISHED"), orderBy: asc(recipesTable.updatedAt), limit: 6 });
  res.json(GetAdminAnalyticsResponse.parse({ popularSearches: searches.map((item) => ({ query: item.query ?? "", count: Number(item.count) })), searchGaps: gaps.map((item) => ({ query: item.query, count: Number(item.count) })), contentHealth: health.map((recipe) => ({ recipe, reason: "Review freshness and test coverage" })) }));
});

export default router;