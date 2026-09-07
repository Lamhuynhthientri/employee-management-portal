import { describe, expect, it } from 'vitest'
import { formatVietnameseDateInputValue } from '@/components/ui/localized-date-input'

describe('formatVietnameseDateInputValue', () => {
  it('formats an ISO date with Vietnamese month wording', () => {
    expect(formatVietnameseDateInputValue('2026-09-07')).toBe('7 tháng 9, 2026')
  })

  it('does not display invalid or partial values', () => {
    expect(formatVietnameseDateInputValue('2026-02-30')).toBe('')
    expect(formatVietnameseDateInputValue('2026-09')).toBe('')
    expect(formatVietnameseDateInputValue('')).toBe('')
  })
})
