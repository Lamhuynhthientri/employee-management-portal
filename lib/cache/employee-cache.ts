import type { Employee } from '@/lib/models/types'

const PREFIX = 'tricandy:employee-cache:'
const CONTACT_PREFIX = 'tricandy:management-contact:'

/** Only the startup shell is persisted. Contact and bank data stay in memory. */
export function employeeShell(employee: Employee): Employee {
  return {
    uid: employee.uid, employeeCode: employee.employeeCode, fullName: employee.fullName,
    photoURL: employee.photoURL, role: employee.role, status: employee.status,
    factoryId: employee.factoryId, email: '', phone: '',
    joinDate: employee.joinDate, createdAt: employee.createdAt, updatedAt: employee.updatedAt,
    scheduleMode: employee.scheduleMode, scheduleModeEffectiveWeekStart: employee.scheduleModeEffectiveWeekStart,
    fixedScheduleNeedsSetupWeekStart: employee.fixedScheduleNeedsSetupWeekStart,
    fixedScheduleTemplateWeekStart: employee.fixedScheduleTemplateWeekStart,
    hasSubmittedSchedule: employee.hasSubmittedSchedule,
    reactivationScheduleWaiverWeekStart: employee.reactivationScheduleWaiverWeekStart,
  }
}

function dateIso(value: Employee['joinDate']): string {
  return value instanceof Date ? value.toISOString() : value.toDate().toISOString()
}

export function cacheEmployee(uid: string, employee: Employee | null): void {
  if (typeof window === 'undefined') return
  try {
    const key = `${PREFIX}${uid}`
    if (!employee) { window.localStorage.removeItem(key); return }
    const shell = employeeShell(employee)
    window.localStorage.setItem(key, JSON.stringify({
      ...shell, joinDate: dateIso(shell.joinDate), createdAt: dateIso(shell.createdAt), updatedAt: dateIso(shell.updatedAt),
    }))
  } catch { /* Storage is an optional startup optimization. */ }
}

export function getCachedEmployee(uid: string): Employee | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${uid}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Employee
    if (!parsed || parsed.uid !== uid || typeof parsed.fullName !== 'string') return null
    const value = employeeShell({
      ...parsed, joinDate: new Date(String(parsed.joinDate)), createdAt: new Date(String(parsed.createdAt)), updatedAt: new Date(String(parsed.updatedAt)),
    })
    // Rewrites old full-profile caches without returning their private fields.
    cacheEmployee(uid, value)
    return value
  } catch { return null }
}

export function clearAccountCaches(): void {
  if (typeof window === 'undefined') return
  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
    for (const key of keys) if (key?.startsWith(PREFIX) || key?.startsWith(CONTACT_PREFIX)) window.localStorage.removeItem(key)
    window.sessionStorage.removeItem('schedule-draft')
  } catch { /* Sign-out must still work when browser storage is blocked. */ }
}
