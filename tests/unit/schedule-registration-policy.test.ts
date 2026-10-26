import { describe, expect, it } from 'vitest'
import { isManagementScheduleRole, isPastRegistrationDate, nextMondayKeyInVietnam, reactivationWaiverApplies, registrationTargetsNextWeek, restrictPastRegistration, scheduleRegistrationDeadline, scheduleFreeEditDeadline, managementScheduleDeadline, vietnamWeekKey, isAllowedMaterializationWeek, isCalendarDateKey } from '@/lib/schedule/registration-policy'

describe('schedule registration policy', () => {
  it('waives late registration only in the reactivation week', () => {
    expect(reactivationWaiverApplies({
      hasPreviousSchedule: true,
      waiverWeekStart: '2026-08-10',
      currentWeekStart: '2026-08-10',
      scheduleWeekStart: '2026-08-10',
    })).toBe(true)
    expect(reactivationWaiverApplies({
      hasPreviousSchedule: true,
      waiverWeekStart: '2026-08-10',
      currentWeekStart: '2026-08-17',
      scheduleWeekStart: '2026-08-17',
    })).toBe(false)
  })

  it('locks past dates for existing rotating employees only', () => {
    expect(restrictPastRegistration({
      fixedModeActive: false,
      hasPreviousSchedule: true,
      currentWeekStart: '2026-08-10',
      scheduleWeekStart: '2026-08-10',
    })).toBe(true)
    expect(isPastRegistrationDate('2026-08-11', '2026-08-13', true)).toBe(true)
    expect(isPastRegistrationDate('2026-08-13', '2026-08-13', true)).toBe(false)
  })

  it('keeps first schedules and fixed schedules exempt from the past-date lock', () => {
    expect(restrictPastRegistration({ fixedModeActive: false, hasPreviousSchedule: false, currentWeekStart: '2026-08-10', scheduleWeekStart: '2026-08-10' })).toBe(false)
    expect(restrictPastRegistration({ fixedModeActive: true, hasPreviousSchedule: true, currentWeekStart: '2026-08-10', scheduleWeekStart: '2026-08-10' })).toBe(false)
  })

  it('opens next-week registration on Saturday and Sunday only', () => {
    expect(registrationTargetsNextWeek(1)).toBe(false)
    expect(registrationTargetsNextWeek(4)).toBe(false)
    expect(registrationTargetsNextWeek(5)).toBe(false)
    expect(registrationTargetsNextWeek(6)).toBe(true)
    expect(registrationTargetsNextWeek(7)).toBe(true)
  })

  it('ends on-time registration and free editing exactly at Monday midnight in Vietnam', () => {
    const week = new Date('2026-11-02T00:00:00+07:00')
    const deadline = scheduleRegistrationDeadline(week)
    expect(deadline.toISOString()).toBe('2026-11-01T17:00:00.000Z')
    expect(new Date('2026-11-01T23:59:59+07:00') < deadline).toBe(true)
    expect(new Date('2026-11-02T00:00:00+07:00') < deadline).toBe(false)
    expect(scheduleFreeEditDeadline(week, new Date('2026-10-31T00:00:00+07:00'))).toEqual(deadline)
    expect(scheduleFreeEditDeadline(week, new Date('2026-11-02T08:00:00+07:00'))).toEqual(deadline)
  })

  it('preserves earlier-cycle deadlines instead of rewriting historical rules', () => {
    const week = new Date('2026-10-26T00:00:00+07:00')
    expect(scheduleRegistrationDeadline(week).toISOString()).toBe('2026-10-24T17:00:00.000Z')
    expect(scheduleFreeEditDeadline(week, new Date('2026-10-24T10:00:00+07:00')).toISOString()).toBe('2026-10-25T17:00:00.000Z')
  })

  it('uses the Vietnam work week at midnight, year boundaries and regardless of host timezone', () => {
    expect(vietnamWeekKey(new Date('2026-11-01T17:00:00Z'))).toBe('2026-11-02')
    expect(vietnamWeekKey(new Date('2026-11-02T12:00:00+07:00'))).toBe('2026-11-02')
    expect(vietnamWeekKey(new Date('2027-01-01T00:00:00+07:00'))).toBe('2026-12-28')
    expect(managementScheduleDeadline(new Date('2026-11-02T00:00:00+07:00')).toISOString()).toBe('2026-11-06T17:00:00.000Z')
  })

  it('refuses invalid dates and materialization of arbitrary past/future weeks', () => {
    const friday = new Date('2026-10-30T23:59:59+07:00')
    const saturday = new Date('2026-10-31T00:00:00+07:00')
    expect(isAllowedMaterializationWeek('2026-10-26', friday)).toBe(true)
    expect(isAllowedMaterializationWeek('2026-11-02', friday)).toBe(false)
    expect(isAllowedMaterializationWeek('2026-11-02', saturday)).toBe(true)
    for (const key of ['2026-11-03', '2026-11-09', '2026-10-19', '2026-02-30', '../week']) expect(isAllowedMaterializationWeek(key, saturday)).toBe(false)
    expect(isCalendarDateKey('2028-02-29')).toBe(true)
    expect(isCalendarDateKey('2026-02-29')).toBe(false)
  })

  it('materializes fixed schedules for the next Monday in Vietnam', () => {
    expect(nextMondayKeyInVietnam(new Date('2026-08-13T17:00:00.000Z'))).toBe('2026-08-17') // Friday 00:00
    expect(nextMondayKeyInVietnam(new Date('2026-08-15T17:00:00.000Z'))).toBe('2026-08-17') // Sunday 00:00
    expect(nextMondayKeyInVietnam(new Date('2026-08-16T17:00:00.000Z'))).toBe('2026-08-24') // Monday 00:00
  })

  it('recognizes every management role as an unrestricted schedule owner', () => {
    expect(isManagementScheduleRole('employee')).toBe(false)
    expect(isManagementScheduleRole('manager')).toBe(true)
    expect(isManagementScheduleRole('director')).toBe(true)
    expect(isManagementScheduleRole('admin')).toBe(true)
  })
})
