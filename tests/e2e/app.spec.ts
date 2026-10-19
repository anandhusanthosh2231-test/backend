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

test('minimal footer stays responsive and robot animates once with reduced-motion support', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const footer = page.locator('.site-footer');
  const track = page.locator('.footer-robot-track');
  const robot = page.locator('.footer-robot');
  await expect(footer.getByRole('link', { name: 'Explore' })).toHaveAttribute('href', '/recipes');
  await expect(footer.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
  await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
  await expect(footer.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
  await expect(footer.getByText('© 2026 AI Recipes')).toBeVisible();
  await expect(footer.getByText('A practical field guide to doing better work with AI.')).toBeVisible();
  await expect(footer.getByText('Made for curious minds')).toBeVisible();
  await expect(robot).toHaveCSS('height', '24px');
  await expect.poll(() => track.evaluate((element) => {
    const robotElement = element.querySelector('svg');
    return Number.parseFloat(getComputedStyle(element).getPropertyValue('--robot-travel'))
      === element.clientWidth - (robotElement?.getBoundingClientRect().width ?? 0);
  })).toBe(true);
  const desktopFooterHeight = await footer.evaluate((element) => element.getBoundingClientRect().height);
  expect(desktopFooterHeight).toBeGreaterThanOrEqual(100);
  expect(desktopFooterHeight).toBeLessThanOrEqual(150);

  for (const width of [360, 768, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  await track.scrollIntoViewIfNeeded();
  await expect(robot).toHaveClass(/is-started/);
  await expect(robot).toHaveCSS('animation-name', 'footer-robot-walk');
  await page.waitForTimeout(8200);
  const completedWalkTime = await robot.evaluate((element) => {
    const animation = element.getAnimations().find((item) => item.animationName === 'footer-robot-walk');
    return Number(animation?.currentTime ?? 0);
  });
  expect(completedWalkTime).toBeGreaterThanOrEqual(5000);
  await expect.poll(() => track.evaluate((element) => {
    const robotElement = element.querySelector('svg');
    if (!robotElement) return false;
    const target = Number.parseFloat(getComputedStyle(element).getPropertyValue('--robot-travel'));
    return Math.abs(robotElement.getBoundingClientRect().left - element.getBoundingClientRect().left - target) < 1;
  })).toBe(true);

  await page.evaluate(() => window.scrollTo(0, 0));
  await track.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  await expect.poll(() => robot.evaluate((element) => {
    const animation = element.getAnimations().find((item) => item.animationName === 'footer-robot-walk');
    return Number(animation?.currentTime ?? 0);
  })).toBeGreaterThanOrEqual(completedWalkTime);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mobileFooterHeight = await footer.evaluate((element) => element.getBoundingClientRect().height);
  expect(mobileFooterHeight).toBeGreaterThan(desktopFooterHeight);
  await expect.poll(() => track.evaluate((element) => element.clientWidth)).toBeGreaterThan(250);
  await track.scrollIntoViewIfNeeded();
  await expect(robot).toHaveCSS('animation-name', 'none');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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

test('recipe editor links to the visible CSV import action', async ({ page }) => {
  await mockApi(page, { adminAuthenticated: true });
  const adminPath = process.env.VITE_ADMIN_PATH || '/__admin_path_not_configured__';
  await page.goto(`${adminPath}/recipes/new`);
  await expect(
    page.getByRole('heading', { name: 'Choose a recipe layout' }),
  ).toBeVisible();

  await page.getByTestId('link-editor-import-csv').click();
  await expect(page).toHaveURL(/\/recipes#import-csv$/);
  await expect(page.getByTestId('button-admin-recipes-import-csv')).toBeVisible();
});

test('admin can create and edit categories and audiences', async ({ page }) => {
  const api = await mockApi(page, { adminAuthenticated: true });
  const adminPath = process.env.VITE_ADMIN_PATH || '/__admin_path_not_configured__';

  await page.goto(`${adminPath}/categories`);
  await page.getByTestId('button-add-category').click();
  await page.getByTestId('input-taxonomy-name').fill('Design & Media');
  await page.getByTestId('input-taxonomy-description').fill('Visual design and media workflows.');
  await page.getByTestId('button-save-taxonomy').click();
  await expect.poll(() => api.taxonomyRequests.length).toBe(1);
  expect(api.taxonomyRequests[0]).toMatchObject({
    method: 'POST',
    pathname: '/api/admin/categories',
    body: {
      name: 'Design & Media',
      slug: 'design-media',
      description: 'Visual design and media workflows.',
    },
  });

  await page.getByTestId('button-edit-category-1').click();
  await page.getByTestId('input-taxonomy-description').fill('Updated writing workflows.');
  await page.getByTestId('button-save-taxonomy').click();
  await expect.poll(() => api.taxonomyRequests.length).toBe(2);
  expect(api.taxonomyRequests[1]).toMatchObject({
    method: 'PATCH',
    pathname: '/api/admin/categories/1',
  });

  await page.goto(`${adminPath}/audiences`);
  await page.getByTestId('button-add-audience').click();
  await page.getByTestId('input-taxonomy-name').fill('Independent creators');
  await page.getByTestId('input-taxonomy-description').fill('Workflows for independent creators.');
  await page.getByTestId('button-save-taxonomy').click();
  await expect.poll(() => api.taxonomyRequests.length).toBe(3);
  expect(api.taxonomyRequests[2]).toMatchObject({
    method: 'POST',
    pathname: '/api/admin/audiences',
    body: {
      name: 'Independent creators',
      slug: 'independent-creators',
      description: 'Workflows for independent creators.',
    },
  });

  await page.getByTestId('button-edit-audience-1').click();
  await page.getByTestId('input-taxonomy-name').fill('Content creators');
  await page.getByTestId('input-taxonomy-slug').fill('content-creators');
  await page.getByTestId('button-save-taxonomy').click();
  await expect.poll(() => api.taxonomyRequests.length).toBe(4);
  expect(api.taxonomyRequests[3]).toMatchObject({
    method: 'PATCH',
    pathname: '/api/admin/audiences/1',
    body: {
      name: 'Content creators',
      slug: 'content-creators',
    },
  });
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
