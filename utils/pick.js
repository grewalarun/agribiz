// Returns a new object containing only the allowed keys present in source.
export function pick(source = {}, allowedKeys = []) {
  return allowedKeys.reduce((acc, key) => {
    if (source[key] !== undefined) {
      acc[key] = source[key];
    }
    return acc;
  }, {});
}
