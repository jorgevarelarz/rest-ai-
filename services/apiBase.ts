const rawBackendUrl = ((import.meta as any)?.env?.VITE_BACKEND_URL as string | undefined)?.trim() || "";

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, "");
const buildPath = (path: string): string => (path.startsWith("/") ? path : `/${path}`);

export const buildApiUrl = (path: string): string => {
  const normalizedPath = buildPath(path);
  if (!rawBackendUrl) return normalizedPath;
  return `${normalizeBaseUrl(rawBackendUrl)}${normalizedPath}`;
};
