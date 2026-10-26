import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import type { DecodedIdToken } from 'firebase-admin/auth'
import type { RequestActor } from '@/lib/server/api-auth'

const state = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>(), writes: vi.fn() }))
vi.mock('@/lib/server/firebase-admin', () => {
  const snapshot = (path: string) => ({ exists: state.rows.has(path), get: (field: string) => state.rows.get(path)?.[field] })
  const collection = (path: string): unknown => ({
    doc: (id: string) => ({ path: `${path}/${id}`, collection: (name: string) => collection(`${path}/${id}/${name}`) }),
    limit: (count: number) => ({ path, count, query: true }),
  })
  return { adminDb: { collection, runTransaction: async (callback: (tx: unknown) => unknown) => callback({
    get: async (ref: { path: string; count?: number; query?: boolean }) => ref.query
      ? { size: Math.min([...state.rows.keys()].filter((key) => key.startsWith(`${ref.path}/`)).length, ref.count || 0) }
      : snapshot(ref.path),
    set: (ref: { path: string }, value: Record<string, unknown>) => { state.writes(ref.path, value); state.rows.set(ref.path, value) },
  }) } }
})

import { claimProfileUpload } from '@/lib/server/profile-upload-guard'
import { registerNotificationDevice } from '@/lib/server/notification-devices'

const now = new Date('2026-10-26T10:00:00+07:00')
const token = { uid: 'e1', auth_time: now.getTime() / 1000 - 60 } as DecodedIdToken
const actor = { uid: 'e1', role: 'employee', factoryId: 'factory-1' } as RequestActor
beforeEach(() => { state.rows.clear(); state.writes.mockClear() })

describe('durable avatar upload gate', () => {
  it('denies Auth-only uploads when registration is closed and inactive profiles', async () => {
    await expect(claimProfileUpload(token, now)).rejects.toMatchObject({ status: 403 })
    state.rows.set('employees/e1', { status: 'inactive' })
    await expect(claimProfileUpload(token, now)).rejects.toMatchObject({ status: 403 })
    expect(state.writes).not.toHaveBeenCalled()
  })
  it('allows onboarding only while the registration gate and daily allowance are valid', async () => {
    state.rows.set('managementSettings/accountRegistration', { isOpen: true, closesAt: Timestamp.fromMillis(now.getTime() + 60_000) })
    await claimProfileUpload(token, now)
    expect(state.writes).toHaveBeenCalledTimes(2)
    state.rows.set('securityBudgets/avatar-e1', { day: '2026-10-26', count: 3 })
    await expect(claimProfileUpload(token, now)).rejects.toMatchObject({ status: 429 })
  })
  it('blocks repeated, globally excessive and revoked uploads without Drive calls', async () => {
    state.rows.set('employees/e1', { status: 'active' })
    await claimProfileUpload(token, now)
    await expect(claimProfileUpload(token, now)).rejects.toMatchObject({ status: 429 })
    state.rows.set('securityBudgets/avatar-global', { day: '2026-10-26', count: 300 })
    await expect(claimProfileUpload(token, new Date(now.getTime() + 20_000))).rejects.toMatchObject({ status: 429 })
    state.rows.set('employees/e1', { status: 'active', sessionsValidAfter: token.auth_time + 1 })
    await expect(claimProfileUpload(token, now)).rejects.toMatchObject({ status: 401 })
  })
})

describe('notification-device quota', () => {
  it('caps new device records but permits refresh of an existing device at the cap', async () => {
    for (let index = 0; index < 5; index += 1) state.rows.set(`employees/e1/notificationDevices/device00000${index}`, {
      createdAt: Timestamp.now(), lastSeenAt: Timestamp.now(), platform: 'iPhone',
    })
    await expect(registerNotificationDevice(actor, 'device9999999', 'iPhone')).rejects.toMatchObject({ status: 409 })
    await registerNotificationDevice(actor, 'device000000', 'iPhone')
    expect(state.writes).not.toHaveBeenCalled()
  })
  it('validates device IDs and writes ownership from the actor', async () => {
    await expect(registerNotificationDevice(actor, '../other', 'iPhone')).rejects.toMatchObject({ status: 400 })
    await registerNotificationDevice(actor, 'device1234567', 'iPhone')
    expect(state.writes).toHaveBeenCalledWith('employees/e1/notificationDevices/device1234567', expect.objectContaining({ employeeId: 'e1', permission: 'granted' }))
  })
})
