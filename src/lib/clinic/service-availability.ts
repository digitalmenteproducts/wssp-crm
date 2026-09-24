import type { ClinicAvailability } from "@/types/clinic";

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(total: number): string {
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}:00`;
}

export type TimeWindow = { start_time: string; end_time: string };

/**
 * Intersect two sets of time windows on the same day.
 * Returns empty if no overlap.
 */
export function intersectTimeWindows(
  a: TimeWindow[],
  b: TimeWindow[],
): TimeWindow[] {
  const out: TimeWindow[] = [];
  for (const wa of a) {
    const a0 = parseTimeToMinutes(wa.start_time.slice(0, 5));
    const a1 = parseTimeToMinutes(wa.end_time.slice(0, 5));
    for (const wb of b) {
      const b0 = parseTimeToMinutes(wb.start_time.slice(0, 5));
      const b1 = parseTimeToMinutes(wb.end_time.slice(0, 5));
      const start = Math.max(a0, b0);
      const end = Math.min(a1, b1);
      if (end > start) {
        out.push({
          start_time: minutesToTime(start),
          end_time: minutesToTime(end),
        });
      }
    }
  }
  return out;
}

/**
 * Restrict professional weekly windows to service-specific windows (same day).
 * Keeps resource_id / slot_duration from the professional windows.
 */
export function restrictWeeklyByServiceWindows(input: {
  weekly: ClinicAvailability[];
  dayOfWeek: number;
  serviceWindows: TimeWindow[];
  durationMinutes: number;
}): ClinicAvailability[] {
  const dayWindows = input.weekly.filter(
    (w) => w.active && w.day_of_week === input.dayOfWeek,
  );
  if (dayWindows.length === 0) return [];
  if (input.serviceWindows.length === 0) return [];

  const resourceWindows: TimeWindow[] = dayWindows.map((w) => ({
    start_time: w.start_time,
    end_time: w.end_time,
  }));
  const intersected = intersectTimeWindows(
    resourceWindows,
    input.serviceWindows,
  );
  if (intersected.length === 0) return [];

  const template = dayWindows[0]!;
  return intersected.map((win, index) => ({
    ...template,
    id: `${template.id}-svc-${index}`,
    start_time: win.start_time,
    end_time: win.end_time,
    slot_duration_minutes: input.durationMinutes,
    active: true,
  }));
}
