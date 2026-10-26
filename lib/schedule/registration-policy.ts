import { formatVietnamDate, vietnamWeekContaining, WEEK_MS } from '@/lib/archive/retention'

export function reactivationWaiverApplies(params: {
  hasPreviousSchedule: boolean
  waiverWeekStart?: unknown
  currentWeekStart: string
  scheduleWeekStart: string
}): boolean {
  return params.hasPreviousSchedule &&
    params.waiverWeekStart === params.currentWeekStart &&
    params.scheduleWeekStart === params.currentWeekStart
}

export function restrictPastRegistration(params: {
  fixedModeActive: boolean
  hasPreviousSchedule: boolean
  currentWeekStart: string
  scheduleWeekStart: string
}): boolean {
  return !params.fixedModeActive &&
    params.hasPreviousSchedule &&
    params.scheduleWeekStart === params.currentWeekStart
}

export function isPastRegistrationDate(dateKey: string, todayKey: string, restricted: boolean): boolean {
  return restricted && dateKey < todayKey
}

/** ISO weekday: Monday = 1, ..., Sunday = 7. */
export function registrationTargetsNextWeek(isoWeekday: number): boolean {
  return isoWeekday >= 6 && isoWeekday <= 7
}

/** Returns the next Monday after `date`, using Vietnam's calendar date. */
export function nextMondayKeyInVietnam(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  const isoWeekday = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[value('weekday')] || 1
  const base = new Date(Date.UTC(Number(value('year')), Number(value('month')) - 1, Number(value('day'))))
  base.setUTCDate(base.getUTCDate() + (8 - isoWeekday))
  return base.toISOString().slice(0, 10)
}

export function isManagementScheduleRole(role: unknown): boolean {
  return role === 'admin' || role === 'manager' || role === 'director'
}
const DAY_MS = 24 * 60 * 60 * 1000
// Change starts with the next complete registration cycle. Existing penalties
// and deadlines from earlier work weeks keep their original policy.
export const SATURDAY_REGISTRATION_FIRST_WEEK = '2026-11-02'

export function vietnamIsoWeekday(date: Date): number {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).getUTCDay() || 7
}

export function vietnamWeekKey(date: Date, offset = 0): string {
  return formatVietnamDate(new Date(vietnamWeekContaining(date).start.getTime() + offset * WEEK_MS))
}

export function isCalendarDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    formatVietnamDate(new Date(`${value}T00:00:00+07:00`)) === value
}

export function scheduleRegistrationDeadline(firstShift: Date): Date {
  const week = vietnamWeekContaining(firstShift)
  return new Date(week.start.getTime() - (week.key < SATURDAY_REGISTRATION_FIRST_WEEK ? DAY_MS : 0))
}

export function resubmissionGraceAvailable(firstShift: Date, firstSubmittedAt: Date, now = new Date()): boolean {
  const deadline = scheduleRegistrationDeadline(firstShift)
  return firstSubmittedAt < deadline && formatVietnamDate(now) === formatVietnamDate(deadline)
}

export function scheduleFreeEditDeadline(firstShift: Date, firstSubmittedAt: Date): Date {
  const week = vietnamWeekContaining(firstShift)
  const deadline = scheduleRegistrationDeadline(firstShift)
  if (week.key >= SATURDAY_REGISTRATION_FIRST_WEEK) return deadline
  if (firstSubmittedAt < deadline) return new Date(deadline.getTime() + DAY_MS)
  return new Date(new Date(`${formatVietnamDate(firstSubmittedAt)}T00:00:00+07:00`).getTime() + DAY_MS)
}

export function managementScheduleDeadline(firstShift: Date): Date {
  const week = vietnamWeekContaining(firstShift)
  return new Date(week.start.getTime() + (week.key < SATURDAY_REGISTRATION_FIRST_WEEK ? 4 : 5) * DAY_MS)
}

export function isAllowedMaterializationWeek(key: string, now = new Date()): boolean {
  return isCalendarDateKey(key) && [vietnamWeekKey(now), vietnamWeekKey(now, 1)].includes(key) &&
    (key === vietnamWeekKey(now) || registrationTargetsNextWeek(vietnamIsoWeekday(now)))
}
