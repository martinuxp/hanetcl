const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { notifyHall, hallStudentUids } = require("./classhall-notify");

// Notas (module "grades", decided 2026-11-05): the teacher of a Hall, the
// Admin of its institution or HNT put grades on an evaluation the Hall
// already has, from the app or the panel. They stay a draft until they are
// published; then each student gets a push that never shows the grade and
// finds it covered in the Hall, to scratch it off. The liceo's libro de
// clases is still the official record: this does not replace it.
//
// hn-classhall halls/{hallId}/evaluations/{evaluationId}/grades/{uid}
//   grade 1.0–7.0 (one decimal), status "draft" | "published",
//   updatedAt, updatedBy, publishedAt, seenAt, corrected
// The evaluation keeps weight (%, optional), gradesCount and gradesPublishedAt.
// gradeUnseen/{uid}.halls.{hallId} lists the evaluations a student has not
// uncovered yet, so ClassHall can mark the Hall in one read.
//
// The module is per institution (institutions/{id}.modules, "grades"). An
// institution without that list keeps it on, like the other modules.

const MODULE = "grades";
const MAX_GRADES_PER_CALL = 200;
const MIN_GRADE = 1;
const MAX_GRADE = 7;

function classhallDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-classhall");
}

function identityDb(getAdminApp) {
  return getFirestore(getAdminApp(), "hn-enrollmentdata");
}

function millis(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : null;
}

function childId(value) {
  return typeof value === "string" && value && value.length <= 128 && !value.includes("/") ? value : null;
}

/** A grade from 1,0 to 7,0 with at most one decimal, or undefined if it is not one. */
function cleanGrade(value) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < MIN_GRADE || number > MAX_GRADE) return undefined;
  const tenths = number * 10;
  if (Math.abs(tenths - Math.round(tenths)) > 1e-6) return undefined;
  return Math.round(tenths) / 10;
}

function gradesOn(institution) {
  return !Array.isArray(institution?.modules) || institution.modules.includes(MODULE);
}

async function requireProfile(getAdminApp, request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const profile = (await identityDb(getAdminApp).collection("users").doc(request.auth.uid).get()).data();
  if (!profile || !profile.institutionId) {
    throw new HttpsError("failed-precondition", "Primero vincula tu HaNet ID con tu institución.");
  }
  return { uid: request.auth.uid, ...profile };
}

async function requireModule(getAdminApp, institutionId) {
  const institution = (await identityDb(getAdminApp).collection("institutions").doc(institutionId).get()).data();
  if (!institution) throw new HttpsError("failed-precondition", "No encontramos la institución.");
  if (!gradesOn(institution)) throw new HttpsError("failed-precondition", "Notas no está activo en tu institución.");
  return institution;
}

// The Hall and the evaluation, for whoever may put its grades: its teacher,
// the Admin of the Hall's institution, or HNT.
async function openForStaff(getAdminApp, request) {
  const profile = await requireProfile(getAdminApp, request);
  const hallId = childId(request.data?.hallId);
  const evaluationId = childId(request.data?.evaluationId);
  if (!hallId || !evaluationId) throw new HttpsError("invalid-argument", "Falta la evaluación.");
  const hallRef = classhallDb(getAdminApp).collection("halls").doc(hallId);
  const hall = (await hallRef.get()).data();
  const allowed = hall && (
    hall.teacherUid === profile.uid
    || profile.role === "HNT"
    || (profile.role === "Admin" && hall.institutionId === profile.institutionId)
  );
  if (!allowed) throw new HttpsError("not-found", "No encontramos ese Hall entre tus clases.");
  await requireModule(getAdminApp, hall.institutionId);
  const evaluationRef = hallRef.collection("evaluations").doc(evaluationId);
  const evaluation = (await evaluationRef.get()).data();
  if (!evaluation) throw new HttpsError("not-found", "Esa evaluación ya no existe.");
  return { profile, hallRef, hall, evaluationRef, evaluation };
}

