import type { Page } from '@playwright/test';

interface RecipeCard {
  id: number;
  title: string;
  slug: string;
  shortDescription: string;
  category: string;
  categorySlug: string;
  audience: string;
  audienceSlug: string;
  difficulty: string;
  estimatedTime: string;
  language: string;
  tags: string[];
  featured: boolean;
  trending: boolean;
  viewCount: number;
  copyCount: number;
  saveCount: number;
}

interface SubmissionInput {
  title: string;
  email?: string | null;
}

interface CategoryItem {
  id: number;
  name: string;
  slug: string;
  description?: string;
  recipeCount: number;
}

const category: CategoryItem = {
  id: 1,
  name: 'Writing',
  slug: 'writing',
  description: 'Practical workflows for clear writing.',
  recipeCount: 1,
};

const audience = {
  id: 1,
  name: 'Small business owners',
  slug: 'small-business-owners',
  description: 'Workflows for independent businesses.',
  recipeCount: 1,
};

export const recipeCard: RecipeCard = {
  id: 1,
  title: 'Turn a brief into a project plan',
  slug: 'brief-to-project-plan',
  shortDescription: 'Create a clear, actionable project plan from a messy brief.',
  category: category.name,
  categorySlug: category.slug,
  audience: audience.name,
  audienceSlug: audience.slug,
  difficulty: 'Beginner',
  estimatedTime: '10 minutes',
  language: 'English',
  tags: ['planning', 'writing'],
  featured: true,
  trending: true,
  viewCount: 120,
  copyCount: 28,
  saveCount: 12,
};

const recipe = {
  ...recipeCard,
  problem: 'A rough project brief is hard to turn into clear next steps.',
  subcategory: 'Planning',
  aiTools: ['ChatGPT'],
  requiredInputs: [],
  steps: ['Share the brief.', 'Review the suggested milestones.'],
  prompt: 'Turn this project brief into a practical plan with milestones and owners.',
  exampleInput: 'We need to launch a neighborhood bakery website.',
  exampleOutput: 'A milestone-based project plan with owners and dates.',
  refinementPrompts: ['Make the milestones more specific.'],
  verificationNotes: 'Confirm owners and dates with the project team.',
  status: 'published',
  version: '1',
  testedAt: '2025-01-01T00:00:00.000Z',
  testedWith: ['ChatGPT'],
  seoTitle: 'Turn a brief into a project plan',
  seoDescription: 'Turn a messy brief into a clear project plan.',
  layoutMode: 'normal',
  layoutConfig: null,
};

export interface ApiMockState {
  recipeListRequests: URL[];
  submissionRequests: SubmissionInput[];
  feedbackRequests: unknown[];
  csvImportRequests: Array<Record<string, unknown>>;
  recipeSaveRequests: Array<Record<string, unknown>>;
  recipeUpdateRequests: Array<{ id: number; body: Record<string, unknown> }>;
  bulkUpdateRequests: Array<Record<string, unknown>>;
  adminRequests: string[];
  taxonomyRequests: Array<{ method: string; pathname: string; body: unknown }>;
}

interface MockApiOptions {
  adminAuthenticated?: boolean;
  feedbackStatus?: number;
  dynamicRecipe?: boolean;
  customLayoutRecipe?: boolean;
  adminBulkEdit?: boolean;
  categories?: CategoryItem[];
}

