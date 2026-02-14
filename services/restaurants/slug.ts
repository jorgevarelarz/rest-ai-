export function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    // Basic latin transliteration for common accents; keep it tiny (MVP).
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return s || "restaurant";
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function ensureUniqueSlug(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  for (let i = 2; i < 10_000; i++) {
    const s = `${base}-${i}`;
    if (!existing.has(s)) return s;
  }
  // Practically unreachable for MVP.
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

