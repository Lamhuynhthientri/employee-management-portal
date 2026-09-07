import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/server/firebase-admin'
import { isFactoryId, type FactoryId } from '@/lib/models/factory'

export interface ManagementContactRecord {
  uid: string
  fullName: string
  photoURL: string
  facebookUrl: string
}

function safeContact(data: FirebaseFirestore.DocumentData | undefined): ManagementContactRecord | null {
  if (!data || typeof data.uid !== 'string' || typeof data.fullName !== 'string' ||
      typeof data.photoURL !== 'string' || typeof data.facebookUrl !== 'string') return null
  return {
    uid: data.uid,
    fullName: data.fullName || 'Quản lý',
    photoURL: data.photoURL,
    facebookUrl: data.facebookUrl,
  }
}

export async function syncManagementContact(factoryId: FactoryId): Promise<ManagementContactRecord> {
  const snapshot = await adminDb.collection('employees').where('role', 'in', ['manager', 'admin']).get()
  const candidates = snapshot.docs
    .map((document): Record<string, unknown> & { uid: string } => ({
      ...(document.data() as Record<string, unknown>),
      uid: document.id,
    }))
    .filter((employee) => (isFactoryId(employee.factoryId) ? employee.factoryId : 'factory-1') === factoryId)
    .sort((left, right) => {
      const activeDifference = Number(right.status === 'active') - Number(left.status === 'active')
      if (activeDifference) return activeDifference
      const roleDifference = Number(right.role === 'manager') - Number(left.role === 'manager')
      if (roleDifference) return roleDifference
      return String(left.fullName || '').localeCompare(String(right.fullName || ''), 'vi')
    })
  const selected = candidates[0]
  const contact: ManagementContactRecord = {
    uid: selected?.uid || '',
    fullName: typeof selected?.fullName === 'string' && selected.fullName.trim() ? selected.fullName.trim() : 'Quản lý',
    photoURL: typeof selected?.photoURL === 'string' ? selected.photoURL.trim() : '',
    facebookUrl: typeof selected?.facebookUrl === 'string' ? selected.facebookUrl.trim() : '',
  }
  await adminDb.collection('managementContacts').doc(factoryId).set({
    factoryId,
    ...contact,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return contact
}

export async function getManagementContactForFactory(factoryId: FactoryId): Promise<ManagementContactRecord> {
  const snapshot = await adminDb.collection('managementContacts').doc(factoryId).get()
  return safeContact(snapshot.data()) || syncManagementContact(factoryId)
}

export async function syncManagementContactForProfile(data: FirebaseFirestore.DocumentData | undefined): Promise<void> {
  if (!data || !['manager', 'admin'].includes(String(data.role))) return
  const factoryId: FactoryId = isFactoryId(data.factoryId) ? data.factoryId : 'factory-1'
  await syncManagementContact(factoryId)
}
