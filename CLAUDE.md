# HaNet — guía para Claude

App de Expo/React Native para liceos chilenos. Piloto: Liceo Camilo Henríquez de Temuco ("LCH Temuco"). La desarrolla una sola persona, que también la diseña. El README describe la estructura; esto recoge lo que no se deduce del código.

## Cómo trabajar

- Responder siempre en español. El usuario escribe en español chileno informal.
- Se prueba en el teléfono con Expo Go (iPhone y Android) y en web. Nadie más revisa el código.
- Commits solo cuando el usuario los pide, en la rama `auditoria-ui-y-auth`, no en `master`. Push también solo a pedido.
- Publicar en Firebase (reglas, funciones, hosting, storage) o en Expo (EAS Update) necesita el OK del usuario cada vez. Un OK anterior no cubre el siguiente.
- No correr `npm audit fix` en la raíz: sube Expo y rompe el render web. En `functions/` sí es seguro.
- Instalar un paquete nuevo exige reiniciar el servidor de Expo.
- No borrar ni incluir en commits `Tokens.zip`, `Light.tokens.json` ni el SVG de nombre invisible de la raíz.
- Este repositorio es público. Nunca subir secretos, nóminas ni datos de estudiantes. `.secrets/` está fuera de git a propósito.
- `hanet.cl` no es del usuario: no usar direcciones de ese dominio. Contacto: `muxp@muxp.art`. Correos salen desde `hanet.muxp.art`.

## Diseño

- El diseño vive en Figma (archivo `16jIXkcIKhFJPnM38A7qUF`). Leerlo con el conector de Figma, no con capturas del navegador.
- Tema oscuro "Misty Rose", acento `#EF2274`. Control activo `#C7C6CF` con texto `#282829`. Tipografía DM Sans. Tokens en `constants/design-tokens.ts`.
- Botones y chips siempre con forma de píldora.
- Selectores como diálogo tipo alerta, no en línea. Hora con ruedas desplazables. Marcar "hoy" en las fechas.
- Animaciones breves (unos 120 ms al abrir).
- Formularios secundarios en hoja deslizable (`formSheet`). En Android la hoja la dibuja la app (`components/ui/sheet-frame.tsx`), porque el `formSheet` nativo de react-native-screens 4.26 se abre sin altura.
- La barra inferior es una sola, en la raíz (`GlobalTabBar` en `components/AppTabBar.tsx`). Las pantallas no dibujan la suya.
- No mostrar datos falsos como si fueran reales. Lo que no existe va como "Próximamente".
- Quien no tiene foto aparece con su **blobatar** (blobatar.dev, versión fija 2.7.0) en `HanetAvatar` (`components/ui/hanet-avatar.tsx`): tono fijo 0.5, color libre, sobre el recuadro `surfaceRaised`. La semilla es aleatoria y vive en `accounts/{uid}.avatarSeed` (nunca el UID, correo ni nombre); "Otro blobatar" la cambia. Las fotos de perfil siguen siendo privadas: los demás ven el blobatar.

## Producto

