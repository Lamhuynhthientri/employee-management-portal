import { callWorkflowApi } from '@/lib/services/workflowApi'
import type { UserFeatureKey, UserFeatureSettings } from '@/lib/models/userFeatureSettings'
import { auth } from '@/lib/firebase'
import type { FactoryId } from '@/lib/models/factory'

export interface ManagementContact {
  uid: string
  fullName: string
  photoURL: string
  facebookUrl: string
}

interface CachedManagementContact {
  ownerUid: string
  cachedAt: number
  value: ManagementContact
}

const MANAGEMENT_CONTACT_CACHE_PREFIX = 'tricandy:management-contact:'
const MANAGEMENT_CONTACT_CACHE_TTL_MS = 12 * 60 * 60_000
const managementContactMemoryCache = new Map<string, CachedManagementContact>()
let managementContactRequest: { uid: string; promise: Promise<ManagementContact> } | null = null

function cloneManagementContact(value: ManagementContact): ManagementContact {
  return { ...value }
}

function validManagementContact(value: unknown): value is ManagementContact {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const contact = value as Record<string, unknown>
  return ['uid', 'fullName', 'photoURL', 'facebookUrl'].every((key) => typeof contact[key] === 'string')
}

function readManagementContactCache(uid: string): CachedManagementContact | null {
  const inMemory = managementContactMemoryCache.get(uid)
  if (inMemory) return inMemory
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(`${MANAGEMENT_CONTACT_CACHE_PREFIX}${uid}`)
    if (!raw) return null
    const cached = JSON.parse(raw) as CachedManagementContact
    if (cached.ownerUid !== uid || !Number.isFinite(cached.cachedAt) || !validManagementContact(cached.value)) return null
    managementContactMemoryCache.set(uid, cached)
    return cached
  } catch {
    return null
  }
}

