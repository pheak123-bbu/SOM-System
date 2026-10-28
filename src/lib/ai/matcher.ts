/**
 * Khmer Social Commerce Product & Semantic Matcher
 *
 * Designed specifically for Cambodian social commerce (Telegram, Facebook, TikTok).
 * Handles Khmer unspaced text, compound nouns, colloquial fabric synonyms,
 * abbreviations, and dual Khmer-Latin product names & SKUs.
 */

export const normalizeKhmer = (text: string): string =>
  text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");

/**
 * Common Khmer e-commerce nouns, fabrics, styles, and transliterations.
 */
export const KHMER_SEMANTIC_KEYWORDS = [
  // Clothing Items
  "អាវយឺត", "អាវក្រៅ", "អាវសាច់កប្បាស", "អាវកប្បាស", "អាវប៉ាក់", "អាវ",
  "ខោជើងវែង", "ខោជើងខ្លី", "ខោខូវប៊យ", "ខោហ្ស៊ីន", "ខោលីនិន", "ខោ",
  "សំពត់ខ្មែរ", "សំពត់ផ្កា", "សំពត់លំនាំផ្កា", "សំពត់",
  "រ៉ូប", "ក្រម៉ាត្បាញដោយដៃ", "ក្រម៉ាត្បាញ", "ក្រម៉ាសូត្រ", "ក្រម៉ា",
  "កាបូប", "ស្បែកជើង", "មួក", "ខ្សែក្រវ៉ាត់", "ស្រោមជើង",
  // Fabrics & Materials
  "កប្បាស", "សាច់កប្បាស", "លីនិន", "ក្រណាត់លីនិន", "សូត្រ",
  "ត្បាញដោយដៃ", "ត្បាញ", "លំនាំផ្កា", "ផ្កា", "ខ្មែរ",
  "សាច់ក្រណាត់", "ក្រណាត់", "យឺត", "ជើងវែង", "ជើងខ្លី", "ដៃវែង", "ដៃខ្លី",
  // Beauty & Personal Care
  "សេរ៉ូម", "ឡេ", "ម្សៅ", "ក្រែម", "សាប៊ូ", "ទឹកអប់", "ម៉ាស់",
  // English Transliterations
  "cotton", "linen", "silk", "shirt", "tshirt", "t-shirt", "pants", "skirt", "krama", "dress",
] as const;

/**
 * Synonyms and equivalences in Cambodian fashion / retail.
 */
const SYNONYM_MAP: Record<string, string[]> = {
  កប្បាស: ["សាច់កប្បាស", "កប្បាស", "cotton", "អាវកប្បាស"],
  សាច់កប្បាស: ["កប្បាស", "cotton"],
  លីនិន: ["ក្រណាត់លីនិន", "លីនិន", "linen"],
  ក្រណាត់លីនិន: ["លីនិន", "linen"],
  សូត្រ: ["ក្រម៉ាសូត្រ", "សូត្រ", "silk"],
  ត្បាញ: ["ត្បាញដោយដៃ", "ត្បាញ"],
  ត្បាញដោយដៃ: ["ត្បាញ"],
  ផ្កា: ["លំនាំផ្កា", "ផ្កា"],
  លំនាំផ្កា: ["ផ្កា"],
  អាវ: ["អាវយឺត", "អាវ", "shirt", "tshirt", "t-shirt"],
  អាវយឺត: ["អាវ", "tshirt", "t-shirt"],
  ខោ: ["ខោជើងវែង", "ខោជើងខ្លី", "ខោ", "pants"],
  ខោជើងវែង: ["ខោ", "pants"],
  សំពត់: ["សំពត់ខ្មែរ", "សំពត់ផ្កា", "សំពត់", "skirt"],
  ក្រម៉ា: ["ក្រម៉ាត្បាញដោយដៃ", "ក្រម៉ាសូត្រ", "ក្រម៉ាត្បាញ", "ក្រម៉ា", "krama", "scarf"],
};

export interface MatchableProduct {
  id: string;
  name: string;
  sku?: string | null;
  category?: string | null;
  description?: string | null;
  variants?: Array<{ id?: string; name: string; sku?: string | null }>;
}

export interface MatchResult<T extends MatchableProduct = MatchableProduct> {
  product: T;
  score: number;
  matchedKeywords: string[];
}

/**
 * Matches products from a store catalogue against customer text.
 * Uses exact match, SKU match, category match, variant match, and
 * semantic keyword decomposition with synonym expansion.
 */
