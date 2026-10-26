import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, Timestamp, serverTimestamp, deleteField } from 'firebase/firestore'

// This suite must never connect to the real project.
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('A local Firestore emulator is required.')
const projectId = 'demo-employee-security'
let env
const time = Timestamp.fromDate(new Date('2026-10-26T00:00:00Z'))
const employee = (uid, role = 'employee', factoryId = 'factory-1', status = 'active') => ({
  uid, role, factoryId, status, employeeCode: '123', fullName: uid, email: `${uid}@example.com`, phone: '0900000000',
  joinDate: time, createdAt: time, updatedAt: time,
})
const db = (uid, claims = {}) => env.authenticatedContext(uid, { auth_time: 200, ...claims }).firestore()

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync('firestore.rules', 'utf8') } })
  await env.withSecurityRulesDisabled(async (context) => {
    const store = context.firestore()
    await Promise.all([
      ...[
        employee('e1'), employee('e2', 'employee', 'factory-2'), employee('a1', 'admin'), employee('m1', 'manager'),
        employee('host', 'director'), employee('pending', 'employee', 'factory-1', 'pending'), employee('inactive', 'admin', 'factory-1', 'inactive'),
        { ...employee('revoked'), sessionsValidAfter: 300 },
      ].map((value) => setDoc(doc(store, 'employees', value.uid), value)),
      setDoc(doc(store, 'workSchedules/s1'), { employeeId: 'e1', factoryId: 'factory-1', date: time, status: 'Approved' }),
      setDoc(doc(store, 'workSchedules/s2'), { employeeId: 'e2', factoryId: 'factory-2', date: time, status: 'Approved' }),
      setDoc(doc(store, 'notifications/n1'), { employeeId: 'e1', title: 'Test', message: 'Test', type: 'info', isRead: false, createdAt: time, factoryId: 'factory-1', sourceType: 'schedule' }),
      setDoc(doc(store, 'auditEvents/audit1'), { subjectEmployeeId: 'e1', factoryId: 'factory-1', payload: { test: true } }),
      setDoc(doc(store, 'auditEvents/audit2'), { subjectEmployeeId: 'e2', factoryId: 'factory-2', payload: { test: true } }),
      setDoc(doc(store, 'auditEvents/legacy'), { subjectEmployeeId: 'e2', payload: { test: true } }),
      setDoc(doc(store, 'employees/e1/notificationDevices/device1234567'), { employeeId: 'e1', fid: 'device1234567' }),
    ])
  })
})
after(async () => { await env?.cleanup() })

test('public, Auth-only, pending, inactive and revoked sessions cannot read business data', async () => {
  for (const store of [env.unauthenticatedContext().firestore(), db('unknown'), db('pending'), db('inactive'), db('revoked')]) {
    await assertFails(getDocs(collection(store, 'workSchedules')))
    await assertFails(getDoc(doc(store, 'workSchedules/s1')))
  }
})

test('role claims cannot create management access; own profile stays available for onboarding', async () => {
  await assertFails(getDoc(doc(db('e1', { role: 'admin', admin: true }), 'employees/e2')))
  await assertSucceeds(getDoc(doc(db('pending'), 'employees/pending')))
  await assertSucceeds(getDoc(doc(db('e1'), 'workSchedules/s1')))
  await assertFails(getDoc(doc(db('e1'), 'workSchedules/s2')))
})

test('factory queries work for managers, cross-factory reads fail, Host can read both', async () => {
  for (const uid of ['a1', 'm1']) {
    const sameFactory = await assertSucceeds(getDocs(query(collection(db(uid), 'workSchedules'), where('factoryId', '==', 'factory-1'))))
    assert.deepEqual(sameFactory.docs.map((item) => item.id), ['s1'])
    await assertFails(getDocs(collection(db(uid), 'workSchedules')))
    await assertFails(getDoc(doc(db(uid), 'workSchedules/s2')))
  }
  await assertSucceeds(getDocs(collection(db('host'), 'workSchedules')))
  await assertSucceeds(getDoc(doc(db('host'), 'employees/e2')))
  const ownQuery = query(collection(db('e1'), 'workSchedules'), where('employeeId', '==', 'e1'), where('date', '>=', time))
  await assertSucceeds(getDocs(ownQuery))
})