function writeManagementContactCache(uid: string, value: ManagementContact): void {
  const cached: CachedManagementContact = {
    ownerUid: uid,
    cachedAt: Date.now(),
    value: cloneManagementContact(value),
  }
  managementContactMemoryCache.set(uid, cached)
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${MANAGEMENT_CONTACT_CACHE_PREFIX}${uid}`, JSON.stringify(cached))
  } catch {
    // Cache failure must never prevent the authoritative API response from rendering.
  }
}

export interface WeeklyScheduleTarget {
  weekStart: string
  expectedEmployees: number
}

export function getWeeklyScheduleTarget(weekStart: string, factoryId?: FactoryId): Promise<WeeklyScheduleTarget> {
  return callWorkflowApi('getWeeklyScheduleTarget', { weekStart, factoryId })
}

export function updateWeeklyScheduleTarget(
  weekStart: string,
  expectedEmployees: number,
  factoryId?: FactoryId,
): Promise<WeeklyScheduleTarget> {
  return callWorkflowApi('updateWeeklyScheduleTarget', { weekStart, expectedEmployees, factoryId })
}

/** Returns the last known safe contact projection, even when it is older than the refresh TTL. */
export function getCachedManagementContact(uid = auth.currentUser?.uid || ''): ManagementContact | null {
  if (!uid) return null
  const cached = readManagementContactCache(uid)
  return cached ? cloneManagementContact(cached.value) : null
}

/**
 * Keeps the cached avatar fast while limiting the API/Firestore refresh to one
 * request per user at a time and, normally, no more than once every twelve hours.
 */
export function getManagementContact(options: { force?: boolean } = {}): Promise<ManagementContact> {
  const uid = auth.currentUser?.uid || ''
  const cached = uid ? readManagementContactCache(uid) : null
  if (!options.force && cached && Date.now() - cached.cachedAt < MANAGEMENT_CONTACT_CACHE_TTL_MS) {
    return Promise.resolve(cloneManagementContact(cached.value))
  }
  if (managementContactRequest?.uid === uid) {
    return managementContactRequest.promise.then(cloneManagementContact)
  }

  const request = callWorkflowApi<ManagementContact>('getManagementContact', {}).then((contact) => {
    if (uid) writeManagementContactCache(uid, contact)
    return cloneManagementContact(contact)
  })
  managementContactRequest = { uid, promise: request }
  request.then(
    () => { if (managementContactRequest?.promise === request) managementContactRequest = null },
    () => { if (managementContactRequest?.promise === request) managementContactRequest = null },
  )
  return request.then(cloneManagementContact)
}

export interface AuditReceiptSettings {
  emailEnabled: boolean
  auditTrailEnabled: boolean
  emailEnvironmentEnabled: boolean
  emailConfigured: boolean
  cancelledQueuedEmails?: number
}

export function getAuditReceiptSettings(): Promise<AuditReceiptSettings> {
  return callWorkflowApi('getAuditReceiptSettings', {})
}

export function updateAuditReceiptSettings(emailEnabled: boolean): Promise<AuditReceiptSettings> {
  return callWorkflowApi('updateAuditReceiptSettings', { emailEnabled })
}

export interface AccountRegistrationWindow {
  isOpen: boolean
  closesAt: string | null
}

export interface SalaryAdvancePolicy {
  restrictionEnabled: boolean
  canSubmit: boolean
  vietnamDay: number
  allowedDays: readonly [24, 25]
}

export function getSalaryAdvancePolicy(): Promise<SalaryAdvancePolicy> {
  return callWorkflowApi('getSalaryAdvancePolicy', {})
}

export function updateSalaryAdvancePolicy(restrictionEnabled: boolean): Promise<SalaryAdvancePolicy> {
  return callWorkflowApi('updateSalaryAdvancePolicy', { restrictionEnabled })
}

const USER_FEATURE_CACHE_TTL_MS = 60_000
let userFeatureSettingsCache: { value: UserFeatureSettings; cachedAt: number } | null = null
let userFeatureSettingsRequest: { uid: string; promise: Promise<UserFeatureSettings> } | null = null

const cloneUserFeatureSettings = (value: UserFeatureSettings): UserFeatureSettings => ({ ...value })

/**
 * Returns the last known settings without waiting for the network for callers
 * that explicitly opt into a cached value.
 */
export function getCachedUserFeatureSettings(): UserFeatureSettings | null {
  return userFeatureSettingsCache ? cloneUserFeatureSettings(userFeatureSettingsCache.value) : null
}

export function getAccountRegistrationWindow(): Promise<AccountRegistrationWindow> {
  return callWorkflowApi('getAccountRegistrationWindow', {})
}

export function updateAccountRegistrationWindow(open: boolean): Promise<AccountRegistrationWindow> {
  return callWorkflowApi('updateAccountRegistrationWindow', { open })
}

export function getUserFeatureSettings(options: { force?: boolean } = {}): Promise<UserFeatureSettings> {
  if (!options.force && userFeatureSettingsCache && Date.now() - userFeatureSettingsCache.cachedAt < USER_FEATURE_CACHE_TTL_MS) {
    return Promise.resolve(cloneUserFeatureSettings(userFeatureSettingsCache.value))
  }
  const uid = auth.currentUser?.uid || ''
  if (userFeatureSettingsRequest?.uid === uid) {
    return userFeatureSettingsRequest.promise.then(cloneUserFeatureSettings)
  }

  const request = callWorkflowApi<UserFeatureSettings>('getUserFeatureSettings', {}).then((settings) => {
    userFeatureSettingsCache = { value: cloneUserFeatureSettings(settings), cachedAt: Date.now() }
    return cloneUserFeatureSettings(settings)
  })
  userFeatureSettingsRequest = { uid, promise: request }
  request.then(
    () => { if (userFeatureSettingsRequest?.promise === request) userFeatureSettingsRequest = null },
    () => { if (userFeatureSettingsRequest?.promise === request) userFeatureSettingsRequest = null },
  )
  return request.then(cloneUserFeatureSettings)
}

export function updateUserFeatureSetting(key: UserFeatureKey, enabled: boolean): Promise<UserFeatureSettings> {
  return callWorkflowApi<UserFeatureSettings>('updateUserFeatureSetting', { key, enabled }).then((settings) => {
    userFeatureSettingsCache = { value: cloneUserFeatureSettings(settings), cachedAt: Date.now() }
    return cloneUserFeatureSettings(settings)
  })
}
