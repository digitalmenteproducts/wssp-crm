import type {
  AvailabilitySlot,
  ClinicAppointment,
  ClinicAvailability,
  ClinicScheduleBlock,
  GetAvailabilityInput,
} from "@/types/clinic";
import {
  getWeekdayInTimeZone,
  zonedLocalToUtcIso,
} from "@/lib/clinic/datetime";

export { getWeekdayInTimeZone, zonedLocalToUtcIso } from "@/lib/clinic/datetime";

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Calcula slots libres para un día local del business.
 * Provider interno (Supabase); sustituible por Google/Calendly en el futuro.
 */
export function computeAvailabilitySlots(input: {
  date: string;
  timeZone: string;
  durationMinutes: number;
  weekly: ClinicAvailability[];
  appointments: Array<Pick<ClinicAppointment, "start_at" | "end_at" | "status">>;
  blocks: Array<Pick<ClinicScheduleBlock, "start_at" | "end_at">>;
}): AvailabilitySlot[] {
  const day = getWeekdayInTimeZone(input.date, input.timeZone);
  const blocksForDay = input.weekly.filter(
    (row) => row.active && row.day_of_week === day,
  );

  if (blocksForDay.length === 0) {
    return [];
  }

  const busy: Array<{ start: number; end: number }> = [];

  for (const appt of input.appointments) {
    if (appt.status === "cancelled") continue;
    busy.push({
      start: new Date(appt.start_at).getTime(),
      end: new Date(appt.end_at).getTime(),
    });
  }
  for (const block of input.blocks) {
    busy.push({
      start: new Date(block.start_at).getTime(),
      end: new Date(block.end_at).getTime(),
    });
  }

  const slots: AvailabilitySlot[] = [];

  for (const window of blocksForDay) {
    const duration =
      input.durationMinutes > 0
        ? input.durationMinutes
        : window.slot_duration_minutes;
    const durationMs = duration * 60_000;
    const startMin = parseTimeToMinutes(window.start_time.slice(0, 5));
    const endMin = parseTimeToMinutes(window.end_time.slice(0, 5));

    for (let minute = startMin; minute + duration <= endMin; minute += duration) {
      const hh = String(Math.floor(minute / 60)).padStart(2, "0");
      const mm = String(minute % 60).padStart(2, "0");
      const startIso = zonedLocalToUtcIso(
        input.date,
        `${hh}:${mm}`,
        input.timeZone,
      );
      const startMs = new Date(startIso).getTime();
      const endMs = startMs + durationMs;
      const endIso = new Date(endMs).toISOString();

      const conflict = busy.some((b) =>
        rangesOverlap(startMs, endMs, b.start, b.end),
      );
      if (!conflict) {
        slots.push({ start_at: startIso, end_at: endIso });
      }
    }
  }

  return slots.sort((a, b) => a.start_at.localeCompare(b.start_at));
}

export function isSlotFree(input: {
  startAt: string;
  endAt: string;
  appointments: Array<Pick<ClinicAppointment, "start_at" | "end_at" | "status" | "id">>;
  blocks: Array<Pick<ClinicScheduleBlock, "start_at" | "end_at">>;
  ignoreAppointmentId?: string;
}): boolean {
  const start = new Date(input.startAt).getTime();
  const end = new Date(input.endAt).getTime();
  if (!(end > start)) return false;

  for (const appt of input.appointments) {
    if (appt.status === "cancelled") continue;
    if (input.ignoreAppointmentId && appt.id === input.ignoreAppointmentId) {
      continue;
    }
    const aStart = new Date(appt.start_at).getTime();
    const aEnd = new Date(appt.end_at).getTime();
    if (rangesOverlap(start, end, aStart, aEnd)) return false;
  }
  for (const block of input.blocks) {
    const bStart = new Date(block.start_at).getTime();
    const bEnd = new Date(block.end_at).getTime();
    if (rangesOverlap(start, end, bStart, bEnd)) return false;
  }
  return true;
}

/** Facade tipado del provider interno (extensible a Google/Calendly). */
export type CalendarProvider = {
  getAvailability: (
    input: GetAvailabilityInput & {
      weekly: ClinicAvailability[];
      appointments: ClinicAppointment[];
      blocks: ClinicScheduleBlock[];
    },
  ) => AvailabilitySlot[];
};

export const internalCalendarProvider: CalendarProvider = {
  getAvailability(input) {
    return computeAvailabilitySlots({
      date: input.date,
      timeZone: input.timezone,
      durationMinutes:
        input.durationMinutes ??
        input.weekly.find((w) => w.active)?.slot_duration_minutes ??
        30,
      weekly: input.weekly,
      appointments: input.appointments,
      blocks: input.blocks,
    });
  },
};
