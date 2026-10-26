import { cert, initializeApp } from 'firebase-admin/app'
import { FieldPath, getFirestore } from 'firebase-admin/firestore'

// Add only missing factory metadata. Dry-run is the default; no deletes,
// role/status changes, deadlines, or financial values are written here.
const EXPECTED_PROJECT = 'employee-management-port-339fe'
const MAX_READS = 5000
const apply = process.argv.includes('--apply')
if (process.env.FIREBASE_ADMIN_PROJECT_ID !== EXPECTED_PROJECT) throw new Error('Unexpected project; migration stopped.')
if (process.env.FIRESTORE_EMULATOR_HOST && !process.argv.includes('--emulator')) throw new Error('Unexpected emulator configuration.')
const app = initializeApp({ credential: cert({
  projectId: EXPECTED_PROJECT,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
}) })
const db = getFirestore(app)
const validFactory = (value) => value === 'factory-1' || value === 'factory-2'
let reads = 0
const pending = []
const counts = {}
const orphaned = {}

async function readCollection(name, fields) {
  const docs = []
  let cursor
  while (true) {
    const remaining = MAX_READS - reads
    if (remaining <= 0) throw new Error('Migration read budget reached; no writes have been made. Review the data before continuing.')
    let query = db.collection(name).orderBy(FieldPath.documentId()).select(...fields).limit(Math.min(250, remaining))
    if (cursor) query = query.startAfter(cursor)
    const page = await query.get()
    reads += Math.max(1, page.size)
    docs.push(...page.docs)
    if (page.size < Math.min(250, remaining)) break
    cursor = page.docs.at(-1)
  }
  return docs
}

const profiles = await readCollection('employees', ['factoryId'])
const factories = new Map()
for (const profile of profiles) {
  const value = profile.get('factoryId')
  if (value != null && value !== '' && !validFactory(value)) throw new Error('Unexpected employee factory metadata; manual review required.')
  const factoryId = validFactory(value) ? value : 'factory-1'
  factories.set(profile.id, factoryId)
  if (!validFactory(value)) pending.push({ snapshot: profile, factoryId, collection: 'employees' })
}

for (const name of ['workSchedules', 'leaveRequests', 'lateRequests', 'salaryAdvances', 'staffRequests', 'penalties']) {
  for (const snapshot of await readCollection(name, ['factoryId', 'employeeId'])) {
    const existing = snapshot.get('factoryId')
    if (validFactory(existing)) continue
    if (existing != null && existing !== '') throw new Error(`Unexpected ${name} factory metadata; manual review required.`)
    const factoryId = factories.get(snapshot.get('employeeId'))
    if (!factoryId) { orphaned[name] = (orphaned[name] || 0) + 1; continue }
    pending.push({ snapshot, factoryId, collection: name })
  }
}
pending.forEach((row) => { counts[row.collection] = (counts[row.collection] || 0) + 1 })

if (apply) {
  for (let offset = 0; offset < pending.length; offset += 100) {
    const batch = db.batch()
    for (const { snapshot, factoryId } of pending.slice(offset, offset + 100)) {
      // Fail rather than overwriting a record changed since this scan.
      batch.update(snapshot.ref, { factoryId }, { lastUpdateTime: snapshot.updateTime })
    }
    await batch.commit()
  }
}
console.log(JSON.stringify({ project: EXPECTED_PROJECT, mode: apply ? 'apply' : 'dry-run', estimatedDocumentReads: reads,
  recordsNeedingFactoryId: pending.length, counts, orphanedUnchanged: orphaned, written: apply ? pending.length : 0 }, null, 2))
await db.terminate()
