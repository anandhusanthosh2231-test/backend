import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures';

test('home page navigates into the recipe library and a recipe', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto('/');
  await expect(
    page.getByRole('heading', {
      name: 'Practical AI workflows you can actually use.',
    }),
  ).toBeVisible();

  await page.getByTestId('link-hero-explore').click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(
    page.getByRole('heading', { name: 'Explore AI Recipes' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Turn a brief into a project plan' }).first().click();
  await expect(page).toHaveURL(/\/recipes\/brief-to-project-plan$/);
  await expect(
    page.getByRole('heading', { name: 'Turn a brief into a project plan' }),
  ).toBeVisible();
});

test('search and category filters are sent to the recipe API', async ({
  page,
}) => {
  const api = await mockApi(page);
  await page.goto('/recipes');

  await page.getByTestId('input-library-search').fill('project plan');
  await page.getByTestId('button-library-search').click();
  await expect(page).toHaveURL(/q=project%20plan/);
  await expect
    .poll(() =>
      api.recipeListRequests.some(
        (url) => url.searchParams.get('q') === 'project plan',
      ),
    )
    .toBe(true);

  await page.getByTestId('chip-category-writing').first().click();
  await expect
    .poll(() =>
      api.recipeListRequests.some(
        (url) => url.searchParams.get('category') === 'writing',
      ),
    )
    .toBe(true);
});

test('empty search results can be cleared back to the recipe library', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto('/recipes?q=no-results');
  await expect(
    page.getByRole('heading', { name: 'No recipes found' }),
  ).toBeVisible();

  await page.getByTestId('button-clear-filters').click();
  await expect(page.getByTestId('input-library-search')).toHaveValue('');
  await expect(
    page.getByRole('link', { name: 'Turn a brief into a project plan' }).first(),
  ).toBeVisible();
});

test('recipe prompt copy and helpful feedback work', async ({ page }) => {
  const api = await mockApi(page);
  await page.goto('/recipes/brief-to-project-plan');

  await page.getByTestId('button-quick-copy').click();
  await expect(page.getByTestId('button-quick-copy')).toContainText('Copied');
  await page.getByTestId('button-feedback-yes').click();
  await expect
    .poll(() => api.feedbackRequests.length)
    .toBe(1);
  expect(api.feedbackRequests[0]).toMatchObject({
    recipeId: 1,
    helpful: true,
  });
});

test('submitting a workflow validates required fields and shows success', async ({
  page,
}) => {
  const api = await mockApi(page);
  await page.goto('/submit');

  await page.getByTestId('button-submit-workflow').click();
  await expect(page.getByTestId('input-submit-title')).toBeFocused();
  expect(api.submissionRequests).toHaveLength(0);

  await page.getByTestId('input-submit-title').fill('Plan a project launch');
  await page
    .getByTestId('input-submit-problem')
    .fill('A launch plan needs clear milestones and ownership.');
  await page
    .getByTestId('input-submit-workflow')
    .fill('Give the project brief to the AI and ask it to list milestones, owners, and dates.');
  await page
    .getByTestId('input-submit-how-used')
    .fill('The team reviewed each milestone and confirmed its owner.');
  await page.getByTestId('button-submit-workflow').click();

  await expect(
    page.getByRole('heading', {
      name: 'That is exactly the kind of thing we want to test.',
    }),
  ).toBeVisible();
  expect(api.submissionRequests).toHaveLength(1);
  expect(api.submissionRequests[0]).toMatchObject({
    title: 'Plan a project launch',
    email: null,
  });
});

test('category and audience collections open from their index pages', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto('/categories');
  await page.getByTestId('link-category-1').click();
  await expect(page).toHaveURL(/\/categories\/writing$/);
  await expect(page.getByRole('heading', { name: 'Writing' })).toBeVisible();

  await page.goto('/audiences');
  await page.getByTestId('link-audience-1').click();
  await expect(page).toHaveURL(/\/audiences\/small-business-owners$/);
  await expect(
    page.getByRole('heading', { name: 'Small business owners' }),
  ).toBeVisible();
});

test('mobile bottom navigation opens the categories page', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const mobileNavigation = page.getByRole('navigation', {
    name: 'Mobile Navigation',
  });
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole('link', { name: 'Categories' }).click();
  await expect(page).toHaveURL(/\/categories$/);
  await expect(page.getByRole('heading', { name: 'Start with the work.' })).toBeVisible();
});

test('admin route presents the authorization gateway and explains denied access', async ({
  page,
}) => {
  const api = await mockApi(page);
  const adminPath = process.env.VITE_ADMIN_PATH || '/__admin_path_not_configured__';
  await page.goto(`${adminPath}?error=not_allowed`);
  await expect(
    page.getByRole('heading', { name: 'Admin Authorization' }),
  ).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(
    page.getByRole('alert').getByText(/not on the admin allow-list/i),
  ).toBeVisible();
  await expect(page.getByTestId('button-admin-login-google')).toBeVisible();
  await expect(page.getByTestId('button-admin-login-github')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex, nofollow',
  );
  expect(api.adminRequests).toEqual([]);
});

test('old admin URL is no longer an admin entry point', async ({ page }) => {
  await mockApi(page);
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'This recipe is not on the shelf.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Admin Authorization' }),
  ).toHaveCount(0);
});

test('unknown routes provide a working path back to the recipe library', async ({
  page,
}) => {
  await mockApi(page);
  await page.goto('/not-a-real-page');
  await expect(
    page.getByRole('heading', { name: 'This recipe is not on the shelf.' }),
  ).toBeVisible();
  await page.getByTestId('link-404-library').click();
  await expect(page).toHaveURL(/\/recipes$/);
});