export function matchCatalogProducts<T extends MatchableProduct>(
  query: string,
  products: T[]
): T[] {
  const normQuery = normalizeKhmer(query);
  if (!normQuery) return [];

  const results: MatchResult<T>[] = [];

  for (const prod of products) {
    const normName = normalizeKhmer(prod.name);
    const normSku = prod.sku ? normalizeKhmer(prod.sku) : "";
    const normCat = prod.category ? normalizeKhmer(prod.category) : "";
    let score = 0;
    const matchedKeywords: string[] = [];

    // 1. Exact Name Match / Direct Inclusion
    if (normQuery.includes(normName)) {
      score += 160;
      matchedKeywords.push(prod.name);
    } else if (normName.includes(normQuery) && normQuery.length >= 4) {
      score += 120;
      matchedKeywords.push(normQuery);
    }

    // 2. SKU Match
    if (normSku && (normQuery.includes(normSku) || (prod.sku && query.toLowerCase().includes(prod.sku.toLowerCase())))) {
      score += 150;
      matchedKeywords.push(prod.sku!);
    }

    // 3. Variant Match (e.g. S, M, L, XL, Red, Blue)
    if (Array.isArray(prod.variants)) {
      for (const v of prod.variants) {
        const normVName = normalizeKhmer(v.name);
        if (normVName && normQuery.includes(normVName)) {
          score += 35;
          matchedKeywords.push(v.name);
        }
      }
    }

    // 4. Category Match (if specific enough)
    if (normCat && normCat !== "មិនទាន់ចាត់ថ្នាក់" && normCat.length >= 3 && normQuery.includes(normCat)) {
      score += 30;
      matchedKeywords.push(prod.category!);
    }

    // 5. Semantic keyword decomposition & synonym matching
    const prodKeywords = KHMER_SEMANTIC_KEYWORDS.filter((k) => normName.includes(normalizeKhmer(k)));

    const queryMatchedKeywords = prodKeywords.filter((k) => {
      const normK = normalizeKhmer(k);
      if (normQuery.includes(normK)) return true;

      // Check synonyms
      const synonyms = SYNONYM_MAP[k] || [];
      return synonyms.some((syn) => normQuery.includes(normalizeKhmer(syn)));
    });

    if (queryMatchedKeywords.length > 0) {
      queryMatchedKeywords.forEach((kw) => matchedKeywords.push(kw));

      const hasNoun = queryMatchedKeywords.some((k) =>
        ["អាវ", "អាវយឺត", "ខោ", "ខោជើងវែង", "សំពត់", "ក្រម៉ា", "រ៉ូប", "កាបូប", "ស្បែកជើង"].includes(k)
      );
      const hasModifier = queryMatchedKeywords.some((k) =>
        ["កប្បាស", "សាច់កប្បាស", "លីនិន", "ក្រណាត់លីនិន", "សូត្រ", "ផ្កា", "លំនាំផ្កា", "ត្បាញ", "ត្បាញដោយដៃ", "យឺត", "ជើងវែង"].includes(k)
      );

      if (hasNoun && hasModifier) {
        score += 90;
      } else if (hasModifier) {
        score += 60;
      } else if (hasNoun) {
        score += 45;
      }
      score += queryMatchedKeywords.length * 15;
    }

    // 6. Substring token overlap (for unspaced Khmer syllables)
    if (score === 0) {
      const queryParts = normQuery.match(/[\p{L}\p{M}]{3,}/gu) || [];
      for (const part of queryParts) {
        if (part.length >= 3 && normName.includes(part)) {
          score += 30;
          matchedKeywords.push(part);
        }
      }
    }

    if (score >= 35) {
      results.push({ product: prod, score, matchedKeywords });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.map((r) => r.product);
}

/**
 * Checks whether customer is asking an inquiry about product stock, price, or availability.
 */
export function isProductOrStockInquiry(text: string): boolean {
  const norm = normalizeKhmer(text);
  return (
    norm.includes("តើ") ||
    norm.includes("សល់") ||
    norm.includes("ប៉ុន្មាន") ||
    norm.includes("ថ្លៃ") ||
    norm.includes("តម្លៃ") ||
    norm.includes("ខ្លះ") ||
    norm.includes("អត់") ||
    norm.includes("ទេ") ||
    norm.includes("សួរ") ||
    norm.includes("ព័ត៌មាន") ||
    norm.includes("ស្តុក") ||
    norm.includes("ពណ៌") ||
    norm.includes("ពណ៍") ||
    norm.includes("ទំហំ") ||
    norm.includes("size") ||
    norm.includes("price") ||
    norm.includes("cost") ||
    norm.includes("stock") ||
    norm.includes("available") ||
    norm.includes("មាន")
  );
}
