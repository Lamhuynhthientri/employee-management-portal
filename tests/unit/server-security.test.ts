import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => ({
  profiles: new Map<string, Record<string, unknown>>(),
  token: { uid: 'actor', auth_time: 200, role: 'admin' },
  verify: vi.fn(),
  queryRead: vi.fn(async () => ({ docs: [], empty: true })),
  listArchives: vi.fn(async () => []),
}))
vi.mock('@/lib/server/firebase-admin', () => ({
  adminAuth: { verifyIdToken: fixtures.verify },
  adminDb: { collection: () => {
    const chain = { where: () => chain, orderBy: () => chain, limit: () => chain, get: fixtures.queryRead,
      doc: (uid: string) => ({ get: async () => ({ exists: fixtures.profiles.has(uid), get: (key: string) => fixtures.profiles.get(uid)?.[key] }) }),
    }
    return chain
  } },
}))
vi.mock('@/lib/server/google-drive-archive', () => ({ listWeeklyArchives: fixtures.listArchives, readWeeklyArchive: vi.fn() }))
vi.mock('next/cache', () => ({ unstable_cache: (callback: () => unknown) => callback }))

import { authenticateRequest, requireHost, type RequestActor } from '@/lib/server/api-auth'
import { buildEmployeeReviewContext } from '@/lib/server/employee-review'

beforeEach(() => {
  vi.clearAllMocks()
  fixtures.profiles.clear()
  fixtures.verify.mockResolvedValue(fixtures.token)
})
const request = () => new Request('https://example.com/api/test', { headers: { authorization: 'Bearer signed-test-token' } })
const actor = (role: RequestActor['role'] = 'admin') => ({ uid: 'actor', role, factoryId: 'factory-1', token: fixtures.token }) as unknown as RequestActor

describe('server authentication and role boundaries', () => {
  it('takes role/factory from the profile, never from role claims or client headers', async () => {
    fixtures.profiles.set('actor', { role: 'employee', factoryId: 'factory-2', status: 'active' })
    expect(await authenticateRequest(request())).toMatchObject({ role: 'employee', factoryId: 'factory-2' })
    expect(fixtures.verify).toHaveBeenCalledWith('signed-test-token', true)
  })
  it.each(['admin', 'manager', 'director', 'employee'])('denies inactive %s', async (role) => {
    fixtures.profiles.set('actor', { role, factoryId: 'factory-1', status: 'inactive' })
    await expect(authenticateRequest(request())).rejects.toMatchObject({ status: 403 })
  })
  it('denies Auth-only and old sessions after reactivation', async () => {
    await expect(authenticateRequest(request())).rejects.toMatchObject({ status: 403 })
    fixtures.profiles.set('actor', { role: 'employee', status: 'active', sessionsValidAfter: 300 })
    await expect(authenticateRequest(request())).rejects.toMatchObject({ status: 401 })
  })
  it('reserves global jobs for Host', () => {
    expect(() => requireHost(actor('admin'))).toThrow()
    expect(() => requireHost(actor('manager'))).toThrow()
    expect(() => requireHost(actor('director'))).not.toThrow()
  })
})

describe('employee review object authorization', () => {
  it('rejects a different factory before reading live history or Drive', async () => {
    fixtures.profiles.set('target', { role: 'employee', factoryId: 'factory-2' })
    await expect(buildEmployeeReviewContext('target', new Date('2026-11-02T00:00:00+07:00'), actor())).rejects.toMatchObject({ status: 403 })
    expect(fixtures.queryRead).not.toHaveBeenCalled()
    expect(fixtures.listArchives).not.toHaveBeenCalled()
  })
  it('allows same-factory management and Host across factories', async () => {
    fixtures.profiles.set('target', { role: 'employee', factoryId: 'factory-1' })
    expect(await buildEmployeeReviewContext('target', new Date('2026-11-02T00:00:00+07:00'), actor())).toMatchObject({ employeeId: 'target', referenceWeekStart: '2026-11-02' })
    fixtures.profiles.set('target', { role: 'employee', factoryId: 'factory-2' })
    expect(await buildEmployeeReviewContext('target', new Date('2026-11-02T00:00:00+07:00'), actor('director'))).toMatchObject({ employeeId: 'target' })
  })
})
