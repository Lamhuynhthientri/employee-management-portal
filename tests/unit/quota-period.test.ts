import { describe, expect, it } from 'vitest'
import { firestoreQuotaPeriodStart } from '@/lib/operations/quota-period'

describe('Firestore Pacific quota reset', () => {
  it.each([
    ['2026-10-26T13:59:59+07:00', '2026-10-25T07:00:00.000Z'],
    ['2026-10-26T14:00:00+07:00', '2026-10-26T07:00:00.000Z'],
    ['2026-12-01T14:59:59+07:00', '2026-11-30T08:00:00.000Z'],
    ['2026-12-01T15:00:00+07:00', '2026-12-01T08:00:00.000Z'],
    ['2026-03-08T12:00:00Z', '2026-03-08T08:00:00.000Z'],
    ['2026-11-01T12:00:00Z', '2026-11-01T07:00:00.000Z'],
  ])('handles %s', (instant, expected) => {
    expect(firestoreQuotaPeriodStart(new Date(instant)).toISOString()).toBe(expected)
  })
})
