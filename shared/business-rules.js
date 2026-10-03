// Defaults pending HR confirmation. Shared by browser and API; no legal age is assumed.
export const businessRules = Object.freeze({
  birthMinimum: '1940-01-01',
  hiringMinimumAge: 0,
  draftRetentionDays: 15,
  draftDelayMs: 1200,
  closingNoticeDays: [3, 1, 0],
  employeeCodePrefix: 'EMP-',
  employeeCodeDigits: 4,
});
export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function birthBounds(now = new Date(), rules = businessRules) {
  const max = new Date(now.getFullYear() - rules.hiringMinimumAge, now.getMonth(), now.getDate());
  // Feb 29 birthdays use Feb 28 when the cutoff year is not a leap year.
  if (max.getMonth() !== now.getMonth()) max.setDate(0);
  return { min: rules.birthMinimum, max: localDate(max) };
}
