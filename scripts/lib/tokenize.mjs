/** Shared tokenizer for search index build + client retrieval. */

export const STOP = new Set([
  "the", "a", "an", "of", "in", "on", "to", "and", "or", "for", "is", "was", "did", "does", "do",
  "when", "what", "how", "why", "who", "first", "about", "with", "it", "he", "lev", "talk", "talked",
  "say", "said", "cover", "covered", "up", "come", "came", "that", "this", "are", "were", "be", "been",
  "has", "have", "had", "will", "would", "can", "could", "should", "may", "might", "into", "from",
]);

/** @param {string} text */
export function tokenize(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9+.#-]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** @param {string} text */
export function uniqueTokens(text) {
  return [...new Set(tokenize(text))];
}
