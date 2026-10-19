// Parses a numeric body value; returns NaN for anything that isn't a finite number.
export function toNumber(value) {
  if (value === null || value === '' || typeof value === 'boolean') {
    return NaN;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}
