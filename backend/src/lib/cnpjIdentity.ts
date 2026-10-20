// RFB 2026 CNPJ: 12 alphanumeric positions followed by 2 numeric check digits.
// Official algorithm: ASCII(character) - 48, modulo 11, legacy weights.
export const normalizeCnpjIdentity = (value: unknown): string =>
  String(value ?? '').trim().toUpperCase().replace(/[.\/\-\s]/g, '');

const FIRST_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const SECOND_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

const checkDigit = (base: string, weights: readonly number[]): number => {
  const total = [...base].reduce((sum, character, index) =>
    sum + (character.charCodeAt(0) - 48) * weights[index]!, 0);
  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
};

export const isValidCnpjIdentity = (value: unknown): boolean => {
  const cnpj = normalizeCnpjIdentity(value);
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const first = checkDigit(cnpj.slice(0, 12), FIRST_WEIGHTS);
  if (first !== Number(cnpj[12])) return false;
  const second = checkDigit(cnpj.slice(0, 12) + String(first), SECOND_WEIGHTS);
  return second === Number(cnpj[13]);
};
