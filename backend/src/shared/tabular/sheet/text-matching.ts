const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;
const ARABIC_DIACRITICS_AND_TATWEEL = /[ً-ْٰـ]/g;

export function toWesternDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - ARABIC_INDIC_ZERO))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - EXTENDED_ARABIC_INDIC_ZERO));
}

export function normalizeForMatching(text: string): string {
  return text
    .replace(ARABIC_DIACRITICS_AND_TATWEEL, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeHeader(header: string): string {
  return normalizeForMatching(header).replace(/\s*\*$/, "");
}
