// Read-only recovery code: mirrors the 2026 Receita Federal alphanumeric DV.
// Never persist or print CNPJ in diagnostic reports.
export const canonicalCnpjKey = (value) => {
  const code = String(value ?? '').trim().toUpperCase().replace(/[.\/\-\s]/g, '');
  if (!/^[A-Z0-9]{12}\d{2}$/.test(code) || /^(\d)\1{13}$/.test(code)) return '';
  const dv = (base, weights) => {
    const rem = [...base].reduce((acc, char, i) =>
      acc + (char.charCodeAt(0) - 48) * weights[i], 0) % 11;
    return rem < 2 ? 0 : 11 - rem;
  };
  const first = dv(code.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = dv(code.slice(0, 12) + String(first), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return Number(code[12]) === first && Number(code[13]) === second ? code : '';
};
