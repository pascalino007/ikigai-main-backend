/**
 * Shop working hours are stored as `[dayLabel, "HH:mm - HH:mm" | "fermé" | "-"]` rows.
 * The day label is English when written by the dashboard / provider app and French
 * for mobile / legacy data, so any lookup must accept both.
 */
const DAY_LABELS: string[][] = [
  ['sunday', 'dimanche'],
  ['monday', 'lundi'],
  ['tuesday', 'mardi'],
  ['wednesday', 'mercredi'],
  ['thursday', 'jeudi'],
  ['friday', 'vendredi'],
  ['saturday', 'samedi'],
];

export type ShopDayHours =
  | { state: 'open'; start: string; end: string } // HH:mm
  | { state: 'closed' } // explicitly closed that day ("fermé" / "-")
  | { state: 'unknown' }; // no (parseable) hours configured for that day

/** Opening hours for `dayOfWeek` (0 = Sunday … 6 = Saturday). */
export function getShopHoursForDay(workingHours: unknown, dayOfWeek: number): ShopDayHours {
  if (!Array.isArray(workingHours)) return { state: 'unknown' };

  const labels = DAY_LABELS[dayOfWeek] ?? [];
  const entry = workingHours.find(
    (wh) => Array.isArray(wh) && wh.length >= 2 && labels.includes(String(wh[0]).toLowerCase().trim()),
  );
  if (!entry) return { state: 'unknown' };

  const hours = String(entry[1]).trim();
  if (hours.toLowerCase() === 'fermé' || hours === '-') return { state: 'closed' };

  const match = hours.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  if (!match) return { state: 'unknown' };

  const pad = (n: string) => n.padStart(2, '0');
  return { state: 'open', start: `${pad(match[1])}:${match[2]}`, end: `${pad(match[3])}:${match[4]}` };
}
