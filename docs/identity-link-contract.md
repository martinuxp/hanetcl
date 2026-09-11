# Contrato de identidad HaNet

La identidad de acceso pertenece a Firebase Authentication. Los sistemas
académico y ClassHall conservan sus propios identificadores; HaNet solo
mantiene vínculos explícitos entre ellos.

## Flujo inicial

1. El usuario se autentica con Firebase.
2. HaNet solicita un vínculo usando el RUT normalizado.
3. El backend valida que el registro académico exista y crea una solicitud
   `pending`.
4. Un mecanismo de verificación institucional o una directiva autorizada
   aprueba o rechaza la solicitud.
5. Solo una solicitud `verified` puede habilitar datos académicos o ClassHall.

El cliente nunca escribe `linkedUid` en `LCH-enroll-hn` y nunca decide por sí
mismo el `academicStudentId`, el `moodleUserId` o el rol del usuario.

## Colecciones iniciales

- `hn-enrollmentdata/LCH-enroll-hn/{rut}`: registro académico importado.
- `hn-enrollmentdata/identityLinkRequests/{requestId}`: solicitudes pendientes
  y su auditoría.
- `hn-enrollmentdata/identityLinks/{firebaseUid}`: vínculo aprobado que será
  creado en una fase posterior, después de definir la verificación.

## Política de privacidad

Las respuestas públicas no devuelven nombres ni datos académicos al consultar
un RUT. Los errores de existencia deben ser genéricos en la UI para no revelar
la matrícula de terceros.
