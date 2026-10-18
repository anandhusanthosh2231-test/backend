const configuredAdminPath = import.meta.env.VITE_ADMIN_PATH?.trim();

const normalizedAdminPath = configuredAdminPath
  ? `/${configuredAdminPath.replace(/^\/+|\/+$/g, '')}`
  : '/__admin_path_not_configured__';

if (
  normalizedAdminPath === '/' ||
  normalizedAdminPath === '/admin' ||
  normalizedAdminPath.startsWith('/admin/') ||
  /[?#\s]/.test(normalizedAdminPath)
) {
  throw new Error('VITE_ADMIN_PATH must be a dedicated path other than /admin.');
}

export const ADMIN_PATH = normalizedAdminPath;

export function getAdminPath(suffix = ''): string {
  if (!suffix) return ADMIN_PATH;
  return `${ADMIN_PATH}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
}
