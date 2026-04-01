import { flattenOriginationTerms, originationSignalLexicon } from './originationSignalLexicon.js';

const unique = <T>(values: T[]) => Array.from(new Set(values));

export const extractOriginationKeywordHits = (text: string) => {
  const value = text.toLowerCase();
  return unique(
    flattenOriginationTerms().filter((term) => value.includes(term.toLowerCase())),
  );
};

export const inferOriginationThemes = (text: string) => {
  const value = text.toLowerCase();
  return Object.entries(originationSignalLexicon)
    .filter(([, terms]) => terms.some((term) => value.includes(term.toLowerCase())))
    .map(([theme]) => theme);
};

export const scoreOriginationSignalStrength = (text: string) => {
  const hits = extractOriginationKeywordHits(text);
  const themes = inferOriginationThemes(text);
  return Math.min(90, 50 + hits.length * 4 + themes.length * 6);
};
