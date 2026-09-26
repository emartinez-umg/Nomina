// Civil dates in UTC keep inclusive weekday counts independent of timezone/DST.
const DAY = 86400000;
export function civilDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw Error('Fecha no válida.');
  const d = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value)
    throw Error('Fecha no válida.');
  return d;
}
const iso = (d) => d.toISOString().slice(0, 10);
export function completedMonths(start, finish) {
  const a = civilDate(start),
    b = civilDate(finish);
  if (b < a) return 0;
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  // A hire on the last days of a month completes its anniversary on the last
  // available day of a shorter month, without accumulating rounding errors.
  const lastDay = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0)).getUTCDate();
  if (b.getUTCDate() < Math.min(a.getUTCDate(), lastDay)) months--;
  return Math.max(0, months);
}
export function serviceAccrual(relations, cutoff) {
  civilDate(cutoff);
  const intervals = relations
    .filter((r) => r.start <= cutoff)
    .map((r) => ({ start: r.start, end: r.end && r.end < cutoff ? r.end : cutoff }))
    .filter((r) => r.end >= r.start)
    .sort((a, b) => a.start.localeCompare(b.start));
  const periods = [];
  for (const interval of intervals) {
    const last = periods.at(-1);
    if (last && civilDate(interval.start).getTime() <= civilDate(last.end).getTime() + DAY)
      last.end = last.end > interval.end ? last.end : interval.end;
    else periods.push({ ...interval });
  }
  const months = periods.reduce((n, p) => n + completedMonths(p.start, p.end), 0);
  return {
    hireDate: relations.map((r) => r.start).sort()[0] || null,
    cutoff,
    periods,
    months,
    accrued: (months * 1.25).toFixed(2),
    monthlyRate: '1.25',
    annualDays: '15',
  };
}
export function scheduledVacationDays(start, end, relations, schedules) {
  const first = civilDate(start),
    last = civilDate(end);
  if (last < first) throw Error('La fecha final debe ser igual o posterior a la inicial.');
  if ((last - first) / DAY > 36600)
    throw Error('El rango de la solicitud es demasiado extenso. Revisa las fechas.');
  const workingDates = [],
    missingDates = [],
    outsideEmployment = [],
    invalidSchedules = new Set(),
    used = new Map();
  for (let day = first.getTime(); day <= last.getTime(); day += DAY) {
    const d = new Date(day),
      date = iso(d),
      weekday = d.getUTCDay() || 7;
    const contracts = relations.filter((r) => r.start <= date && (!r.end || r.end >= date));
    if (!contracts.length) {
      outsideEmployment.push(date);
      continue;
    }
    const applicable = schedules.filter(
      (s) =>
        contracts.some((r) => r.id === s.relationId) &&
        s.start <= date &&
        (!s.end || s.end >= date),
    );
    if (!applicable.length) {
      missingDates.push(date);
      continue;
    }
    for (const s of applicable) {
      used.set(s.id, s);
      if (s.invalid || !s.weekdays.length) invalidSchedules.add(s.name);
    }
    if (applicable.some((s) => s.weekdays.includes(weekday))) workingDates.push(date);
  }
  const errors = [];
  if (outsideEmployment.length)
    errors.push(
      `La solicitud incluye fechas sin contratación vigente (desde ${outsideEmployment[0]}). Revisa la fecha de ingreso o de baja.`,
    );
  if (missingDates.length)
    errors.push(
      `Falta asignar una jornada vigente para parte de la solicitud (desde ${missingDates[0]}).`,
    );
  if (invalidSchedules.size)
    errors.push(
      `Completa los días y horarios laborales de estas jornadas: ${[...invalidSchedules].join(', ')}.`,
    );
  return {
    days: workingDates.length,
    workingDates,
    errors,
    schedules: [...used.values()].map((s) => ({
      id: s.id,
      name: s.name,
      start: s.start,
      end: s.end,
      weekdays: s.weekdays,
    })),
  };
}
