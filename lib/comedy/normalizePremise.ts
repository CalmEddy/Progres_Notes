/**
 * Normalize a "draft joke" into a premise-like input for the rewrite pass.
 *
 * Goal: remove thesis/analogy/listicle framing that contaminates rewrites
 * (e.g., "Dogs are like...", "Ever notice how...", "X is like Y..."),
 * while preserving the underlying situation.
 *
 * This is intentionally heuristic and safe: it prefers deletion of
 * boilerplate openers over aggressive rewriting.
 */
export function normalizePremise(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) return s;

  // Remove leading bullets/numbers if present
  s = s.replace(/^\s*\d+\.\s+/, "");

  // Strip common thesis/listicle openers
  s = s
    .replace(/^ever notice how\s+/i, "")
    .replace(/^you know how\s+/i, "")
    .replace(/^the thing about\s+/i, "")
    .replace(/^here'?s the thing about\s+/i, "")
    .replace(/^people say\s+/i, "")
    .replace(/^they say\s+/i, "")
    .replace(/^honestly,\s*/i, "")
    .replace(/^basically,\s*/i, "");

  // If it starts with a broad category comparison, drop that framing.
  // Examples:
  // "Dogs are like X; cats are Y" -> keep the more sceneable clause after separators
  // "X is like Y" -> drop the "X is like" thesis if it blocks scene language.
  const startsWithAnalogyThesis =
    /^(?:dogs?|cats?|people|family|dating|work|life)\s+(?:are|is)\s+like\b/i.test(s) ||
    /^[^.!?]{0,60}\s+is\s+like\b/i.test(s);

  if (startsWithAnalogyThesis) {
    // Prefer content after strong separators (often where the "real moment" starts).
    // Try semicolon, em dash, dash, "while/meanwhile", then comma as last resort.
    const separators = [
      /;\s+/,
      /\s+—\s+/,
      /\s+-\s+/,
      /\s+(?:while|meanwhile)\s+/i,
    ];
    for (const sep of separators) {
      const parts = s.split(sep);
      if (parts.length >= 2) {
        // Keep the latter half; it usually contains the concrete behavior.
        s = parts.slice(1).join(" ").trim();
        break;
      }
    }
  }

  // Remove leading "It's like / It's like" framing (keeps the described moment).
  s = s.replace(/^it[']?s like\s+/i, "");

  // If still starts with "Dogs/Cats are..." after previous steps, remove the label.
  s = s.replace(/^(dogs?|cats?)\s+(?:are|is)\s+/i, "");

  // Light cleanup: remove trailing whitespace and excessive quotes
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

