// Assigns a panel role from a trusted machine, for bootstrapping the first
// admin (setUserRole can only be called by an existing admin).
//
// Usage, from functions/ with Application Default Credentials for hanet-edu
// (`gcloud auth application-default login`):
//   node scripts/set-role.js persona@correo.cl admin
//   node scripts/set-role.js profe@correo.cl docente 2k,3a
//   node scripts/set-role.js persona@correo.cl none
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

async function main() {
  const [email, role, coursesArg] = process.argv.slice(2);
  if (!email || !["admin", "docente", "none"].includes(role)) {
    console.error("Uso: node scripts/set-role.js <correo> <admin|docente|none> [cursos,separados,por,coma]");
    process.exit(1);
  }

  initializeApp({ credential: applicationDefault(), projectId: "hanet-edu" });
  const auth = getAuth();
  const user = await auth.getUserByEmail(email.trim().toLowerCase());

  const claims = { ...(user.customClaims || {}) };
  delete claims.role;
  delete claims.courses;
  if (role !== "none") {
    claims.role = role;
    const courses = (coursesArg || "").split(",").map((c) => c.trim()).filter(Boolean);
    if (role === "docente" && courses.length) claims.courses = courses;
  }

  await auth.setCustomUserClaims(user.uid, claims);
  console.log(`Listo: ${email} ->`, claims);
  console.log("La persona debe cerrar sesión y volver a entrar para que el rol se aplique.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
