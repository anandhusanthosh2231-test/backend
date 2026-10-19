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

const category = {
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
  adminRequests: string[];
  taxonomyRequests: Array<{ method: string; pathname: string; body: unknown }>;
}

interface MockApiOptions {
  adminAuthenticated?: boolean;
}

export async function mockApi(
  page: Page,
  options: MockApiOptions = {},
): Promise<ApiMockState> {
  const state: ApiMockState = {
    recipeListRequests: [],
    submissionRequests: [],
    feedbackRequests: [],
    adminRequests: [],
    taxonomyRequests: [],
  };

  await page.route('https://**/*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'text/plain',
      body: 'External services are disabled during browser tests.',
    }),
  );
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
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Feedback received' }),
      });
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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }),
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
          categories: [category],
          audiences: [audience],
        }),
      });
      return;
    }

    if (request.method() === 'GET' && pathname === '/api/categories') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([category]),
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
        body: JSON.stringify(recipe),
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
