// Step 1 keyword matching against prisma/seed-data/classifier.json (BUILD_PLAN.md Phase 2:
// "live suggested department + category (keyword match) with alternatives"). Pure and
// case-insensitive so it's easy to call on every keystroke.

export interface Classifier {
  departmentKeywords: Record<string, string[]>;
  categoryKeywords: Record<string, string>;
}

export interface ClassifyResult {
  /** Department slugs that matched at least one keyword, best match first. */
  departmentSlugs: string[];
  /** Service type names (categories) whose keyword appeared in the text. */
  categories: string[];
}

export function classify(text: string, classifier: Classifier): ClassifyResult {
  const lower = text.toLowerCase();

  const scores = new Map<string, number>();
  for (const [slug, keywords] of Object.entries(classifier.departmentKeywords)) {
    const score = keywords.filter((keyword) => lower.includes(keyword)).length;
    if (score > 0) scores.set(slug, score);
  }
  const departmentSlugs = [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([slug]) => slug);

  const categories = new Set<string>();
  for (const [keyword, category] of Object.entries(classifier.categoryKeywords)) {
    if (lower.includes(keyword)) categories.add(category);
  }

  return { departmentSlugs, categories: [...categories] };
}
