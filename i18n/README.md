# Textos e idiomas

Todos los textos de la app viven en `locales/es.json`. El español es el idioma fuente: lo que dice ese archivo es exactamente lo que se lee en la app. Los demás idiomas son traducciones de él.

## En el código

```tsx
import { t } from '@/i18n';

<ThemedText>{t('settings.iconoDeLaApp')}</ThemedText>
t('settings.queCambioEnAppversionlabel', { appVersionLabel })   // "Qué cambió en {{appVersionLabel}}"
t('classhall.hall.countEstudiantes', { count })                  // "1 estudiante" / "5 estudiantes"
```

- Las claves salen del archivo (`app/anniversary/detail.tsx` → `anniversary.detail.*`) y de las primeras palabras del texto. Lo que se repite en 3 archivos o más va en `common.*`.
- Los plurales usan `count`: en el catálogo son `clave_one` y `clave_other`.
- Meses y días salen de `dates.*` con `months()`, `monthsShort()`, `weekdays()`, `weekdaysShort()` y `weekdayLetters()`; `capitalize()` para cuando van al inicio.
- `t()` funciona en cualquier parte, también fuera de componentes y arriba en un módulo, porque el catálogo carga de inmediato. Por eso cambiar de idioma reinicia la app.

## Textos nuevos

Escribe el texto directo en el código, como siempre, y después:

```sh
npm run i18n:extract   # lo pasa a es.json y lo cambia por t('...')
npm run i18n:check     # lista lo que falte (el check del PR corre esto)
```

El script se salta lo que parece dato y no texto: comparaciones, `case`, claves de objetos, tipos, rutas, estilos, nombres de íconos y de marcas. Si se equivoca, `// i18n-ignore` al final de la línea (o `// i18n-ignore-next-line` arriba) la deja tranquila.

**Ojo con los textos que también son datos.** Los tipos de evento del Calendar ("Evaluación sumativa", "Tarea", "Otro"…) se guardan tal cual en Firestore y la app los compara, así que no pasan por `t()`. Para traducirlos hay que mostrar una etiqueta aparte, sin tocar el valor guardado. Lo mismo vale para los roles (`Estudiante`, `Profesor`…).

## Agregar un idioma

1. Copia `locales/es.json` a `locales/<código>.json` (por ejemplo `en.json`) y traduce los valores, nunca las claves. Respeta los `{{valores}}`. En los plurales, cada idioma usa sus formas (`_one`, `_other`, y en algunos `_few` o `_many`).
2. En `index.ts`, súmalo a `LANGUAGES` (nombre y locale para fechas) y a `resources`.
3. Falta elegir el idioma: un selector en Configuraciones que guarde la elección y reinicie la app, o tomar el del teléfono.

## Lo que todavía no pasa por aquí

- Los mensajes de error que vienen de las Cloud Functions (`functions/`), que llegan en español.
- Los widgets (`widgets/`, de iPhone y Android): corren aparte y sus textos de respaldo ("Abre HaNet", "Tu día") siguen escritos en el widget. Lo demás se lo pasa la app ya traducido.
- Las Novedades (`constants/changelog.json`) y los nombres de asignaturas (`constants/subjects.ts`, que son datos compartidos con las funciones).
- Algunas fechas usan `toLocaleDateString('es-CL')` directo; para otro idioma conviene cambiarlas por `dateLocale()`.
