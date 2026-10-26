/** Firestore free quota resets at midnight in America/Los_Angeles, including DST. */
export function firestoreQuotaPeriodStart(now: Date): Date {
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const candidate = new Date(`${key}T00:00:00-08:00`)
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(candidate))
  return new Date(candidate.getTime() - hour * 60 * 60 * 1000)
}
