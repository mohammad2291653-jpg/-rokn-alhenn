/** Administrative city lists and explicit checks supplement each other. They do
 * not provide address geocoding; dispatch still confirms the supplied address. */
export function normalizeAddress(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\p{Cf}/gu, "").replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

const gazaPlaces = ["غزة", "غزه", "قطاع غزة", "gaza", "رفح", "rafah", "خان يونس", "خانيونس", "khan yunis", "khan younis", "جباليا", "jabalia", "النصيرات", "nuseirat", "دير البلح", "deir al balah", "بيت حانون", "beit hanoun", "بيت لاهيا", "beit lahia", "الشجاعية", "البريج", "المغازي", "الزوايدة", "خزاعة", "عبسان", "القرارة"];
const jerusalemPlaces = ["القدس", "قدس", "jerusalem", "شعفاط", "بيت حنينا", "كفر عقب", "الرام", "عناتا", "ابو ديس", "العيزرية", "الطور", "سلوان", "العيسوية"];

function mentions(value: string, term: string): boolean {
  const normalizedTerm = normalizeAddress(term);
  // Arabic prepositions/conjunctions may be joined to place names: بغزة، وبالقدس.
  // Restrict joined prefixes to Arabic terms; English names need word boundaries.
  const prefix = /^[\u0600-\u06ff]/u.test(normalizedTerm) ? "[وفبكل]{0,3}" : "";
  return new RegExp(`(?:^|\\s)${prefix}${normalizedTerm}(?=\\s|$)`,"u").test(normalizeAddress(value));
}

export function addressArea(value: string): "gaza" | "jerusalem" | null {
  if (gazaPlaces.some((term) => mentions(value, term))) return "gaza";
  if (jerusalemPlaces.some((term) => mentions(value, term))) return "jerusalem";
  return null;
}

export function addressMentions(value: string, term: string): boolean {
  return mentions(value, term);
}
