import { DateTime } from 'luxon';

import type { AppState, ISOTime, JobId, ScheduleSpec, Weekday } from './types';

const WEEKDAY_TO_LUXON: Record<Weekday, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function computeNextRun(schedule: ScheduleSpec, now: ISOTime): ISOTime | null {
  const nowUtc = parseIso(now);
  if (!nowUtc.isValid) {
    return null;
  }

  switch (schedule.kind) {
    case 'one_shot': {
      const runAt = parseIso(schedule.runAt);
      return runAt.isValid && runAt > nowUtc ? toIso(runAt) : null;
    }
    case 'daily': {
      const zonedNow = nowUtc.setZone(schedule.timezone);
      let candidate = zonedNow.set({ hour: schedule.hour, minute: schedule.minute, second: 0, millisecond: 0 });
      if (candidate <= zonedNow) {
        candidate = candidate.plus({ days: 1 });
      }
      return toIso(candidate);
    }
    case 'weekly': {
      const zonedNow = nowUtc.setZone(schedule.timezone);
      for (let daysAhead = 0; daysAhead <= 7; daysAhead += 1) {
        const candidateDay = zonedNow.plus({ days: daysAhead });
        if (!schedule.weekdays.includes(luxonWeekdayToDomain(candidateDay.weekday))) {
          continue;
        }
        const candidate = candidateDay.set({
          hour: schedule.hour,
          minute: schedule.minute,
          second: 0,
          millisecond: 0,
        });
        if (candidate > zonedNow) {
          return toIso(candidate);
        }
      }
      return null;
    }
    case 'cron_like':
      return null;
  }
}

export function schedulerTick(state: AppState, now: ISOTime): JobId[] {
  const due: JobId[] = [];
  const nowUtc = parseIso(now);
  if (!nowUtc.isValid) {
    return due;
  }

  for (const job of Object.values(state.jobs)) {
    if (!job.enabled || job.nextRunAt === null) {
      continue;
    }
    const nextRunAt = parseIso(job.nextRunAt);
    const activeRunId = state.activeRunByJobId[job.jobId];
    if (nextRunAt.isValid && nextRunAt <= nowUtc && activeRunId == null) {
      due.push(job.jobId);
    }
  }

  return due;
}

export function toScheduledIsoFromLocalDateTime(value: string, timezone: string): ISOTime | null {
  const dt = DateTime.fromFormat(value, 'yyyy-MM-dd HH:mm', { zone: timezone });
  return dt.isValid ? toIso(dt) : null;
}

export function parseHourMinute(value: string): { hour: number; minute: number } | null {
  const match = /^(?<hour>\d{2}):(?<minute>\d{2})$/.exec(value);
  if (!match?.groups) {
    return null;
  }
  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

export function parseIso(value: ISOTime): DateTime {
  return DateTime.fromISO(value, { zone: 'utc' }).toUTC();
}

export function toIso(value: DateTime): ISOTime {
  return value.toUTC().toISO({ suppressMilliseconds: true }) ?? value.toUTC().toISO() ?? '';
}

function luxonWeekdayToDomain(weekday: number): Weekday {
  const found = Object.entries(WEEKDAY_TO_LUXON).find(([, value]) => value === weekday);
  if (!found) {
    return 'Mon';
  }
  return found[0] as Weekday;
}
