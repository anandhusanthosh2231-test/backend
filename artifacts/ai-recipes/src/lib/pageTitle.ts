const DEFAULT_PAGE_TITLE = 'TaskBakeAI \u2014 Practical AI workflows for real life';

export function pageTitle(title?: string): string {
  const normalizedTitle = title?.trim();
  return normalizedTitle
    ? `${normalizedTitle} \u2014 TaskBakeAI`
    : DEFAULT_PAGE_TITLE;
}
