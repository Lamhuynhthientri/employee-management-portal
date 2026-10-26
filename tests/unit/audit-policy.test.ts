import { describe, expect, it } from 'vitest'
import { workflowNeedsAudit } from '@/lib/server/audit-trail'

describe('workflow audit write budget', () => {
  it('skips read-only calls and no-op fixed-schedule checks', () => {
    for (const action of ['getManagementContact', 'getFactoryManagerSeats', 'getDutyAvailability', 'getWeeklyScheduleTarget']) {
      expect(workflowNeedsAudit(action, {})).toBe(false)
    }
    expect(workflowNeedsAudit('ensureFixedSchedule', { created: false, ids: [] })).toBe(false)
    expect(workflowNeedsAudit('ensureFixedSchedule', { created: true, ids: ['schedule'] })).toBe(true)
  })
  it('retains mutation auditing and avoids duplicated audit writes on replay', () => {
    expect(workflowNeedsAudit('submitSchedules', { ids: ['schedule'] })).toBe(true)
    expect(workflowNeedsAudit('submitSchedules', { idempotentReplay: true })).toBe(false)
  })
})
