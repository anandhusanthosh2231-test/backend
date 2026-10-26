import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures';

test('mobile bottom navigation opens Why TaskBakeAI instead of a cart', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');

  const whyLink = page.getByTestId('mobile-nav-why-ai-recipes');
  await expect(whyLink).toBeVisible();
  await expect(whyLink).toContainText('Why TaskBakeAI');
  await expect(whyLink).not.toContainText('Cart');
  await expect(whyLink).toHaveAttribute('href', '/why-ai-recipes');
  const navLayout = await whyLink.evaluate((link) => {
    const icon = link.querySelector('.flipkart-bottom-nav__icon-wrapper')!.getBoundingClientRect();
    const label = link.querySelector('.flipkart-bottom-nav__label')!.getBoundingClientRect();
    const item = link.getBoundingClientRect();
    return {
      labelWithinItem: label.left >= item.left && label.right <= item.right,
      labelBelowIcon: label.top >= icon.bottom,
      labelVisible: label.height > 0 && label.bottom <= item.bottom,
    };
  });
  expect(navLayout).toEqual({ labelWithinItem: true, labelBelowIcon: true, labelVisible: true });

  await whyLink.click();
  await expect(page).toHaveURL(/\/why-ai-recipes$/);
  await expect(page.getByRole('heading', { name: /Good work needs more than a prompt/ })).toBeVisible();

  await page.goto('/');
  const slideNavigation = page.getByRole('group', { name: 'Choose a featured highlight' });
  await expect(slideNavigation.getByRole('button')).toHaveCount(4);
  await expect(slideNavigation.locator('[aria-current="true"]')).toHaveCount(1);
});

test('TaskBakeAI shows the supplied mark on mobile and wordmark on desktop', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');

  const mobileBrand = page.getByTestId('mobile-link-logo');
  const mobileMark = mobileBrand.locator('img');
  await expect(mobileBrand).toBeVisible();
  await expect(mobileMark).toHaveAttribute('src', '/taskbakeai-mark.png');
  await expect.poll(() => mobileMark.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => mobileMark.evaluate((image) => (image as HTMLImageElement).currentSrc)).toMatch(/taskbakeai-mark-96\.webp$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.setViewportSize({ width: 1280, height: 900 });
  const desktopBrand = page.getByRole('banner').getByTestId('link-logo');
  const desktopWordmark = desktopBrand.locator('img');
  await expect(desktopBrand).toBeVisible();
  await expect(desktopWordmark).toHaveAttribute('src', '/taskbakeai-wordmark.png');
  await expect.poll(() => desktopWordmark.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => desktopWordmark.evaluate((image) => (image as HTMLImageElement).currentSrc)).toMatch(/taskbakeai-wordmark\.webp$/);
});