- **Identidad:** el HaNet ID es el UID de Firebase Auth, con una sola institución activa.
- **Registro:** cuenta → código por correo → código de invitación de la institución (4 palabras) → vínculo por correo institucional verificado contra la nómina → bienvenida.
- **Roles:** `Estudiante`, `Directiva`, `CEE`, `Profesor`, `Admin`, `HNT`. Se asignan en el Panel HNT. Rol y curso viajan en los claims del token (`role`, `courseId`), que sincroniza `syncMyClaims`.
- **Sin funciones sociales entre estudiantes:** nada de chats, seguidores, contenido propio, contactos ni escáner de QR. No construirlas ni anunciarlas.
- **"Feed y comunidad" es otra cosa:** comunicados de quienes tienen rol, con comentarios y reacciones opcionales. No empezarlo hasta que el usuario lo diseñe.
- **Fuera de la beta:** el formulario verificador y las calificaciones. El liceo lleva notas y asistencia en SchoolNet de Colegium; HaNet no las guarda.
- **Calendar** es la agenda del curso. La editan Directiva, CEE, Admin y HNT.
- **ClassHall** es propio, sobre Firebase (no Moodle ni Academico). Un Hall es una asignatura en un curso y tiene un tipo (`plan`): **Plan común** (formación general; todas las cuentas del curso están dentro, sin código), **Electivo** (formación general electiva de 3° y 4°) o **Dominio** (plan diferenciado, las asignaturas de profundización). Electivos y dominios mezclan cursos de la institución y se entra con un código de 6 caracteres; sus evaluaciones llegan al Calendar de cada curso de sus estudiantes. El catálogo de asignaturas es uno solo para ClassHall y Calendar (`constants/subjects.ts`, igual a `functions/subjects.js`). No hay calificación en la app: las tareas sí tienen entregas, pero el docente solo las marca como revisadas y puede dejar un comentario. Lo que publica un docente no lo puede modificar la directiva. Está hecho: crear, editar y unirse a Halls, "Mis clases" y el interior del Hall: anuncios (con un archivo adjunto), evaluaciones con tabla de especificaciones (y su T.E. escaneada) y documentos. Los archivos se suben a `classhall-uploads/{uid}/` y `attachHallDocument` los mueve a `classhall/{hallId}/`, que solo se abre con la URL con token que `getHall` entrega a los miembros. Un docente puede pasar a su Hall una evaluación del Calendar y confirmar la información que publica la directiva (`verifyCalendarEvent`). **Tareas:** el docente publica una con fecha de entrega (y si acepta atrasos); aparece en el Calendar como tipo "Tarea". El estudiante entrega archivos, fotos o vínculos (hasta 6) con un comentario; los sube a `classhall-submissions/{uid}/` y `submitHallTask` los mueve a `classhall/{hallId}/tasks/`. Una entrega la ven solo su autor y el docente; no es contenido entre estudiantes. **Notificaciones push** (`functions/classhall-notify.js`, servicio de Expo): anuncio, tarea y material nuevos a los estudiantes del Hall, recordatorio a las 18:00 a quien no ha entregado una tarea que vence mañana (`remindTasksDueTomorrow`) y aviso al estudiante cuando revisan su entrega. Los docentes no reciben push. Cada dispositivo guarda su token en `hn-enrollmentdata/pushTokens/{sha256}` con el UID que tiene la sesión; se apagan en Editar perfil (`accounts/{uid}.notifications.classhall`). Expo Go en Android no recibe push desde SDK 53: hace falta la app compilada. Los únicos correos son los esenciales (código de verificación y vínculo institucional).

## Backend

Proyecto de Firebase `hanet-edu`. Funciones v2 en Node 22, región `us-central1`. Firestore con bases con nombre, en `southamerica-west1`:

| Base | Contenido | Acceso desde la app |
| --- | --- | --- |
| `hn-enrollmentdata` | cuentas, perfiles, instituciones y nóminas | lectura del propio perfil; el resto por funciones |
| `hn-calendar` | eventos por curso (`HNC-LCH.{courseId}`) | reglas por claims |
| `hn-classhall` | Halls y sus códigos | cerrado; solo por funciones |

- Un `courseId` real es `"Segundo Medio K"`, con espacios. No validarlo con patrones estrictos.
- Los secretos van con `firebase functions:secrets:set NOMBRE --data-file <archivo>`. Nunca pegarlos en el chat ni en el repositorio.
- El código de invitación se guarda solo como hash y se muestra una única vez en el panel.

## Desde una sesión en la nube

- No hay credenciales de Firebase en la sesión. De Expo solo `EXPO_TOKEN`, para la rama `expo-go` de EAS Update (ver abajo).
- Firebase se publica con GitHub Actions (`.github/workflows/firebase-deploy.yml`, secreto `FIREBASE_SERVICE_ACCOUNT`). Con el OK del usuario, él crea una release cuya etiqueta es `firebase-deploy-<qué>-<n>` (por ejemplo `firebase-deploy-functions-4`, `firebase-deploy-all-1`) sobre la rama de trabajo; el proxy de la nube no deja empujar etiquetas. Seguir la ejecución con las herramientas de GitHub y revisar el registro: una función sin cambios sale como "Skipped".
- Una función callable nueva queda cerrada en Cloud Run si la cuenta de servicio no puede abrirla. Comprobar con `curl -X POST .../<función>`: 401 es lo esperado; 403 significa que hay que permitir el acceso público en Cloud Run.
- Comprobar antes de entregar: `npx tsc --noEmit` y `npx eslint app components services`.
- El servidor de desarrollo se define en `.claude/launch.json` (`expo`, puerto 8081), pero el túnel de Expo (ngrok) no funciona tras el proxy de la nube.
- Para probar en el iPhone desde la nube: después de cada cambio que pase `tsc` y `eslint`, publicar sin preguntar (cada tarea terminada) con `EXPO_GO_UPDATE=1 npx eas-cli update --branch expo-go --environment development --message "<resumen>" --non-interactive` (necesita `EXPO_TOKEN` en el entorno; EAS exige `--environment` sin modo interactivo, y la app no usa variables de entorno). Se abre en Expo Go con la cuenta `muxp`. Esta autorización cubre solo la rama `expo-go`; el resto de EAS y Firebase sigue necesitando OK.
