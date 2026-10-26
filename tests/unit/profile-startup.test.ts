import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Employee } from '@/lib/models/types'
import { employeeShell } from '@/lib/cache/employee-cache'

const harness = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  pathname: '/',
  effects: [] as Array<() => unknown>,
  router: { push: vi.fn(), replace: vi.fn() },
}))

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: (effect: () => unknown) => { harness.effects.push(effect) },
  useState: (value: unknown) => [typeof value === 'function' ? value() : value, vi.fn()],
}))
vi.mock('next/navigation', () => ({ useRouter: () => harness.router, usePathname: () => harness.pathname }))
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }))
vi.mock('@/lib/hooks/useAuth', () => ({
  useAuth: () => harness.auth,
  useUserRole: () => (harness.auth.employee as Employee | null)?.role || null,
}))
vi.mock('@/lib/services/employeeService', () => ({ getAllEmployees: vi.fn() }))
vi.mock('@/lib/services/scheduleService', () => ({
  getManagementSchedulesByDateRange: vi.fn(), getSchedulesByDateRange: vi.fn(), hasEmployeeSchedules: vi.fn(),
}))
vi.mock('@/lib/services/previewWorkflow', () => ({ getPreviewSchedules: vi.fn() }))
vi.mock('@/lib/services/managementSettingsService', () => ({ getWeeklyScheduleTarget: vi.fn() }))
vi.mock('@/components/notifications/notification-feed-provider', () => ({
  useNotificationFeed: () => ({ managementPendingItems: [], managementPendingReady: false }),
}))
vi.mock('@/lib/hooks/useManagementFactory', () => ({
  useManagementFactory: () => ({ factoryId: 'factory-1', setFactoryId: vi.fn() }),
}))

import HomePage from '@/app/page'
import { ProfileCompletionGuard } from '@/components/auth/profile-completion-guard'

const complete: Employee = {
  uid: 'profile-test', employeeCode: '001', fullName: 'Test profile', phone: '0901234567',
  photoURL: '/tricandy-logo.png', facebookUrl: 'https://facebook.com/example',
  email: 'test@example.com', role: 'employee', status: 'active', factoryId: 'factory-1',
  joinDate: new Date(), createdAt: new Date(), updatedAt: new Date(),
}

function renderStartup(employee: Employee | null, profileReady: boolean, isLoading = false) {
  harness.auth = {
    authUser: { uid: complete.uid, displayName: complete.fullName }, employee,
    isLoading, profileReady, isPreviewMode: false, logout: vi.fn(),
  }
  harness.effects = []
  HomePage()
  // Exercise the actual home routing effect, without running data-fetch effects.
  harness.effects[0]()
  harness.effects = []
  ProfileCompletionGuard({ children: React.createElement('div', null, 'content') })
  harness.effects.forEach((effect) => effect())
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('React', React)
  harness.pathname = '/'
})
afterEach(() => vi.unstubAllGlobals())

describe.each(['director', 'admin', 'manager', 'employee'] as const)('profile startup: %s', (role) => {
  it('opens a saved profile from the minimal cache, then receives full data without redirecting', () => {
    const saved = { ...complete, role }
    const shell = employeeShell(saved)
    expect(shell.phone).toBe('')
    expect(shell.facebookUrl).toBeUndefined()
    renderStartup(shell, false)
    renderStartup(saved, true)
    // Reopening the app repeats the same cache -> full-profile sequence.
    renderStartup(shell, false)
    renderStartup(saved, true)
    expect(harness.router.replace).not.toHaveBeenCalled()
    expect(harness.router.push).not.toHaveBeenCalled()
  })

  it('waits for the profile before deciding that setup is required', () => {
    renderStartup(null, false, true)
    expect(harness.router.replace).not.toHaveBeenCalled()
    renderStartup({ ...complete, role, phone: '' }, true)
    expect(harness.router.replace).toHaveBeenCalledExactlyOnceWith('/profile/setup')
  })
})

it('still sends an authenticated account with no saved profile to setup', () => {
  renderStartup(null, true)
  expect(harness.router.replace).toHaveBeenCalledExactlyOnceWith('/profile/setup')
})

it('allows opening setup explicitly to edit a saved profile', () => {
  harness.pathname = '/profile/setup'
  renderStartup(complete, true)
  expect(harness.router.replace).not.toHaveBeenCalled()
})
