import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'employee-1' } as { uid: string } | null },
  callWorkflowApi: vi.fn(),
}))

vi.mock('@/lib/firebase', () => ({ auth: mocks.auth }))
vi.mock('@/lib/services/workflowApi', () => ({ callWorkflowApi: mocks.callWorkflowApi }))

import {
  getCachedManagementContact,
  getManagementContact,
  type ManagementContact,
} from '@/lib/services/managementSettingsService'

const storage = new Map<string, string>()
const contact: ManagementContact = {
  uid: 'manager-1',
  fullName: 'Quản lý Minh Sơn',
  photoURL: 'https://example.test/avatar.webp',
  facebookUrl: '',
}

describe('management contact cache', () => {
  beforeEach(() => {
    storage.clear()
    mocks.callWorkflowApi.mockReset()
    mocks.auth.currentUser = { uid: `employee-${Math.random()}` }
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    })
  })

  it('renders a cached contact only for the account that owns the cache entry', () => {
    const uid = mocks.auth.currentUser!.uid
    storage.set(`tricandy:management-contact:${uid}`, JSON.stringify({
      ownerUid: uid,
      cachedAt: Date.now(),
      value: contact,
    }))

    expect(getCachedManagementContact(uid)).toEqual(contact)
    expect(getCachedManagementContact('another-employee')).toBeNull()
  })

  it('reuses a fresh cached contact without another API read', async () => {
    const uid = mocks.auth.currentUser!.uid
    storage.set(`tricandy:management-contact:${uid}`, JSON.stringify({
      ownerUid: uid,
      cachedAt: Date.now(),
      value: contact,
    }))

    await expect(getManagementContact()).resolves.toEqual(contact)
    expect(mocks.callWorkflowApi).not.toHaveBeenCalled()
  })

  it('refreshes stale data once and saves the new contact for the next render', async () => {
    const uid = mocks.auth.currentUser!.uid
    const updated = { ...contact, photoURL: 'https://example.test/avatar-new.webp' }
    storage.set(`tricandy:management-contact:${uid}`, JSON.stringify({
      ownerUid: uid,
      cachedAt: Date.now() - 13 * 60 * 60_000,
      value: contact,
    }))
    mocks.callWorkflowApi.mockResolvedValue(updated)

    await expect(Promise.all([getManagementContact(), getManagementContact()])).resolves.toEqual([updated, updated])
    expect(mocks.callWorkflowApi).toHaveBeenCalledOnce()
    expect(getCachedManagementContact(uid)).toEqual(updated)
  })
})
