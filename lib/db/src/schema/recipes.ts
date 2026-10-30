import { createInsertSchema } from "drizzle-zod";
import { desc } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const categoriesTable = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
});

export const audiencesTable = pgTable("audiences", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
});

export const recipesTable = pgTable(
  "recipes",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    shortDescription: text("short_description").notNull(),
    problem: text("problem").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categoriesTable.id),
    audienceId: integer("audience_id")
      .notNull()
      .references(() => audiencesTable.id),
    subcategory: text("subcategory").notNull(),
    difficulty: text("difficulty").notNull(),
    estimatedTime: text("estimated_time").notNull(),
    language: text("language").notNull().default("English"),
    aiTools: text("ai_tools").array().notNull().default([]),
    requiredInputs: text("required_inputs").array().notNull().default([]),
    steps: text("steps").array().notNull().default([]),
    prompt: text("prompt").notNull(),
    exampleInput: text("example_input").notNull(),
    exampleOutput: text("example_output").notNull(),
    refinementPrompts: text("refinement_prompts").array().notNull().default([]),
    verificationNotes: text("verification_notes").notNull(),
    guide: jsonb("guide"),
    tags: text("tags").array().notNull().default([]),
    status: text("status").notNull().default("DRAFT"),
    catalogue: text("catalogue").notNull().default("TASKBAKE"),
    featured: boolean("featured").notNull().default(false),
    trending: boolean("trending").notNull().default(false),
    recipeOfDay: boolean("recipe_of_day").notNull().default(false),
    version: text("version").notNull().default("1.0"),
    testedAt: date("tested_at", { mode: "string" }),
    testedWith: text("tested_with").array().notNull().default([]),
    seoTitle: text("seo_title").notNull(),
    seoDescription: text("seo_description").notNull(),
    layoutMode: text("layout_mode").notNull().default("normal"),
    layoutConfig: jsonb("layout_config"),
    viewCount: integer("view_count").notNull().default(0),
    copyCount: integer("copy_count").notNull().default(0),
    saveCount: integer("save_count").notNull().default(0),
    shareCount: integer("share_count").notNull().default(0),
    positiveFeedbackCount: integer("positive_feedback_count").notNull().default(0),
    negativeFeedbackCount: integer("negative_feedback_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    index("recipes_category_idx").on(table.categoryId),
    index("recipes_audience_idx").on(table.audienceId),
    index("recipes_status_idx").on(table.status),
    index("recipes_catalogue_status_updated_idx").on(table.catalogue, table.status, table.updatedAt),
  ],
);

export const imagekitMediaAssetsTable = pgTable(
  "imagekit_media_assets",
  {
    fileId: text("file_id").primaryKey(),
    filePath: text("file_path").notNull().unique(),
    url: text("url").notNull(),
    fileName: text("file_name").notNull(),
    fileType: text("file_type").notNull(),
    size: integer("size").notNull(),
    alt: text("alt").notNull().default(""),
    tags: text("tags").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("imagekit_media_assets_created_idx").on(table.createdAt),
    index("imagekit_media_assets_tags_idx").using("gin", table.tags),
  ],
);

export const vybeCreationsTable = pgTable(
  "vybe_creations",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    shortDescription: text("short_description").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull().default("Images"),
    contentType: text("content_type").notNull().default("image"),
    model: text("model").notNull().default(""),
    models: text("models").array().notNull().default([]),
    prompt: text("prompt").notNull().default(""),
    negativePrompt: text("negative_prompt").notNull().default(""),
    style: text("style").notNull().default(""),
    aspectRatio: text("aspect_ratio").notNull().default(""),
    parameters: jsonb("parameters").notNull().default({}),
    scene: text("scene").notNull().default(""),
    motion: text("motion").notNull().default(""),
    cameraInstructions: text("camera_instructions").notNull().default(""),
    durationSeconds: integer("duration_seconds"),
    videoUrl: text("video_url").notNull().default(""),
    posterUrl: text("poster_url").notNull().default(""),
    visualReferences: jsonb("visual_references").notNull().default([]),
    exampleOutputs: jsonb("example_outputs").notNull().default([]),
    refinementInstructions: text("refinement_instructions").notNull().default(""),
    builderInstructions: text("builder_instructions").notNull().default(""),
    tools: text("tools").array().notNull().default([]),
    demoUrl: text("demo_url").notNull().default(""),
    verificationDetails: text("verification_details").notNull().default(""),
    experienceUrl: text("experience_url").notNull().default(""),
    experienceControls: jsonb("experience_controls").notNull().default([]),
    mediaAssets: jsonb("media_assets").notNull().default([]),
    extraData: jsonb("extra_data").notNull().default({}),
    imageUrl: text("image_url").notNull().default(""),
    imageAlt: text("image_alt").notNull().default(""),
    tags: text("tags").array().notNull().default([]),
    status: text("status").notNull().default("DRAFT"),
    featured: boolean("featured").notNull().default(false),
    featuredPosition: integer("featured_position").notNull().default(0),
    trending: boolean("trending").notNull().default(false),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    index("vybe_creations_status_idx").on(table.status),
    index("vybe_creations_category_idx").on(table.category),
    index("vybe_creations_type_idx").on(table.contentType),
    index("vybe_creations_featured_idx").on(table.featured),
    index("vybe_creations_published_idx").on(table.publishedAt),
    index("vybe_creations_public_order_idx").on(table.status, table.publishedAt),
    index("vybe_creations_featured_order_idx").on(table.featured, table.featuredPosition),
  ],
);

