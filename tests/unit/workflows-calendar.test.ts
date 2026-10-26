import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import type { RequestActor } from '@/lib/server/api-auth'

const memory = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>(), sequence: 0 }))
vi.mock('@/lib/server/firebase-admin', () => {
  const compare = (value: unknown): unknown => value instanceof Timestamp ? value.toMillis() : value instanceof Date ? value.getTime() : value
  class Ref {
    constructor(readonly path: string) {}
    get id() { return this.path.split('/').at(-1)! }
    async get() { return { ref: this, id: this.id, exists: memory.rows.has(this.path), data: () => memory.rows.get(this.path), get: (key: string) => memory.rows.get(this.path)?.[key] } }
    async set(value: Record<string, unknown>, options?: { merge?: boolean }) { memory.rows.set(this.path, { ...(options?.merge ? memory.rows.get(this.path) : {}), ...value }) }
    collection(name: string) { return new Query(`${this.path}/${name}`) }
  }
  class Query {
    constructor(readonly path: string, readonly filters: Array<[string, string, unknown]> = [], readonly maximum = Infinity) {}
    doc(id = `row-${++memory.sequence}`) { return new Ref(`${this.path}/${id}`) }
    where(key: string, op: string, value: unknown) { return new Query(this.path, [...this.filters, [key, op, value]], this.maximum) }
    limit(count: number) { return new Query(this.path, this.filters, count) }
    orderBy() { return this }
    async get() {
      const refs = [...memory.rows.entries()].filter(([path, data]) => path.startsWith(`${this.path}/`) && path.split('/').length === this.path.split('/').length + 1 &&
        this.filters.every(([key, op, target]) => {
          const left = compare(data[key]) as number | string
          const right = compare(target) as number | string
          if (op === 'in') return (target as unknown[]).includes(data[key])
          if (op === '==') return left === right
          if (op === '>=') return left >= right
          if (op === '<=') return left <= right
          return left < right
        })).slice(0, this.maximum).map(([path]) => new Ref(path))
      const docs = await Promise.all(refs.map((ref) => ref.get()))
      return { docs, empty: !docs.length, size: docs.length }
    }
  }
  return { adminAuth: {}, adminMessaging: {}, adminDb: {
    collection: (path: string) => new Query(path),
    runTransaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const writes: Array<() => void> = []
      const tx = {
        get: (ref: Ref | Query) => ref.get(),
        create: (ref: Ref, value: Record<string, unknown>) => writes.push(() => { if (memory.rows.has(ref.path)) throw new Error('Duplicate'); memory.rows.set(ref.path, value) }),
        set: (ref: Ref, value: Record<string, unknown>, options?: { merge?: boolean }) => writes.push(() => { void ref.set(value, options) }),
        delete: (ref: Ref) => writes.push(() => { memory.rows.delete(ref.path) }),
      }
      const result = await callback(tx)
      writes.forEach((write) => write())
      return result
    },
  } }
})

import { ensureFixedSchedule, replaceSchedules, reviewScheduleBatch, setScheduleBatchEditing, submitSchedules } from '@/lib/server/workflows'

const actor = { uid: 'employee', role: 'employee', factoryId: 'factory-1', token: {} } as RequestActor
const firstShift = '2026-11-02T12:00:00+07:00'
const rows = [{ date: firstShift, shift: 'Morning', note: '' }]
const seedOld = () => memory.rows.set('workSchedules/old', {
  employeeId: actor.uid, factoryId: 'factory-1', date: Timestamp.fromDate(new Date(firstShift)), shift: 'Morning', status: 'Pending', note: '',
  firstSubmittedAt: Timestamp.fromDate(new Date('2026-11-01T10:00:00+07:00')), createdAt: Timestamp.fromDate(new Date('2026-11-01T10:00:00+07:00')),
  editDeadlineAt: Timestamp.fromDate(new Date('2026-11-03T00:00:00+07:00')),
})
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-01T23:59:59+07:00'))
  memory.rows.clear(); memory.sequence = 0
  memory.rows.set('employees/employee', { role: 'employee', status: 'active', factoryId: 'factory-1', scheduleMode: 'rotating', hasSubmittedSchedule: true })
})
afterEach(() => vi.useRealTimers())

