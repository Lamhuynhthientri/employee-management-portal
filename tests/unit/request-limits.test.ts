import { describe, expect, it } from 'vitest'
import { readJsonBody, limitBurst } from '@/lib/server/request-limits'

describe('API resource limits', () => {
  it('bounds streamed JSON even without a Content-Length header', async () => {
    const request = new Request('http://localhost/test', { method: 'POST', body: JSON.stringify({ text: 'x'.repeat(2000) }) })
    await expect(readJsonBody(request, 1000)).rejects.toMatchObject({ status: 413 })
    await expect(readJsonBody(new Request('http://localhost/test', { method: 'POST', body: '{broken' }))).rejects.toMatchObject({ status: 400 })
  })
  it('permits normal actions and recovers after the burst window', () => {
    limitBurst('unit-limit', 2, 1000, 0)
    limitBurst('unit-limit', 2, 1000, 1)
    expect(() => limitBurst('unit-limit', 2, 1000, 2)).toThrow()
    expect(() => limitBurst('unit-limit', 2, 1000, 1000)).not.toThrow()
  })
})