export const vybeCsvImportJobsTable = pgTable(
  "vybe_csv_import_jobs",
  {
    id: serial("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status").notNull(),
    strategy: text("strategy").notNull(),
    totalRows: integer("total_rows").notNull().default(0),
    importedRows: integer("imported_rows").notNull().default(0),
    skippedRows: integer("skipped_rows").notNull().default(0),
    failedRows: integer("failed_rows").notNull().default(0),
    report: jsonb("report").notNull().default({}),
    adminId: text("admin_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("vybe_csv_import_jobs_created_idx").on(desc(table.createdAt)),
    index("vybe_csv_import_jobs_status_idx").on(table.status),
  ],
);

export const recipeAudiencesTable = pgTable(
  "recipe_audiences",
  {
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipesTable.id, { onDelete: "cascade" }),
    audienceId: integer("audience_id")
      .notNull()
      .references(() => audiencesTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.recipeId, table.audienceId] }),
    index("recipe_audiences_audience_idx").on(table.audienceId),
  ],
);

export const eventsTable = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(),
    recipeId: integer("recipe_id").references(() => recipesTable.id),
    query: text("query"),
    metadata: jsonb("metadata"),
    userId: text("user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("events_type_idx").on(table.type), index("events_recipe_idx").on(table.recipeId)],
);

export const feedbackTable = pgTable("feedback", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipesTable.id),
  helpful: boolean("helpful").notNull(),
  note: text("note"),
  userId: text("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const suggestionsTable = pgTable("suggestions", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const submissionsTable = pgTable("submissions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  problem: text("problem").notNull(),
  workflow: text("workflow").notNull(),
  howUsed: text("how_used").notNull(),
  email: text("email"),
  status: text("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const savedRecipesTable = pgTable(
  "saved_recipes",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipesTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("saved_recipes_user_recipe_idx").on(table.userId, table.recipeId)],
);

export const historyTable = pgTable(
  "recipe_history",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipesTable.id),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("history_user_idx").on(table.userId, table.viewedAt)],
);

export const insertCategorySchema = createInsertSchema(categoriesTable).omit({ id: true });
export const insertAudienceSchema = createInsertSchema(audiencesTable).omit({ id: true });
export const insertRecipeSchema = createInsertSchema(recipesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  viewCount: true,
  copyCount: true,
  saveCount: true,
  shareCount: true,
  positiveFeedbackCount: true,
  negativeFeedbackCount: true,
  publishedAt: true,
});
export const insertVybeCreationSchema = createInsertSchema(vybeCreationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
});
export const insertEventSchema = createInsertSchema(eventsTable).omit({ id: true, createdAt: true });
export const insertFeedbackSchema = createInsertSchema(feedbackTable).omit({ id: true, createdAt: true });
export const insertSuggestionSchema = createInsertSchema(suggestionsTable).omit({ id: true, createdAt: true });
export const insertSubmissionSchema = createInsertSchema(submissionsTable).omit({ id: true, createdAt: true });
export const insertSavedRecipeSchema = createInsertSchema(savedRecipesTable).omit({ id: true, createdAt: true });
export const insertHistorySchema = createInsertSchema(historyTable).omit({ id: true, viewedAt: true });

export type Category = typeof categoriesTable.$inferSelect;
export type Audience = typeof audiencesTable.$inferSelect;
export type Recipe = typeof recipesTable.$inferSelect;
export type VybeCreation = typeof vybeCreationsTable.$inferSelect;
export type Event = typeof eventsTable.$inferSelect;
export type Submission = typeof submissionsTable.$inferSelect;
export type Feedback = typeof feedbackTable.$inferSelect;
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type InsertVybeCreation = z.infer<typeof insertVybeCreationSchema>;