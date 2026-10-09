// Plain keyword search shared by the project database and the overview search.
// Every term must appear (AND); matching is case-insensitive substring matching,
// which also covers Chinese text without word boundaries. Terms keep their
// original case so each side can fold case the same way it folds the text.
export const MAX_SEARCH_TERMS = 8;
export function searchTerms(query: string | undefined): string[] {
  const terms = new Map<string, string>();
  for (const raw of (query ?? "").trim().split(/\s+/u)) {
    const term = raw.slice(0, 200);
    if (term && !terms.has(term.toLowerCase())) terms.set(term.toLowerCase(), term);
    if (terms.size >= MAX_SEARCH_TERMS) break;
  }
  return [...terms.values()];
}