test('homepage renders its primary heading before home API data arrives', async ({ page }) => {
  await mockApi(page, { homeResponseDelayMs: 1500 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Practical AI workflows you can actually use.' })).toBeVisible();
  await expect(page.getByTestId('status-loading')).toHaveCount(0);
  await expect(page.getByTestId('status-loading-grid')).toBeVisible();
});

test('mobile homepage reserves space for category and featured recipe loading', async ({ page }) => {
  await mockApi(page, { homeResponseDelayMs: 1500 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.locator('.flipkart-category-scroll-container--loading')).toBeVisible();
  await expect(page.locator('.flipkart-banner-section--loading')).toBeVisible();
  await expect(page.locator('.flipkart-category-scroll-container--loading .flipkart-category-skeleton')).toHaveCount(6);
});

test('mobile layout preserves zoom and carousel touch target sizes', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    'width=device-width, initial-scale=1.0, viewport-fit=cover',
  );

  const carouselDots = page.getByRole('group', { name: 'Choose a featured highlight' }).getByRole('button');
  await expect(carouselDots).toHaveCount(4);
  const touchTargets = await carouselDots.evaluateAll((buttons) => buttons.map((button) => {
    const bounds = button.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  }));
  expect(touchTargets.every(({ width, height }) => width >= 48 && height >= 48)).toBe(true);

  await page.getByTestId('mobile-input-search').fill('planning');
  const headerTargets = [
    page.getByTestId('mobile-link-submit'),
    page.getByTestId('mobile-link-signin'),
    page.getByTestId('mobile-input-search'),
    page.getByTestId('mobile-button-clear-search'),
  ];
  for (const target of headerTargets) {
    const bounds = await target.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(48);
    expect(bounds?.height).toBeGreaterThanOrEqual(48);
  }
});

test('mobile auth uses the light wordmark and keeps the bottom menu available', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/sign-in');

  const authBrand = page.locator('.auth-brand');
  const authWordmark = authBrand.locator('img');
  await expect(authBrand).toBeVisible();
  await expect(authWordmark).toHaveAttribute('src', '/taskbakeai-wordmark-light.png');
  await expect.poll(() => authWordmark.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByTestId('mobile-nav-account')).toBeVisible();
  await expect(page.getByTestId('mobile-link-submit')).not.toContainText('Create');
  await expect(page.locator('.auth-page')).toBeVisible();
  await expect(page.locator('.auth-workflow-canvas')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('desktop auth presents the workflow canvas without clipping', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.goto('/sign-in');

  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 700 });

    const canvas = page.locator('.auth-workflow-canvas');
    await expect(canvas).toBeVisible();
    await expect(canvas.locator('.auth-workflow-card')).toHaveCount(3);
    await expect(page.locator('.auth-aside .auth-brand')).toBeHidden();
    const googleButtonText = page.locator('.auth-card [class*="cl-socialButtonsBlockButtonText"]');
    if (await googleButtonText.count()) {
      await expect.poll(() => googleButtonText.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(39, 34, 53)');
      await expect(googleButtonText).toBeVisible();
    }
    const layoutFits = await page.evaluate(() => {
      const aside = document.querySelector('.auth-aside')!.getBoundingClientRect();
      const card = document.querySelector('.auth-card')!.getBoundingClientRect();
      const canvasBounds = document.querySelector('.auth-workflow-canvas')!.getBoundingClientRect();
      return document.documentElement.scrollWidth <= window.innerWidth
        && aside.left >= 0
        && card.right <= window.innerWidth
        && canvasBounds.left >= aside.left
        && canvasBounds.right <= aside.right
        && document.documentElement.scrollHeight >= card.bottom;
    });
    expect(layoutFits).toBe(true);
  }

  await page.setViewportSize({ width: 1024, height: 700 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/sign-up');
  await expect(page.locator('.auth-workflow-canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await expect.poll(() => page.locator('.auth-workflow-card').first().evaluate((element) =>
    getComputedStyle(element).animationName,
  )).toBe('none');

  for (const width of [768, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.auth-workflow-canvas')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('new category names get distinct, relevant mobile icons', async ({ page }) => {
  await mockApi(page, {
    categories: [
      { id: 1, name: 'Writing', slug: 'writing', recipeCount: 3 },
      { id: 2, name: 'Business', slug: 'business', recipeCount: 5 },
      { id: 3, name: 'Travel Planning', slug: 'travel-planning', recipeCount: 2 },
    ],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const writingIcon = page.getByTestId('mobile-chip-writing').locator('.flipkart-category-icon-bubble svg');
  const businessIcon = page.getByTestId('mobile-chip-business').locator('.flipkart-category-icon-bubble svg');
  const travelIcon = page.getByTestId('mobile-chip-travel-planning').locator('.flipkart-category-icon-bubble svg');
  await expect(writingIcon).toHaveClass(/lucide-pen-tool/);
  await expect(businessIcon).toHaveClass(/lucide-briefcase/);
  await expect(travelIcon).toHaveClass(/lucide-plane/);
  expect(await writingIcon.getAttribute('class')).not.toBe(await businessIcon.getAttribute('class'));
});

test('mobile navigation resets scroll to the top and recipe breadcrumbs stay aligned', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');

  await page.locator('.site-footer').scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByTestId('link-footer-explore').click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await page.goto('/recipes/brief-to-project-plan');
  const breadcrumbs = page.locator('.recipe-hero .breadcrumbs');
  for (const width of [320, 375, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(breadcrumbs.getByTestId('link-breadcrumb-library')).toBeVisible();
    await expect(breadcrumbs.getByTestId('link-breadcrumb-category')).toBeVisible();
    await expect(breadcrumbs.locator('[aria-current="page"]')).toContainText('Turn a brief into a project plan');
    const breadcrumbLayout = await breadcrumbs.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const children = Array.from(element.children);
      const childBounds = children.map((child) => child.getBoundingClientRect());
      const title = element.querySelector('[aria-current="page"]') as HTMLElement;
      const titleBounds = title.getBoundingClientRect();
      const mobileLayout = window.innerWidth <= 680;
      const firstRowCenter = (childBounds[0].top + childBounds[0].bottom) / 2;
      const labelChevronCentersAligned = mobileLayout && [0, 2].every((index) => {
        const range = document.createRange();
        range.selectNodeContents(children[index]);
        const label = range.getBoundingClientRect();
        const chevron = childBounds[index + 1];
        return Math.abs((label.top + label.bottom) / 2 - (chevron.top + chevron.bottom) / 2) < 4;
      });
      return {
        rowLayout: children.length === 5 && (mobileLayout
          ? childBounds.slice(0, 4).every((child) => Math.abs((child.top + child.bottom) / 2 - firstRowCenter) < 1)
            && titleBounds.top >= childBounds[3].bottom
          : childBounds.every((child) => Math.abs((child.top + child.bottom) / 2 - firstRowCenter) < 1)),
        ordered: children[0].textContent?.trim() === 'Library'
          && children[1].tagName.toLowerCase() === 'svg'
          && children[2].textContent?.trim() === 'Writing'
          && children[3].tagName.toLowerCase() === 'svg'
          && children[4].getAttribute('aria-current') === 'page',
        firstRowCentered: childBounds.slice(0, 4).every((child) =>
          Math.abs((child.top + child.bottom) / 2 - firstRowCenter) < 1,
        ),
        titleContained: titleBounds.left >= bounds.left && titleBounds.right <= bounds.right,
        titleTruncates: getComputedStyle(title).textOverflow === 'ellipsis'
          && getComputedStyle(title).whiteSpace === 'nowrap',
        consistentGaps: getComputedStyle(element).columnGap === '8px'
          && (!mobileLayout || getComputedStyle(element).rowGap === '8px'),
        mobileLabelsAlignedWithChevrons: !mobileLayout || labelChevronCentersAligned,
        mobileLinksUseContentHeight: !mobileLayout
          || childBounds.filter((_, index) => index === 0 || index === 2).every((child) => child.height < 24),
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      };
    });
    expect(breadcrumbLayout).toEqual({
      rowLayout: true,
      ordered: true,
      firstRowCentered: true,
      titleContained: true,
      titleTruncates: true,
      consistentGaps: true,
      mobileLabelsAlignedWithChevrons: true,
      mobileLinksUseContentHeight: true,
      noHorizontalOverflow: true,
    });
  }
});

test('why AI Recipes page uses the site shell and switches its examples', async ({ page }) => {
  await mockApi(page);
  await page.goto('/why-ai-recipes');
  await expect(page.getByRole('heading', { name: /Good work needs more than a prompt/ })).toBeVisible();
  await expect(page.getByTestId('link-nav-why-recipes')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A quick ask. A considered workflow.' })).toBeVisible();
  await expect(page.getByTestId('why-example-content')).toContainText('The quick ask');
  await expect(page.getByTestId('why-example-content')).toContainText('The recipe prompt');
  await expect(page.getByTestId('why-example-content')).toContainText('An illustrative result');
  await expect(page.getByTestId('why-quick-output')).toContainText('Software Engineer');
  await expect(page.getByTestId('why-recipe-output')).toContainText('Role-aligned summary');
  await expect(page.getByTestId('button-why-example-0')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('button-why-example-1').click();
  await expect(page.getByTestId('why-example-content')).toContainText('Write a WhatsApp pitch for my product.');
  await expect(page.getByTestId('why-recipe-prompt')).toContainText('{{verified_benefit}}');
  await expect(page.getByTestId('why-quick-output')).toContainText('Introducing our product');
  await expect(page.getByTestId('why-recipe-output')).toContainText('A message grounded in your details');
  await expect(page.getByTestId('why-takeaways')).toContainText('The message starts from the recipient’s situation.');
  await page.getByTestId('button-why-copy-prompt').click();
  await expect(page.getByTestId('button-why-copy-prompt')).toContainText('Copied');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('# ROLE');
  await expect(page.getByTestId('link-why-explore')).toHaveAttribute('href', '/recipes');
  await expect(page.getByTestId('link-footer-why recipes')).toHaveAttribute('href', '/why-ai-recipes');

  for (const width of [1920, 1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByTestId('why-example-content')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.getByTestId('button-why-example-2').click();
  await expect(page.getByTestId('button-why-example-2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('why-example-content')).toContainText('Help me study for my exam.');
  await expect(page.getByTestId('why-quick-output')).toContainText('Study plan');
  await expect(page.getByTestId('why-recipe-output')).toContainText('A flexible plan for your available time');
});

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

  await expect(page.locator('[data-testid^="prompt-showcase-"]')).toHaveCount(0);
  await page.getByTestId('button-quick-copy').click();
  await expect(page.getByTestId('button-quick-copy')).toContainText('Copied');
  await page.getByTestId('button-feedback-yes').click();
  await expect(page.getByRole('status').getByText('Thanks — your note helps us improve this recipe.')).toBeVisible();
  await expect
    .poll(() => api.feedbackRequests.length)
    .toBe(1);
  expect(api.feedbackRequests[0]).toMatchObject({
    recipeId: 1,
    helpful: true,
  });
  await expect(page.getByTestId('button-feedback-yes')).toBeDisabled();
});

test('visual prompts show a visual gallery and subtype metadata without replacing recipe actions', async ({ page }) => {
  await mockApi(page, { visualPromptType: 'image' });
  await page.goto('/recipes/brief-to-project-plan');

  const showcase = page.getByTestId('prompt-showcase-image');
  await expect(showcase).toBeVisible();
  await expect(showcase.getByRole('heading', { name: 'Turn a brief into a project plan' })).toBeVisible();
  await expect(showcase.getByRole('img', { name: 'A colorful concept illustration' })).toBeVisible();
  await expect(showcase).toContainText('Editorial');
  await expect(showcase).toContainText('Imagen');
  await expect(showcase.getByTestId('button-showcase-copy')).toBeVisible();
  await expect(page.getByTestId('button-share-recipe')).toBeVisible();
});

test('dynamic recipe inputs validate, resolve safely, and preserve unknown prompt variables', async ({ page }) => {
  await mockApi(page, { dynamicRecipe: true });
  await page.goto('/recipes/brief-to-project-plan');

  const copyButton = page.getByTestId('button-copy-prompt');
  await expect(copyButton).toBeDisabled();
  await expect(page.getByText('Target audience is required.')).toBeVisible();
  await page.getByLabel('Target audience').fill('A $& audience');

  const promptPreview = page.locator('.prompt-box pre');
  await expect(promptPreview).toContainText('Write for A $& audience in a Warm tone.');
  await expect(promptPreview).toContainText('{{unconfigured_token}}');
  await page.getByLabel('Tone').selectOption('Concise');
  await expect(promptPreview).toContainText('in a Concise tone.');
  await expect(copyButton).toBeEnabled();
  await copyButton.click();
  await expect(copyButton).toContainText('Copied');
});

test('custom-layout recipe renders an actionable workflow, personalized prompt, and optional sections', async ({ page }) => {
  await mockApi(page, { customLayoutRecipe: true });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/recipes/brief-to-project-plan');
  await expect(page.getByRole('heading', { name: 'Turn a brief into a project plan' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Numbered workflow' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Expected outcome' })).toBeVisible();
  await expect(page.getByText('Example input', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Screenshots / images', { exact: true })).toHaveCount(0);
  await expect(page.locator('.layout-diagram')).toBeVisible();
  await page.getByLabel('Target role').fill('Senior product designer');
  await expect(page.locator('.layout-prompt pre')).toContainText('Build a job-search plan for Senior product designer.');
  const copyButton = page.getByRole('button', { name: 'Copy prompt' });
  await copyButton.click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Build a job-search plan for Senior product designer.');
  await page.setViewportSize({ width: 375, height: 812 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('negative feedback reasons are all sent and saved with the recipe feedback', async ({ page }) => {
  test.setTimeout(90_000);
  const api = await mockApi(page);
  const reasons = [
    ['too-generic', 'Too generic'],
    ['prompt-didn-t-work', "Prompt didn't work"],
    ['missing-example', 'Missing example'],
    ['missing-information', 'Missing information'],
    ['too-complicated', 'Too complicated'],
    ['other', 'Other'],
  ];

  for (const [index, [testId, reason]] of reasons.entries()) {
    await page.goto('/recipes/brief-to-project-plan');
    await page.getByTestId('button-feedback-no').click();
    await page.getByTestId(`button-feedback-reason-${testId}`).click();
    await expect.poll(() => api.feedbackRequests.length).toBe(index + 1);
  }

  expect(api.feedbackRequests).toHaveLength(reasons.length);
  for (const [index, [, reason]] of reasons.entries()) {
    expect(api.feedbackRequests[index]).toMatchObject({
      recipeId: 1,
      helpful: false,
      note: reason,
    });
  }
});

test('feedback failures are shown and the user can retry', async ({ page }) => {
  const api = await mockApi(page, { feedbackStatus: 503 });
  await page.goto('/recipes/brief-to-project-plan');
  await page.getByTestId('button-feedback-no').click();
  await page.getByTestId('button-feedback-reason-too-generic').click();

  await expect(page.getByRole('alert').getByText(/feedback service unavailable/i)).toBeVisible();
  const retryReason = page.getByTestId('button-feedback-reason-too-generic');
  await expect(retryReason).toBeEnabled();
  await retryReason.click();
  await expect.poll(() => api.feedbackRequests.length).toBe(2);
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

test('sign-up card stays within narrow mobile viewports', async ({ page }) => {
  await mockApi(page);
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/sign-up');
    const authPage = page.locator('.auth-page');
    const authCard = page.locator('.auth-card');
    await expect(authPage).toBeVisible();
    await expect.poll(() => authCard.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.left >= 0
        && bounds.right <= window.innerWidth
        && document.documentElement.scrollWidth <= window.innerWidth;
    })).toBe(true);
    const clerkCard = page.locator('.auth-card [class*="cl-cardBox"]');
    if (await clerkCard.count()) {
      await expect.poll(() => clerkCard.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= window.innerWidth;
      })).toBe(true);
    }
  }
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
  await expect(footer.getByText('© 2026 TaskBakeAI')).toBeVisible();
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
  const animationTiming = await robot.evaluate((element) => {
    const animation = element.getAnimations().find((item) => item.animationName === 'footer-robot-walk');
    return {
      currentTime: Number(animation?.currentTime ?? 0),
      duration: animation?.effect?.getComputedTiming().duration,
      startTime: Number(animation?.startTime ?? 0),
    };
  });
  expect(animationTiming.duration).toBe(5000);

  await page.evaluate(() => window.scrollTo(0, 0));
  await track.scrollIntoViewIfNeeded();
  await expect.poll(() => robot.evaluate((element) => {
    const animation = element.getAnimations().find((item) => item.animationName === 'footer-robot-walk');
    return Number(animation?.startTime ?? 0);
  })).toBe(animationTiming.startTime);
  await expect.poll(() => robot.evaluate((element) => {
    const animation = element.getAnimations().find((item) => item.animationName === 'footer-robot-walk');
    return Number(animation?.currentTime ?? 0);
  })).toBeGreaterThanOrEqual(animationTiming.currentTime);

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

test('admin Prompt Studio selects subtypes and previews external image references', async ({ page }) => {
  const api = await mockApi(page, { adminAuthenticated: true });
  const adminPath = process.env.VITE_ADMIN_PATH || '/__admin_path_not_configured__';
  await page.goto(`${adminPath}/recipes/new`);

  const promptType = page.getByTestId('select-prompt-type');
  await promptType.selectOption('image');
  await expect(page.getByText('Image model')).toBeVisible();
  await page.getByTestId('button-prompt-add-image').click();
  await page.getByTestId('input-prompt-image-url-0').fill('https://images.example.test/reference.webp');
  await expect(page.getByTestId('prompt-image-preview-0')).toBeVisible();
  await page.getByLabel('Alt text').fill('A visual reference');

  await promptType.selectOption('game');
  await expect(page.getByText('Game engine')).toBeVisible();
  await page.getByLabel('Genre').fill('Puzzle adventure');
  await page.getByLabel('Platform').fill('PC');
  await page.getByLabel('Game engine').fill('Godot');
  await promptType.selectOption('website');
  await expect(page.getByText('Framework', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Live preview URL')).toBeVisible();
  await page.getByLabel('Framework').fill('React');
  await page.getByLabel('Visual style').fill('Editorial');
  await page.getByLabel('Live preview URL').fill('https://preview.example.test');
  await promptType.selectOption('image');

  await page.getByTestId('input-editor-title').fill('Visual prompt recipe');
  await page.getByTestId('input-editor-slug').fill('visual-prompt-recipe');
  await page.getByTestId('input-editor-description').fill('Create polished visual concepts with a reusable prompt.');
  await page.getByTestId('input-editor-problem').fill('Visual concepts often lack a clear, reusable direction.');
  await page.getByTestId('input-editor-prompt').fill('Create a concept for {{subject}} with the chosen visual style.');
  await page.getByTestId('button-save-editor').click();

  await expect.poll(() => api.recipeSaveRequests.length).toBe(1);
  expect(api.recipeSaveRequests[0].guide).toMatchObject({
    promptType: 'image',
    imagesJson: [{ url: 'https://images.example.test/reference.webp', alt: 'A visual reference' }],
    promptStudio: {
      gameGenre: 'Puzzle adventure',
      gamePlatform: 'PC',
      gameEngine: 'Godot',
      websiteFramework: 'React',
      websiteStyle: 'Editorial',
      previewUrl: 'https://preview.example.test',
    },
  });
});

test('admin previews CSV rows before committing the import', async ({ page }) => {
  const api = await mockApi(page, { adminAuthenticated: true });
  const adminPath = process.env.VITE_ADMIN_PATH || '/__admin_path_not_configured__';
  await page.goto(`${adminPath}/recipes`);
  await page.getByTestId('input-admin-recipes-csv').setInputFiles({
    name: 'recipes.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Recipe Title,URL Slug\nA recipe,a-recipe'),
  });

  await expect(page.getByText('1 recipes ready to import')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import 1 recipes' })).toBeVisible();
  expect(api.csvImportRequests).toHaveLength(1);
  expect(api.csvImportRequests[0]).toMatchObject({ preview: true });

  await page.getByRole('button', { name: 'Import 1 recipes' }).click();
  await expect(page.getByText('1 recipes created or updated')).toBeVisible();
  expect(api.csvImportRequests).toHaveLength(2);
  expect(api.csvImportRequests[1]).toMatchObject({ preview: false });
});

test('admin bulk edits selected recipes by category and publication status', async ({ page }) => {
  const api = await mockApi(page, {
    adminAuthenticated: true,
    adminBulkEdit: true,
    categories: [
      { id: 1, name: 'Writing', slug: 'writing', recipeCount: 1 },
      { id: 2, name: 'Career', slug: 'career', recipeCount: 0 },
    ],
  });
  const adminPath = process.env.VITE_ADMIN_PATH || '/__admin_path_not_configured__';
  await page.goto(`${adminPath}/recipes`);
  await expect(page.getByTestId('button-bulk-publish')).toBeDisabled();

  await page.getByTestId('checkbox-select-all-recipes').check();
  await expect(page.getByText('2 selected')).toBeVisible();
  await page.getByTestId('select-bulk-recipe-category').selectOption('2');
  await page.getByTestId('button-bulk-change-category').click();
  await expect(page.getByRole('status')).toContainText('2 recipes updated');
  expect(api.bulkUpdateRequests[0]).toEqual({ ids: [1, 2], categoryId: 2 });

  await page.getByTestId('checkbox-select-all-recipes').check();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('button-bulk-publish').click();
  await expect(page.getByRole('status')).toContainText('2 recipes updated');
  expect(api.bulkUpdateRequests[1]).toEqual({ ids: [1, 2], status: 'PUBLISHED' });
});

test('admin filters recipes by category', async ({ page }) => {
  const api = await mockApi(page, {
    adminAuthenticated: true,
    adminBulkEdit: true,
    categories: [
      { id: 1, name: 'Writing', slug: 'writing', recipeCount: 1 },
      { id: 2, name: 'Career', slug: 'career', recipeCount: 1 },
    ],
  });
  const adminPath = process.env.VITE_ADMIN_PATH || '/__admin_path_not_configured__';
  await page.goto(`${adminPath}/recipes`);

  await expect(page.getByTestId('link-admin-recipe-1')).toBeVisible();
  await expect(page.getByTestId('link-admin-recipe-2')).toBeVisible();
  await page.getByTestId('select-admin-recipe-category').selectOption('career');

  await expect(page.getByTestId('link-admin-recipe-1')).toHaveCount(0);
  await expect(page.getByTestId('link-admin-recipe-2')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recipe Shelf (1)' })).toBeVisible();
  expect(api.adminRecipeListRequests.some((request) => request.searchParams.get('category') === 'career')).toBe(true);
});

test('admin recipe list paginates results from the API', async ({ page }) => {
  const api = await mockApi(page, {
    adminAuthenticated: true,
    adminBulkEdit: true,
    adminRecipeCount: 53,
  });
  const adminPath = process.env.VITE_ADMIN_PATH || '/__admin_path_not_configured__';
  await page.goto(`${adminPath}/recipes`);

  await expect(page.getByRole('heading', { name: 'Recipe Shelf (53)' })).toBeVisible();
  expect(api.adminRecipeListResponses).toContainEqual({ page: 1, total: 53 });
  await expect(page.getByTestId('link-admin-recipe-1')).toBeVisible();
  await page.getByTestId('button-admin-recipes-page-next').click();

  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await expect(page.getByTestId('link-admin-recipe-1')).toHaveCount(0);
  await expect(page.getByTestId('link-admin-recipe-53')).toBeVisible();
  expect(api.adminRecipeListRequests.some((request) => request.searchParams.get('page') === '2')).toBe(true);
});

test('admin can configure and save ordered dynamic prompt inputs', async ({ page }) => {
  const api = await mockApi(page, { adminAuthenticated: true });
  const adminPath = process.env.VITE_ADMIN_PATH || '/__admin_path_not_configured__';
  await page.goto(`${adminPath}/recipes/new`);
  await page.getByTestId('input-editor-title').fill('Audience-specific outreach');
  await page.getByTestId('input-editor-description').fill('Create tailored outreach for a selected audience.');
  await page.getByTestId('input-editor-problem').fill('Outreach messages often miss their target audience.');
  await page.getByTestId('input-editor-prompt').fill('Write an outreach message for {{target_audience}} in a {{tone}} tone.');

  await page.getByText('Inputs, situations, tools, and prompt variables').click();
  await page.getByRole('button', { name: 'Add input' }).click();
  await page.getByLabel('Input 1 variable name').fill('target_audience');
  await page.getByLabel('Input 1 display label').fill('Target audience');
  await page.getByLabel('Input 1 type').selectOption('textarea');
  await page.getByRole('button', { name: 'Add input' }).click();
  await page.getByLabel('Input 2 variable name').fill('tone');
  await page.getByLabel('Input 2 display label').fill('Tone');
  await page.getByLabel('Input 2 type').selectOption('dropdown');
  await page.getByLabel('Input 2 dropdown options').fill('Warm\nConcise');
  await page.getByLabel('Input 2 variable name').press('Tab');
  await page.getByRole('button', { name: 'Move input 2 up' }).click();

  await page.getByTestId('button-save-editor').click();
  await expect.poll(() => api.recipeSaveRequests.length).toBe(1);
  const savedRecipe = api.recipeSaveRequests[0];
  const guide = savedRecipe.guide as { promptVariables: Array<Record<string, unknown>> };
  expect(guide.promptVariables.map(({ name, type, options }) => ({ name, type, options }))).toEqual([
    { name: 'tone', type: 'dropdown', options: ['Warm', 'Concise'] },
    { name: 'target_audience', type: 'textarea', options: undefined },
  ]);
});

test('admin custom-layout editor saves structured workflow content and can publish', async ({ page }) => {
  test.setTimeout(60_000);
  const api = await mockApi(page, { adminAuthenticated: true });
  const adminPath = process.env.VITE_ADMIN_PATH || '/__admin_path_not_configured__';
  await page.goto(`${adminPath}/recipes/new`);
  await page.getByRole('button', { name: 'Custom Layout' }).click();
  const layoutBlocks = page.locator('.layout-block-editor');
  await expect(layoutBlocks).toHaveCount(13);
  await layoutBlocks.first().getByRole('button', { name: 'Hide block' }).click();
  await expect(layoutBlocks.first().getByRole('button', { name: 'Show block' })).toBeVisible();
  await layoutBlocks.first().getByRole('button', { name: 'Duplicate block' }).click();
  await expect(layoutBlocks).toHaveCount(14);
  page.on('dialog', (dialog) => dialog.accept());
  await layoutBlocks.nth(1).getByRole('button', { name: 'Remove block' }).click();
  await expect(layoutBlocks).toHaveCount(13);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(layoutBlocks).toHaveCount(13);
  await page.getByTestId('input-editor-title').fill('Focused job search system');
  await page.getByTestId('input-editor-slug').fill('focused-job-search-system');
  await page.getByTestId('input-editor-description').fill('Build a practical, prioritized weekly job-search workflow.');
  await page.getByRole('textbox', { name: 'Expected Outcome' }).fill('A prioritized list of roles and next actions.');
  await page.getByLabel('Steps to Execute (one actionable step per line)').fill('Collect target roles and constraints.\nBuild a shortlist.\nVerify each role is open.');
  await page.getByLabel('The Copyable Prompt').fill('Create a job-search plan for {{target_role}}.');
  await page.getByRole('button', { name: 'Add input' }).click();
  await page.getByLabel('Input 1 variable name').fill('target_role');
  await page.getByLabel('Input 1 display label').fill('Target role');
  await page.getByLabel('Input 1 required').check();
  await page.getByRole('button', { name: 'Add Verification Checklist' }).click();
  await page.getByRole('textbox', { name: 'Verification Checklist 1' }).fill('Confirm every role is currently open.');
  await page.getByLabel('Workflow Diagram (optional Mermaid)').fill('flowchart TD\n  A[Collect] --> B[Verify]');
  await page.getByLabel('Publishing Status').selectOption('PUBLISHED');
  await page.getByTestId('button-save-editor').click();

  await expect.poll(() => api.recipeSaveRequests.length).toBe(1);
  const saved = api.recipeSaveRequests[0];
  expect(saved).toMatchObject({ layoutMode: 'custom', status: 'PUBLISHED', slug: 'focused-job-search-system' });
  expect(saved.steps).toEqual(['Collect target roles and constraints.', 'Build a shortlist.', 'Verify each role is open.']);
  expect(saved.layoutConfig).toMatchObject({ version: 1, blocks: expect.arrayContaining([expect.objectContaining({ type: 'workflow' }), expect.objectContaining({ type: 'prompt' })]) });
  expect(saved.guide).toMatchObject({
    promptVariables: [expect.objectContaining({ name: 'target_role', label: 'Target role', required: true })],
    expectedOutput: { description: 'A prioritized list of roles and next actions.' },
    customContent: {
      verificationChecklist: ['Confirm every role is currently open.'],
      workflowDiagram: 'flowchart TD\n  A[Collect] --> B[Verify]',
    },
  });

  await page.goto(`${adminPath}/recipes/99`);
  await expect(page.getByTestId('input-editor-title')).toHaveValue('Focused job search system');
  await expect(page.getByRole('button', { name: 'Custom Layout' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('input-editor-description').fill('A saved and editable job-search workflow with clear next actions.');
  await page.getByTestId('button-save-editor').click();
  await expect.poll(() => api.recipeUpdateRequests.length).toBe(1);
  expect(api.recipeUpdateRequests[0].id).toBe(99);
  expect(api.recipeUpdateRequests[0].body).toMatchObject({
    layoutMode: 'custom',
    status: 'PUBLISHED',
    guide: {
      customContent: {
        verificationChecklist: ['Confirm every role is currently open.'],
        workflowDiagram: 'flowchart TD\n  A[Collect] --> B[Verify]',
      },
    },
  });
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

test('admin can delete unused categories but cannot delete categories assigned to recipes', async ({ page }) => {
  const api = await mockApi(page, {
    adminAuthenticated: true,
    categories: [
      { id: 1, name: 'Writing', slug: 'writing', recipeCount: 2 },
      { id: 2, name: 'Empty category', slug: 'empty-category', recipeCount: 0 },
    ],
  });
  const adminPath = process.env.VITE_ADMIN_PATH || '/__admin_path_not_configured__';
  await page.goto(`${adminPath}/categories`);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('button-delete-category-2').click();
  await expect.poll(() => api.taxonomyRequests.length).toBe(1);
  expect(api.taxonomyRequests[0]).toMatchObject({
    method: 'DELETE',
    pathname: '/api/admin/categories/2',
  });
  await expect(page.getByTestId('button-delete-category-2')).toHaveCount(0);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('button-delete-category-1').click();
  await expect(page.getByRole('alert')).toContainText('2 recipes are assigned');
  expect(api.taxonomyRequests[1]).toMatchObject({
    method: 'DELETE',
    pathname: '/api/admin/categories/1',
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
