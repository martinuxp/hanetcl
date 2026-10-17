// Tests de reglas. Cada base se prueba como un proyecto aparte del emulador
// para cargar sus propias reglas.
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { after, before, describe, test } from 'node:test'

const rules = (name) => readFileSync(new URL(`../${name}.rules`, import.meta.url), 'utf8')

async function env(name) {
  return initializeTestEnvironment({
    projectId: `demo-${name}`,
    firestore: { rules: rules(name), host: '127.0.0.1', port: 8080 },
  })
}

const admin = { role: 'admin' }
const docente2k = { role: 'docente', courses: ['2k'] }

describe('hn-enrollmentdata', () => {
  let t
  before(async () => {
    t = await env('hn-enrollmentdata')
    await t.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'LCH-enroll-hn/111'), { fullName: 'Ana', courseId: '2k' })
      await setDoc(doc(db, 'LCH-enroll-hn/222'), { fullName: 'Beto', courseId: '2k', linkedUid: 'other' })
      await setDoc(doc(db, 'identityLinkRequests/r1'), { firebaseUid: 'u1', status: 'pending' })
    })
  })
  after(() => t.cleanup())

  test('el registro sigue funcionando: leer RUT sin sesión y reclamar uno libre', async () => {
    await assertSucceeds(getDoc(doc(t.unauthenticatedContext().firestore(), 'LCH-enroll-hn/111')))
    const db = t.authenticatedContext('u1').firestore()
    await assertSucceeds(setDoc(doc(db, 'users/u1'), { email: 'a@a.cl', rut: '111', courseId: '2k', name: 'Ana' }))
    await assertSucceeds(setDoc(doc(db, 'LCH-enroll-hn/111'), { linkedUid: 'u1' }, { merge: true }))
  })

  test('no se puede robar un RUT ya vinculado ni vincularlo a otro uid', async () => {
    const db = t.authenticatedContext('u3').firestore()
    await assertFails(setDoc(doc(db, 'LCH-enroll-hn/222'), { linkedUid: 'u3' }, { merge: true }))
    await assertFails(updateDoc(doc(db, 'LCH-enroll-hn/222'), { courseId: '4a' }))
  })

  test('nadie sin rol lista la matrícula; un admin sí', async () => {
    await assertFails(getDocs(collection(t.authenticatedContext('u1').firestore(), 'LCH-enroll-hn')))
    await assertSucceeds(getDocs(collection(t.authenticatedContext('a1', admin).firestore(), 'LCH-enroll-hn')))
  })

  test('un usuario no puede darse rol en su perfil', async () => {
    const db = t.authenticatedContext('u5').firestore()
    await assertFails(setDoc(doc(db, 'users/u5'), { email: 'x@x.cl', role: 'admin' }))
    await assertFails(getDoc(doc(db, 'users/u1')))
  })

  test('solicitudes de vínculo: solo admin lee, nadie escribe', async () => {
    await assertFails(getDoc(doc(t.authenticatedContext('u1').firestore(), 'identityLinkRequests/r1')))
    const adminDb = t.authenticatedContext('a1', admin).firestore()
    await assertSucceeds(getDoc(doc(adminDb, 'identityLinkRequests/r1')))
    await assertFails(setDoc(doc(adminDb, 'identityLinkRequests/r2'), { status: 'verified' }))
  })
})

describe('hn-calendar', () => {
  let t
  before(async () => {
    t = await env('hn-calendar')
    await t.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'HNC-LCH.2k/e1'), { title: 'Prueba', authorUid: 'u1' })
    })
  })
  after(() => t.cleanup())

  test('estudiante crea y edita su evento, sin poder autoverificarse', async () => {
    const db = t.authenticatedContext('u1').firestore()
    await assertSucceeds(setDoc(doc(db, 'HNC-LCH.2k/e2'), { title: 'Taller', authorUid: 'u1' }))
    await assertFails(setDoc(doc(db, 'HNC-LCH.2k/e3'), { title: 'x', authorUid: 'u1', verified: true }))
    await assertFails(setDoc(doc(db, 'HNC-LCH.2k/e4'), { title: 'x', authorUid: 'otro' }))
    await assertSucceeds(updateDoc(doc(db, 'HNC-LCH.2k/e1'), { title: 'Prueba 2' }))
    await assertFails(updateDoc(doc(db, 'HNC-LCH.2k/e1'), { verified: true }))
  })

  test('otro estudiante no edita ni borra eventos ajenos', async () => {
    const db = t.authenticatedContext('u2').firestore()
    await assertFails(updateDoc(doc(db, 'HNC-LCH.2k/e1'), { title: 'hack' }))
    await assertFails(deleteDoc(doc(db, 'HNC-LCH.2k/e1')))
  })

  test('docente verifica solo en sus cursos', async () => {
    const db = t.authenticatedContext('d1', docente2k).firestore()
    await assertSucceeds(updateDoc(doc(db, 'HNC-LCH.2k/e1'), { verified: true, verifiedBy: 'd1' }))
    await t.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'HNC-LCH.3a/e9'), { title: 'Otro curso', authorUid: 'u9' })
    })
    await assertFails(updateDoc(doc(db, 'HNC-LCH.3a/e9'), { verified: true }))
  })

  test('sin sesión no se lee; colecciones ajenas al calendario están cerradas', async () => {
    await assertFails(getDoc(doc(t.unauthenticatedContext().firestore(), 'HNC-LCH.2k/e1')))
    await assertFails(setDoc(doc(t.authenticatedContext('a1', admin).firestore(), 'otra/x'), { a: 1 }))
  })
})

describe('hn-events', () => {
  let t
  before(async () => { t = await env('hn-events') })
  after(() => t.cleanup())

  test('lectura pública, escritura solo admin', async () => {
    await assertSucceeds(getDocs(collection(t.unauthenticatedContext().firestore(), 'regionalEvents')))
    await assertFails(setDoc(doc(t.authenticatedContext('u1').firestore(), 'regionalEvents/x'), { a: 1 }))
    await assertSucceeds(setDoc(doc(t.authenticatedContext('a1', admin).firestore(), 'regionalEvents/x'), { a: 1 }))
  })
})
