export const SEASON_TYPES = ['RABI', 'KHARIF', 'ZAID', 'ANNUAL'];

const SEASON_LABELS = { RABI: 'Rabi', KHARIF: 'Kharif', ZAID: 'Zaid', ANNUAL: 'Annual' };

// Derives the season year from the sowing date.
// Rabi (Oct–Mar) and Annual crops span two years, e.g. "2026-27";
// a Rabi crop sown Jan–Jun belongs to the season that started the previous year.
// Kharif and Zaid fall within a single year, e.g. "2026".
export function getSeasonYear(seasonType, startDate) {
  const date = new Date(startDate);
  const year = date.getFullYear();
  const month = date.getMonth(); // 0 = Jan

  const span = (from) => `${from}-${String(from + 1).slice(-2)}`;

  if (seasonType === 'RABI') {
    return month >= 6 ? span(year) : span(year - 1);
  }
  if (seasonType === 'ANNUAL') {
    return span(year);
  }
  return String(year);
}

export function getSeasonLabel(seasonType, seasonYear) {
  return `${SEASON_LABELS[seasonType]} ${seasonYear}`;
}
