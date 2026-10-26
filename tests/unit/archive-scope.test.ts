import { describe, expect, it } from 'vitest'
import { scopeArchivePayload } from '@/lib/server/archive-scope'
import type { RequestActor } from '@/lib/server/api-auth'

const actor = (role: RequestActor['role'], factoryId = 'factory-1'): RequestActor => ({ uid: role, role, factoryId } as RequestActor)
const records = {
  employeeProfiles: [{ id: 'e1', data: { factoryId: 'factory-1' } }, { id: 'e2', data: { factoryId: 'factory-2' } }],
  penalties: [{ id: 'p1', data: { factoryId: 'factory-1', employeeId: 'e1' } }, { id: 'p2', data: { factoryId: 'factory-2', employeeId: 'e2' } }],
}
describe('archive factory scope', () => {
  it('keeps Host factory-2 view separate from its default factory-1 profile', () => {
    expect(scopeArchivePayload(actor('director'), { records }, 'factory-2').records.penalties.map((row) => row.id)).toEqual(['p2'])
    expect(scopeArchivePayload(actor('director', 'factory-2'), { records }, 'factory-1').records.penalties.map((row) => row.id)).toEqual(['p1'])
  })
  it('keeps management in its own branch even when another factory is requested', () => {
    expect(scopeArchivePayload(actor('admin'), { records }, 'factory-2').records.penalties.map((row) => row.id)).toEqual(['p1'])
    expect(scopeArchivePayload(actor('director'), { records }).records.penalties).toHaveLength(2)
  })
})