export async function mockApi(
  page: Page,
  options: MockApiOptions = {},
): Promise<ApiMockState> {
  const categories = options.categories ?? [category];
  const state: ApiMockState = {
    recipeListRequests: [],
    submissionRequests: [],
    feedbackRequests: [],
    csvImportRequests: [],
    recipeSaveRequests: [],
    recipeUpdateRequests: [],
    bulkUpdateRequests: [],
    adminRequests: [],
    taxonomyRequests: [],
  };

  await page.route('https://**/*', (route) => route.abort('blockedbyclient'));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;
    if (
      pathname.startsWith('/api/admin/') ||
      pathname === '/api/categories' ||
      pathname === '/api/audiences'
    ) {
      state.adminRequests.push(pathname);
    }

    if (request.method() === 'POST' && pathname === '/api/submissions') {
      state.submissionRequests.push(request.postDataJSON() as SubmissionInput);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Submission received' }),
      });
      return;
    }

    if (request.method() === 'POST' && pathname === '/api/feedback') {
      state.feedbackRequests.push(request.postDataJSON());
      await route.fulfill({
        status: options.feedbackStatus ?? 201,
        contentType: 'application/json',
        body: JSON.stringify(options.feedbackStatus && options.feedbackStatus >= 400
          ? { error: 'Feedback service unavailable' }
          : { message: 'Feedback received' }),
      });
      return;
    }

    if (request.method() === 'POST' && pathname === '/api/admin/recipes/import-csv') {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.csvImportRequests.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          createdCount: body.preview ? 0 : 1,
          updatedCount: 0,
          failedCount: 0,
          preview: body.preview === true,
          results: [{
            row: 2,
            slug: 'dynamic-recipe',
            status: body.preview ? 'planned' : 'created',
            message: 'DRAFT',
          }],
        }),
      });
      return;
    }

    if (request.method() === 'POST' && pathname === '/api/admin/recipes') {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.recipeSaveRequests.push(body);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 99,
          ...body,
          category: category.name,
          categorySlug: category.slug,
          audience: audience.name,
          audienceSlug: audience.slug,
          updatedAt: new Date().toISOString(),
          publishedAt: null,
          viewCount: 0,
          copyCount: 0,
          saveCount: 0,
          shareCount: 0,
          positiveFeedbackCount: 0,
          negativeFeedbackCount: 0,
        }),
      });
      return;
    }

    if (request.method() === 'PATCH' && /^\/api\/admin\/recipes\/\d+$/.test(pathname)) {
      const body = request.postDataJSON() as Record<string, unknown>;
      const id = Number(pathname.split('/').at(-1));
      state.recipeUpdateRequests.push({ id, body });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id,
          ...body,
          category: category.name,
          categorySlug: category.slug,
          audience: audience.name,
          audienceSlug: audience.slug,
          updatedAt: new Date().toISOString(),
          publishedAt: null,
          viewCount: 0,
          copyCount: 0,
          saveCount: 0,
          shareCount: 0,
          positiveFeedbackCount: 0,
          negativeFeedbackCount: 0,
        }),
      });
      return;
    }

    if (request.method() === 'POST' && pathname === '/api/admin/recipes/bulk-update') {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.bulkUpdateRequests.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updatedCount: Array.isArray(body.ids) ? body.ids.length : 0 }),
      });
      return;
    }

    if (request.method() === 'DELETE' && /^\/api\/admin\/categories\/\d+$/.test(pathname)) {
      state.taxonomyRequests.push({ method: 'DELETE', pathname, body: null });
      const id = Number(pathname.split('/').at(-1));
      const categoryToDelete = categories.find((item) => item.id === id);
      if (categoryToDelete?.recipeCount) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: `Category cannot be deleted while ${categoryToDelete.recipeCount} recipes are assigned to it.` }),
        });
      } else {
        const categoryIndex = categories.findIndex((item) => item.id === id);
        if (categoryIndex >= 0) categories.splice(categoryIndex, 1);
        await route.fulfill({ status: 204 });
      }
      return;
    }

    if (request.method() === 'POST' && pathname === '/api/events') {
      await route.fulfill({ status: 204 });
      return;
    }

    if (request.method() === 'GET' && pathname === '/api/auth/me') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(options.adminAuthenticated
          ? {
              authenticated: true,
              user: { emailMasked: 'a***@example.com', provider: 'google' },
            }
          : { authenticated: false, user: null }),
      });
      return;
    }

    if (request.method() === 'GET' && pathname === '/api/admin/recipes') {
      const saved = state.recipeSaveRequests[0];
      const items = options.adminBulkEdit
        ? [
            { ...recipe, status: 'DRAFT', publishedAt: null },
            { ...recipe, id: 2, title: 'Prepare a customer follow-up', slug: 'customer-follow-up', category: 'Career', categorySlug: 'career', status: 'DRAFT', publishedAt: null },
          ]
        : saved ? [{
            id: 99,
            ...saved,
            category: category.name,
            categorySlug: category.slug,
            audience: audience.name,
            audienceSlug: audience.slug,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            publishedAt: null,
            viewCount: 0,
            copyCount: 0,
            saveCount: 0,
            shareCount: 0,
            positiveFeedbackCount: 0,
            negativeFeedbackCount: 0,
          }] : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items,
          total: items.length,
          page: 1,
          pageSize: 20,
        }),
      });
      return;
    }

    if (request.method() === 'GET' && pathname === '/api/admin/submissions') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (
      ['POST', 'PATCH'].includes(request.method()) &&
      /^\/api\/admin\/(categories|audiences)(\/\d+)?$/.test(pathname)
    ) {
      const body = request.postDataJSON();
      state.taxonomyRequests.push({
        method: request.method(),
        pathname,
        body,
      });
      await route.fulfill({
        status: request.method() === 'POST' ? 201 : 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          ...(body as Record<string, unknown>),
          recipeCount: 1,
        }),
      });
      return;
    }

    if (request.method() === 'GET' && pathname === '/api/home') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recipeOfDay: recipeCard,
          trending: [recipeCard],
          popular: [recipeCard],
          categories,
          audiences: [audience],
        }),
      });
      return;
    }

    if (request.method() === 'GET' && pathname === '/api/categories') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(categories),
      });
      return;
    }

    if (request.method() === 'GET' && pathname === '/api/audiences') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([audience]),
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      pathname === `/api/categories/${category.slug}`
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          name: category.name,
          slug: category.slug,
          description: category.description,
          recipes: [recipeCard],
        }),
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      pathname === `/api/audiences/${audience.slug}`
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          name: audience.name,
          slug: audience.slug,
          description: audience.description,
          recipes: [recipeCard],
        }),
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      pathname === `/api/recipes/${recipeCard.slug}/related`
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      pathname === `/api/recipes/${recipeCard.slug}`
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(options.customLayoutRecipe ? {
          ...recipe,
          prompt: 'Build a job-search plan for {{target_role}}.',
          exampleInput: '',
          exampleOutput: '',
          refinementPrompts: ['Prioritize the next three actions.'],
          verificationNotes: '',
          layoutMode: 'custom',
          layoutConfig: {
            version: 1,
            blocks: [
              { id: 'hero', type: 'hero', visible: true },
              { id: 'workflow', type: 'workflow', visible: true },
              { id: 'outcome', type: 'outcome', visible: true },
              { id: 'prompt', type: 'prompt', visible: true },
              { id: 'refinements', type: 'refinements', visible: true },
              { id: 'verification', type: 'verification', visible: true },
              { id: 'troubleshooting', type: 'troubleshooting', visible: true },
              { id: 'diagram', type: 'diagram', visible: true },
              { id: 'images', type: 'images', visible: true },
            ],
          },
          guide: {
            promptVariables: [{ name: 'target_role', label: 'Target role', type: 'text', required: true }],
            expectedOutput: { description: 'A prioritized weekly job-search plan.' },
            customContent: {
              troubleshooting: ['Add a location to narrow the role list.'],
              verificationChecklist: ['Confirm every role is currently open.'],
              workflowDiagram: 'flowchart TD\n  A[Collect target role] --> B[Build action plan]',
              images: [],
            },
          },
        } : options.dynamicRecipe ? {
          ...recipe,
          prompt: 'Write for {{target_audience}} in a {{tone}} tone. Legacy token: {{unconfigured_token}}.',
          guide: {
            promptVariables: [
              {
                name: 'target_audience',
                label: 'Target audience',
                type: 'text',
                required: true,
                helpText: 'Who should this be written for?',
                validation: { minLength: 3 },
              },
              {
                name: 'tone',
                label: 'Tone',
                type: 'dropdown',
                required: false,
                defaultValue: 'Warm',
                options: ['Warm', 'Concise'],
              },
            ],
          },
        } : recipe),
      });
      return;
    }

    if (request.method() === 'GET' && pathname === '/api/recipes') {
      state.recipeListRequests.push(url);
      const empty = url.searchParams.get('q') === 'no-results';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: empty ? [] : [recipeCard],
          page: Number(url.searchParams.get('page') || 1),
          pageSize: 9,
          total: empty ? 0 : 1,
          query: url.searchParams.get('q') || '',
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: `Unmocked API request: ${request.method()} ${pathname}` }),
    });
  });

  return state;
}
