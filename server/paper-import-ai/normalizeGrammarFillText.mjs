/**
 * Publish-time grammar-fill passage bytes. Parse already ran
 * normalizePassageText; this second pass is what paper-asset stores and what
 * canonical admission must match.
 */
export function normalizeGrammarFillText(text) {
  // Normalize blank numbers: two spaces before and after the number.
  return String(text || '')
    // Standardize "56." or "(56)" to bare number.
    .replace(/\b(\d{2})[.．、](?=\s)/g, '$1')
    // Add two spaces around blank numbers 56-65.
    .replace(/(^|\s)(5[6-9]|6[0-5])(\s|$)/g, '$1  $2  $3')
    // Collapse multiple spaces.
    .replace(/[ ]{3,}/g, '  ')
    // Ensure space after English punctuation.
    .replace(/([.,;:!?])([A-Za-z])/g, '$1 $2')
    // Normalize prompt parentheses spacing: "56(wear)" → "56 (wear)".
    .replace(/(\d{2})[(（]/g, '$1 (')
    .replace(/[)）](?=\S)/g, ') ')
    // Clean trailing Chinese from answers.
    .replace(/[一-鿿]+$/, '')
    .trim()
}
