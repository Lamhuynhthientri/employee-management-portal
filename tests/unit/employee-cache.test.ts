import { afterEach, describe, expect, it, vi } from 'vitest'
import { employeeShell, getCachedEmployee, clearAccountCaches } from '@/lib/cache/employee-cache'
import type { Employee } from '@/lib/models/types'

const employee: Employee = {
  uid: 'e1', employeeCode: '1', fullName: 'Tên', photoURL: 'https://example.com/avatar',
  role: 'employee', status: 'active', factoryId: 'factory-1', phone: 'private-phone', email: 'private@example.com',
  bankName: 'private-bank', bankAccountNumber: '12345678', bankAccountName: 'private-name', facebookUrl: 'https://example.com/private',
  joinDate: new Date(), createdAt: new Date(), updatedAt: new Date(),
}
afterEach(() => vi.unstubAllGlobals())

describe('minimal startup profile cache', () => {
  it('retains the avatar shell and removes contact/bank fields', () => {
    const shell = employeeShell(employee)
    expect(shell.photoURL).toBe(employee.photoURL)
    expect(shell.phone).toBe('')
    expect(shell.email).toBe('')
    expect(shell.bankAccountNumber).toBeUndefined()
    expect(shell.facebookUrl).toBeUndefined()
  })
  it('sanitizes legacy cached profiles and clears account data on sign-out', () => {
    const values = new Map([['tricandy:employee-cache:e1', JSON.stringify(employee)], ['tricandy:management-contact:e1', 'contact'], ['theme', 'dark']])
    const localStorage = {
      get length() { return values.size }, key: (index: number) => [...values.keys()][index],
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key),
    }
    vi.stubGlobal('window', { localStorage, sessionStorage: { removeItem: vi.fn() } })
    expect(getCachedEmployee('e1')?.bankAccountNumber).toBeUndefined()
    expect(values.get('tricandy:employee-cache:e1')).not.toContain('private-phone')
    clearAccountCaches()
    expect([...values.keys()]).toEqual(['theme'])
  })
})