// The Hall's students with an account, by surname as in the libro de clases.
async function hallStudents(getAdminApp, hall) {
  const db = identityDb(getAdminApp);
  const uids = await hallStudentUids(getAdminApp, hall);
  if (!uids.length) return [];
  const users = await db.getAll(...uids.map(uid => db.collection("users").doc(uid)));
  const withRut = users.filter(doc => doc.exists && doc.data().rut);
  const rosterRows = withRut.length
    ? await db.getAll(...withRut.map(doc => db.collection("institutions").doc(doc.data().institutionId || hall.institutionId).collection("roster").doc(String(doc.data().rut))))
    : [];
  const rosterByUid = new Map(withRut.map((doc, index) => [doc.id, rosterRows[index]?.data()]));
  return users.filter(doc => doc.exists).map((doc) => {
    const data = doc.data();
    const row = rosterByUid.get(doc.id);
    const name = row?.apellidos && row?.nombres ? `${row.apellidos}, ${row.nombres}` : String(data.name || "Estudiante");
    return { uid: doc.id, name, courseId: data.courseId || null };
  }).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

async function rosterSize(getAdminApp, hall) {
  if ((hall.plan || "comun") !== "comun") return null;
  const count = await identityDb(getAdminApp)
    .collection("institutions").doc(hall.institutionId)
    .collection("roster").where("curso", "==", hall.courseId).count().get();
  return count.data().count;
}

function unseenRef(getAdminApp, uid) {
  return classhallDb(getAdminApp).collection("gradeUnseen").doc(uid);
}

// Adds or takes evaluations off the students' "not uncovered yet" lists.
async function markUnseen(getAdminApp, hallId, evaluationId, uids, unseen) {
  const db = classhallDb(getAdminApp);
  for (let start = 0; start < uids.length; start += 400) {
    const batch = db.batch();
    for (const uid of uids.slice(start, start + 400)) {
      batch.set(unseenRef(getAdminApp, uid), {
        halls: { [hallId]: unseen ? FieldValue.arrayUnion(evaluationId) : FieldValue.arrayRemove(evaluationId) },
      }, { merge: true });
    }
    await batch.commit();
  }
}

async function countGrades(evaluationRef) {
  return (await evaluationRef.collection("grades").count().get()).data().count;
}

function build(getAdminApp) {
  // The evaluation's grades for whoever puts them: every student of the Hall
  // with an account, with their grade if there is one.
  const getEvaluationGrades = onCall({ invoker: "public" }, async (request) => {
    const { hall, evaluationRef, evaluation } = await openForStaff(getAdminApp, request);
    const [students, grades, roster] = await Promise.all([
      hallStudents(getAdminApp, hall),
      evaluationRef.collection("grades").get(),
      rosterSize(getAdminApp, hall),
    ]);
    const byUid = new Map(grades.docs.map(doc => [doc.id, doc.data()]));
    return {
      evaluation: {
        id: evaluationRef.id,
        title: evaluation.title,
        date: millis(evaluation.date),
        weight: evaluation.weight ?? null,
        published: !!evaluation.gradesPublishedAt,
        publishedAt: millis(evaluation.gradesPublishedAt),
      },
      students: students.map((student) => {
        const grade = byUid.get(student.uid);
        return {
          ...student,
          grade: grade ? grade.grade : null,
          status: grade ? grade.status : null,
          seen: !!grade?.seenAt,
        };
      }),
      withoutAccount: roster === null ? 0 : Math.max(0, roster - students.length),
    };
  });

  // Saves grades in bulk (the panel pastes a whole column; the app sends
  // one or many). null takes a grade away. Before publishing they are drafts;
  // once the evaluation is published, a new or changed grade is published at
  // once and its student hears about it.
  const saveEvaluationGrades = onCall({ invoker: "public" }, async (request) => {
    const { profile, hallRef, hall, evaluationRef, evaluation } = await openForStaff(getAdminApp, request);
    const input = Array.isArray(request.data?.grades) ? request.data.grades : [];
    if (input.length > MAX_GRADES_PER_CALL) {
      throw new HttpsError("invalid-argument", `Se guardan hasta ${MAX_GRADES_PER_CALL} notas por vez.`);
    }

    const updates = {};
    if (request.data && "weight" in request.data) {
      const raw = request.data.weight;
      const weight = raw === null || raw === "" ? null : Math.round(Number(raw));
      if (weight !== null && (!Number.isFinite(weight) || weight < 1 || weight > 100)) {
        throw new HttpsError("invalid-argument", "La ponderación va de 1 a 100 %.");
      }
      updates.weight = weight;
    }

    const students = new Set(await hallStudentUids(getAdminApp, hall));
    const wanted = new Map();
    for (const item of input) {
      const uid = childId(item?.uid);
      if (!uid || !students.has(uid)) throw new HttpsError("invalid-argument", "Una de las notas es de alguien que no está en el Hall.");
      if (item.grade === null || item.grade === undefined || item.grade === "") {
        wanted.set(uid, null);
        continue;
      }
      const grade = cleanGrade(item.grade);
      if (grade === undefined) throw new HttpsError("invalid-argument", "Las notas van de 1,0 a 7,0, con un decimal.");
      wanted.set(uid, grade);
    }

    const published = !!evaluation.gradesPublishedAt;
    const uids = [...wanted.keys()];
    const refs = uids.map(uid => evaluationRef.collection("grades").doc(uid));
    const current = refs.length ? await classhallDb(getAdminApp).getAll(...refs) : [];

    const batch = classhallDb(getAdminApp).batch();
    const fresh = [];
    const corrected = [];
    const removed = [];
    let saved = 0;
    uids.forEach((uid, index) => {
      const before = current[index].data();
      const grade = wanted.get(uid);
      if (grade === null) {
        if (before) {
          batch.delete(refs[index]);
          removed.push(uid);
        }
        return;
      }
      if (before && before.grade === grade) return;
      saved += 1;
      const fields = { grade, updatedAt: FieldValue.serverTimestamp(), updatedBy: profile.uid };
      if (!published) {
        batch.set(refs[index], { ...fields, status: "draft", publishedAt: null, seenAt: null, corrected: false });
        return;
      }
      // Published already: the student gets it covered again.
      const wasPublished = before?.status === "published";
      batch.set(refs[index], {
        ...fields,
        status: "published",
        publishedAt: FieldValue.serverTimestamp(),
        seenAt: null,
        corrected: wasPublished,
      });
      (wasPublished ? corrected : fresh).push(uid);
    });
    await batch.commit();

    updates.gradesCount = await countGrades(evaluationRef);
    await evaluationRef.update(updates);

    if (published) {
      await markUnseen(getAdminApp, hallRef.id, evaluationRef.id, [...fresh, ...corrected], true);
      await markUnseen(getAdminApp, hallRef.id, evaluationRef.id, removed, false);
      const item = { id: evaluationRef.id, title: evaluation.title };
      if (fresh.length) await notifyHall(getAdminApp, { kind: "grade", hallId: hallRef.id, hall, item, onlyUids: fresh });
      if (corrected.length) await notifyHall(getAdminApp, { kind: "gradeCorrected", hallId: hallRef.id, hall, item, onlyUids: corrected });
    }
    return { saved, removed: removed.length };
  });

  // Publishes the evaluation's drafts: each student gets a push without the
  // grade and finds it covered in the Hall.
  const publishEvaluationGrades = onCall({ invoker: "public" }, async (request) => {
    const { hallRef, hall, evaluationRef, evaluation } = await openForStaff(getAdminApp, request);
    const drafts = await evaluationRef.collection("grades").where("status", "==", "draft").get();
    if (!drafts.size && evaluation.gradesPublishedAt) return { published: 0 };
    if (!drafts.size) throw new HttpsError("failed-precondition", "Esta evaluación todavía no tiene notas.");

    const db = classhallDb(getAdminApp);
    for (let start = 0; start < drafts.docs.length; start += 400) {
      const batch = db.batch();
      for (const doc of drafts.docs.slice(start, start + 400)) {
        batch.update(doc.ref, { status: "published", publishedAt: FieldValue.serverTimestamp(), seenAt: null });
      }
      await batch.commit();
    }
    const fields = { gradesCount: await countGrades(evaluationRef) };
    if (!evaluation.gradesPublishedAt) fields.gradesPublishedAt = FieldValue.serverTimestamp();
    await evaluationRef.update(fields);

    const uids = drafts.docs.map(doc => doc.id);
    await markUnseen(getAdminApp, hallRef.id, evaluationRef.id, uids, true);
    await notifyHall(getAdminApp, {
      kind: "grade", hallId: hallRef.id, hall, onlyUids: uids,
      item: { id: evaluationRef.id, title: evaluation.title },
    });
    return { published: uids.length };
  });

  // A student's own published grades in a Hall, newest evaluation first.
  const getMyGrades = onCall({ invoker: "public" }, async (request) => {
    const profile = await requireProfile(getAdminApp, request);
    const hallId = childId(request.data?.hallId);
    if (!hallId) throw new HttpsError("invalid-argument", "Falta el Hall.");
    const hallRef = classhallDb(getAdminApp).collection("halls").doc(hallId);
    const hall = (await hallRef.get()).data();
    const member = hall && (
      (hall.memberUids || []).includes(profile.uid)
      || ((hall.plan || "comun") === "comun" && hall.institutionId === profile.institutionId && hall.courseId === profile.courseId)
    );
    if (!member) throw new HttpsError("not-found", "No encontramos ese Hall entre tus clases.");
    await requireModule(getAdminApp, hall.institutionId);

    const evaluations = await hallRef.collection("evaluations").where("gradesPublishedAt", "!=", null).get();
    if (!evaluations.size) return { grades: [] };
    const mine = await classhallDb(getAdminApp).getAll(...evaluations.docs.map(doc => doc.ref.collection("grades").doc(profile.uid)));
    const grades = [];
    evaluations.docs.forEach((doc, index) => {
      const grade = mine[index].data();
      if (!grade || grade.status !== "published") return;
      const evaluation = doc.data();
      grades.push({
        evaluationId: doc.id,
        title: evaluation.title,
        date: millis(evaluation.date),
        weight: evaluation.weight ?? null,
        grade: grade.grade,
        seen: !!grade.seenAt,
        corrected: grade.corrected === true,
        publishedAt: millis(grade.publishedAt),
      });
    });
    grades.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
    return { grades };
  });

  // The student uncovered a grade.
  const markGradeSeen = onCall({ invoker: "public" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    const uid = request.auth.uid;
    const hallId = childId(request.data?.hallId);
    const evaluationId = childId(request.data?.evaluationId);
    if (!hallId || !evaluationId) throw new HttpsError("invalid-argument", "Falta la evaluación.");
    const ref = classhallDb(getAdminApp).collection("halls").doc(hallId)
      .collection("evaluations").doc(evaluationId).collection("grades").doc(uid);
    const grade = (await ref.get()).data();
    if (!grade || grade.status !== "published") throw new HttpsError("not-found", "Esa nota ya no está.");
    if (!grade.seenAt) await ref.update({ seenAt: FieldValue.serverTimestamp() });
    await markUnseen(getAdminApp, hallId, evaluationId, [uid], false);
    return { ok: true };
  });

  return { getEvaluationGrades, saveEvaluationGrades, publishEvaluationGrades, getMyGrades, markGradeSeen };
}

// How many grades of each Hall the student has not uncovered, for ClassHall.
async function unseenGradesByHall(getAdminApp, uid) {
  const halls = (await unseenRef(getAdminApp, uid).get()).data()?.halls || {};
  return Object.fromEntries(Object.entries(halls).map(([hallId, ids]) => [hallId, Array.isArray(ids) ? ids.length : 0]));
}

// Takes an evaluation's grades away with it.
async function removeEvaluationGrades(getAdminApp, hallId, evaluationRef) {
  const grades = await evaluationRef.collection("grades").get();
  if (!grades.size) return;
  const db = classhallDb(getAdminApp);
  for (let start = 0; start < grades.docs.length; start += 400) {
    const batch = db.batch();
    for (const doc of grades.docs.slice(start, start + 400)) batch.delete(doc.ref);
    await batch.commit();
  }
  await markUnseen(getAdminApp, hallId, evaluationRef.id, grades.docs.map(doc => doc.id), false);
}

module.exports = { build, gradesOn, unseenGradesByHall, removeEvaluationGrades, cleanGrade };
