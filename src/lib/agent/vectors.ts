/** Cosine similarity between two sparse vectors (missing keys = 0). */
export function cosine(a: Record<string, number>, b: Record<string, number>): number {
  let dot = 0, na = 0, nb = 0;
  for (const [k, v] of Object.entries(a)) {
    na += v * v;
    dot += v * (b[k] ?? 0);
  }
  for (const v of Object.values(b)) nb += v * v;
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}
