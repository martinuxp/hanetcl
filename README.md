# HaNet

Aplicación para comunidades educativas chilenas: calendario de curso, eventos y, más adelante, comunicados y herramientas académicas en un solo lugar. El piloto es el Liceo Camilo Henríquez de Temuco.

Está en **beta**. Varias secciones del inicio (ClassHall, Wallet, Feed y comunidad, Calificaciones) son accesos todavía sin función.

## Qué funciona hoy

| Área | Estado |
| --- | --- |
| Registro y verificación de correo | Funciona. Código de 4 dígitos enviado por correo. |
| Unirse a una institución | Funciona. Código de invitación de cuatro palabras y vínculo por correo institucional. |
| Calendario de curso | Funciona. Crear, editar, cancelar, mover y eliminar eventos según el rol; exporta iCal. |
| Perfil | Funciona. Datos reales, foto y letra del nombre. |
| Panel HNT | Funciona. Instituciones, códigos de invitación y carga de listas. |
| Eventos regionales | Solo interfaz, con datos de prueba en desarrollo. |
| Formulario verificador | No disponible en la beta. |

## Tecnología

- **App:** Expo SDK 58, React Native 0.88, Expo Router, Reanimated 4. Corre en iOS, Android y web.
- **Backend:** Firebase, proyecto `hanet-edu`: Authentication, Cloud Functions (Node 22), Firestore, Storage y Hosting.
- **Correos:** Resend, desde el dominio `hanet.muxp.art`.

## Cómo correrla

```bash
npm install
npx expo start
```

Desde ahí se abre en Expo Go escaneando el código, o en el navegador con `w`. El teléfono debe estar en la misma red que el computador.

Comprobaciones antes de guardar cambios:

```bash
npx tsc --noEmit
npm run lint
```

## Estructura

```
app/                 Pantallas (Expo Router)
  (tabs)/            Inicio, perfil, calendario y eventos
  auth.tsx           Cuenta existente / cuenta nueva
  verify-email.tsx   Código de verificación
  join-beta.tsx      Código de invitación
  link-institution.tsx  Vínculo con la institución
  hnt-admin.tsx      Panel del equipo HaNet
components/          Componentes compartidos; ui/ tiene los de base
constants/           Tokens de diseño y letras del perfil
services/            Acceso a Firebase desde la app
functions/           Cloud Functions
hosting/             Sitio público: logos de los correos y términos
docs/                Documentos de diseño y legales
```

## Datos

Firestore usa bases con nombre, no la base por defecto:

- `hn-enrollmentdata`: cuentas, perfiles, instituciones con sus listas y vínculos.
- `hn-calendar`: una colección por curso, `HNC-LCH.{curso}`.

Las reglas están en `firestore.enrollment.rules`, `firestore.calendar.rules` y `storage.rules`. Tres ideas las ordenan:

1. La app solo lee lo que pertenece a la cuenta que inició sesión. Todo lo demás, y casi toda escritura, pasa por Cloud Functions.
2. El rol y el curso viajan en el token de la cuenta (custom claims), porque las reglas del calendario no pueden leer la otra base. La función `syncMyClaims` los mantiene al día.
3. Los códigos, tanto el de verificación como el de invitación, se guardan como huella, nunca en texto.

Roles: `Estudiante`, `Directiva`, `CEE`, `Admin` y `HNT`. Los cuatro últimos pueden publicar en el calendario de su curso; solo `HNT` entra al panel.

## Recorrido de una cuenta nueva

1. Crea su HaNet ID y acepta los términos.
2. Verifica su correo con un código.
3. Ingresa el código de invitación de su institución.
4. Confirma su correo institucional desde un link y acepta los datos que la institución tiene de ella.

Mientras no termine, la app la devuelve al paso que le falta.

## Publicar en Firebase

Hace falta haber iniciado sesión con `firebase login`.

```bash
firebase deploy --only functions --project hanet-edu
```

```bash
firebase deploy --only firestore,storage --project hanet-edu
```

```bash
firebase deploy --only hosting --project hanet-edu
```

Agregar `--dry-run` compila y valida sin publicar. Las funciones que envían correos leen el secreto `RESEND_API_KEY`.

Los términos y condiciones se editan en `docs/legal/terminos-y-condiciones.md`; la página pública se regenera con:

```bash
node scripts/build-legal.js
```

## Versión para iPhone sin cuenta de desarrollador

El flujo manual `Build LiveContainer IPA` en GitHub Actions genera una IPA sin firmar, pensada para LiveContainer.

## Convenciones de diseño

- Tema oscuro "Misty Rose", con `#EF2274` como color de acento. Los tokens están en `constants/design-tokens.ts`.
- Botones y chips siempre en forma de píldora.
- Nada de datos inventados en pantalla: lo que todavía no existe se muestra apagado o no se muestra.
- La referencia visual es el archivo de Figma "Hanet Project".
