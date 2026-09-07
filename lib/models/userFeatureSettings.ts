export const userFeatureKeys = [
  'schedule',
  'lateArrival',
  'leave',
  'salaryAdvance',
  'penalties',
  'shiftChanges',
  'companyRules',
] as const

export type UserFeatureKey = (typeof userFeatureKeys)[number]

export type UserFeatureSettings = Record<UserFeatureKey, boolean>

export const defaultUserFeatureSettings: UserFeatureSettings = {
  schedule: true,
  // Intentionally disabled for the current handover. Re-enable only by
  // explicitly adding the corresponding flow back to the home feature list.
  lateArrival: false,
  leave: false,
  salaryAdvance: true,
  penalties: true,
  shiftChanges: true,
  companyRules: true,
}