describe('schedule workflow calendar and penalties', () => {
  it('accepts Sunday without a penalty and charges once from exactly Monday midnight', async () => {
    const onTime = await submitSchedules(actor, { requestId: 'on-time', schedules: rows, confirmUnderMinimum: true })
    expect(onTime.penalty).toBe(0)
    expect(onTime.editDeadlineAt).toBe('2026-11-01T17:00:00.000Z')
    onTime.ids.forEach((id: string) => memory.rows.delete(`workSchedules/${id}`))
    vi.setSystemTime(new Date('2026-11-02T00:00:00+07:00'))
    const late = await submitSchedules(actor, { requestId: 'late', schedules: rows, confirmUnderMinimum: true })
    expect(late.penalty).toBe(1000)
    expect([...memory.rows.keys()].filter((key) => key.startsWith('penalties/'))).toHaveLength(1)
    await expect(submitSchedules(actor, { requestId: 'late', schedules: rows, confirmUnderMinimum: true })).rejects.toMatchObject({ status: 409 })
    expect([...memory.rows.keys()].filter((key) => key.startsWith('penalties/'))).toHaveLength(1)
  })

  it.each(['first', 'fixed'])('preserves the %s registration exemption', async (kind) => {
    vi.setSystemTime(new Date('2026-11-02T08:00:00+07:00'))
    memory.rows.set('employees/employee', { role: 'employee', status: 'active', factoryId: 'factory-1', hasSubmittedSchedule: kind !== 'first', scheduleMode: kind === 'fixed' ? 'fixed' : 'rotating' })
    expect((await submitSchedules(actor, { requestId: kind, schedules: rows, confirmUnderMinimum: true })).penalty).toBe(0)
  })

  it('locks approved schedules on Monday consistently even if an old saved deadline says Tuesday', async () => {
    seedOld()
    memory.rows.get('workSchedules/old')!.status = 'Approved'
    vi.setSystemTime(new Date('2026-11-02T08:00:00+07:00'))
    await expect(setScheduleBatchEditing(actor, { ids: ['old'], editing: true })).rejects.toMatchObject({ status: 409 })
    await expect(replaceSchedules(actor, { requestId: 'revision', scheduleIds: ['old'], schedules: rows })).rejects.toMatchObject({ status: 409 })
    expect(memory.rows.has('workSchedules/old')).toBe(true)
  })

  it.each([true, false])('honors manager waiver=%s after entering Editing, rather than bypassing late-resubmission rules', async (waived) => {
    seedOld()
    vi.setSystemTime(new Date('2026-11-02T08:00:00+07:00'))
    await reviewScheduleBatch({ ...actor, uid: 'manager', role: 'manager' }, { ids: ['old'], status: 'Rejected', note: 'Chọn lại ca', allowSundayResubmissionWithoutPenalty: waived })
    expect(memory.rows.get('workSchedules/old')?.allowSundayResubmissionWithoutPenalty).toBe(waived)
    await setScheduleBatchEditing(actor, { ids: ['old'], editing: true })
    const result = await replaceSchedules(actor, { requestId: 'revision', scheduleIds: ['old'], schedules: rows })
    expect(result.penalty).toBe(waived ? 0 : 1000)
  })

  it('rejects unopened and arbitrary fixed-schedule weeks before creating anything', async () => {
    vi.setSystemTime(new Date('2026-10-30T23:59:59+07:00'))
    await expect(ensureFixedSchedule(actor, { weekStart: '2026-11-02' })).rejects.toMatchObject({ status: 400 })
    await expect(ensureFixedSchedule(actor, { weekStart: '2030-01-07' })).rejects.toMatchObject({ status: 400 })
    expect([...memory.rows.keys()]).toEqual(['employees/employee'])
  })
})