test('profile updates preserve role, ownership, timestamps, required fields and schema', async () => {
  const ref = doc(db('e1'), 'employees/e1')
  await assertSucceeds(updateDoc(ref, { fullName: 'Tên mới', updatedAt: serverTimestamp() }))
  for (const values of [
    { role: 'admin' }, { factoryId: 'factory-2' }, { status: 'active', sessionsValidAfter: 0 },
    { uid: 'e2' }, { createdAt: Timestamp.now() }, { email: deleteField() }, { phone: 123 },
    { fullName: 'x'.repeat(101) }, { fullName: 'x'.repeat(100_000) }, { extraData: 'injected' },
  ]) await assertFails(updateDoc(ref, { ...values, updatedAt: serverTimestamp() }))
  await assertFails(setDoc(doc(db('unknown'), 'employees/unknown'), employee('unknown', 'admin')))
  await assertFails(updateDoc(doc(db('inactive'), 'employees/inactive'), { fullName: 'x', updatedAt: serverTimestamp() }))
})

test('notifications with server metadata can be marked read, but metadata cannot be changed', async () => {
  await assertSucceeds(updateDoc(doc(db('e1'), 'notifications/n1'), { isRead: true }))
  await assertFails(updateDoc(doc(db('e1'), 'notifications/n1'), { employeeId: 'e2' }))
  await assertFails(updateDoc(doc(db('e1'), 'notifications/n1'), { isRead: 'true' }))
  await assertFails(deleteDoc(doc(db('a1'), 'notifications/n1')))
})

test('audit payloads are confined to subject, factory management and Host', async () => {
  await assertSucceeds(getDoc(doc(db('a1'), 'auditEvents/audit1')))
  await assertFails(getDoc(doc(db('a1'), 'auditEvents/audit2')))
  await assertFails(getDoc(doc(db('a1'), 'auditEvents/legacy')))
  await assertSucceeds(getDoc(doc(db('e2'), 'auditEvents/legacy')))
  await assertSucceeds(getDoc(doc(db('host'), 'auditEvents/legacy')))
})

test('device creation and updates require backend; orphaned subcollections are denied', async () => {
  for (const uid of ['e1', 'unknown', 'pending', 'inactive']) {
    await assertFails(setDoc(doc(db(uid), `employees/${uid}/notificationDevices/newdevice123`), {
      employeeId: uid, fid: 'newdevice123', platform: 'test', permission: 'granted', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastSeenAt: serverTimestamp(),
    }))
  }
  await assertFails(updateDoc(doc(db('e1'), 'employees/e1/notificationDevices/device1234567'), { platform: 'x'.repeat(100_000) }))
  await assertFails(getDoc(doc(db('e2'), 'employees/e1/notificationDevices/device1234567')))
  await assertSucceeds(getDoc(doc(db('e1'), 'employees/e1/notificationDevices/device1234567')))
  await assertSucceeds(deleteDoc(doc(db('e1'), 'employees/e1/notificationDevices/device1234567')))
})

test('company-rule create and update enforce the same schema and role', async () => {
  const rule = { title: 'Nội quy', content: 'Nội dung', order: 1, isActive: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
  await assertFails(setDoc(doc(db('e1'), 'companyRules/x'), rule))
  const ref = doc(db('a1'), 'companyRules/x')
  await assertSucceeds(setDoc(ref, rule))
  await assertFails(updateDoc(ref, { title: 'x'.repeat(151), updatedAt: serverTimestamp() }))
  await assertFails(updateDoc(ref, { content: deleteField(), updatedAt: serverTimestamp() }))
  await assertSucceeds(updateDoc(ref, { title: 'Nội quy mới', updatedAt: serverTimestamp() }))
})

test('business and security bookkeeping writes remain server-only for every role', async () => {
  for (const uid of ['e1', 'a1', 'host']) {
    for (const path of ['workSchedules/new', 'penalties/new', 'workflowRequests/new', 'securityBudgets/new', 'systemJobLocks/new']) {
      await assertFails(setDoc(doc(db(uid), path), { employeeId: uid }))
    }
  }
  assert.equal(projectId.startsWith('demo-'), true)
})
