// Structural checksum only; this does not verify registration or taxpayer status with SAT.
export function nitCheckDigit(number) {
  const digits = String(number);
  if (!/^\d{1,12}$/.test(digits)) return null;
  const sum = [...digits].reduce(
    (total, digit, i) => total + Number(digit) * (digits.length + 1 - i),
    0,
  );
  const result = (11 - (sum % 11)) % 11;
  return result === 10 ? 'K' : String(result);
}
export function validNit(value) {
  const match = String(value).match(/^(\d{1,12})-([0-9Kk])$/);
  return !!match && nitCheckDigit(match[1]) === match[2].toUpperCase();
}
