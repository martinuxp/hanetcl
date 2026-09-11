# HaNet Eventos: Cerca de mi

## Alcance de esta primera etapa

`Cerca de mi` muestra eventos regionales publicados para la ubicación seleccionada por la persona. `En mi institución` queda fuera de esta etapa y seguirá usando un dominio separado para no mezclar eventos institucionales con la cartelera regional.

La ubicación inicial de diseño es Temuco, Región de La Araucanía. El modelo no queda limitado a esa ciudad: la consulta recibe ciudad y región para permitir cambiar ubicación después.

## Fuente de datos

La fuente operativa será Firestore en la base `hn-events`, colección `regionalEvents`. La app solo consulta documentos `published`; la carga, verificación y actualización deben ocurrir mediante un portal administrativo y Cloud Functions protegidos para moderadores.

Orden de confianza recomendado:

1. Organizadores, recintos y municipalidades: fuente primaria para fecha, lugar, descripción y cancelaciones.
2. Ticketing: fuente de compra y precio cuando el organizador no tiene una página propia.
3. Scraper, envíos de organizadores o comunidad: útiles para descubrir eventos, pero quedan `pending_review` o `unverified` hasta validarlos.

Portaldisc puede alimentar el descubrimiento y los datos de ticketing mediante sus fichas públicas. Como no contamos con una API pública confirmada para este proyecto, la primera integración puede usar scraping controlado desde backend. Debe respetar `robots.txt`, términos aplicables, límites de frecuencia y no acceder a zonas autenticadas ni automatizar compras. Cada captura se guarda con URL, fecha, método `scrape` y hash de contenido para detectar cambios. Si más adelante aparece un feed o API, se reemplaza el adaptador sin cambiar el contrato de eventos.

Wikimedia/Wikidata se usará únicamente como enriquecimiento editorial para bandas, artistas, recintos o exposiciones: resumen, imagen y enlaces. No será fuente de fechas, precios, disponibilidad, cancelaciones ni descuentos. La API REST de Wikimedia expone resúmenes y metadatos en JSON, pero la reutilización debe respetar licencia, atribución, `User-Agent`, límites y políticas de uso.

El scraping no será la fuente de verdad absoluta: solo propone o actualiza datos públicos. Los cambios sensibles —fecha, cancelación, precio o descuento— deben poder marcarse para revisión. La URL de origen y `lastCheckedAt` permiten detectar información desactualizada.

## Documento `regionalEvents/{eventId}`

```ts
{
  title: string,
  category: 'music' | 'concert' | 'exhibition' | 'sports' | 'theatre' | 'family' | 'academic' | 'community' | 'other',
  summary?: string,
  description?: string,
  organizer?: string,
  editorial?: {
    subject: string,
    summary?: string,
    source: { type: 'knowledge_base', name: string, url: string, lastCheckedAt?: Timestamp },
    sourcePageUrl: string,
    wikidataId?: string,
    imageUrl?: string,
    license?: string,
    attribution?: string,
    fetchedAt?: Timestamp
  },
  images: [{ url: string, alt?: string, credit?: string }],
  location: {
    venueName: string,
    address?: string,
    city: string,
    region: string,
    country: 'CL',
    latitude?: number,
    longitude?: number
  },
  startsAt: Timestamp,
  endsAt?: Timestamp,
  timezone: 'America/Santiago',
  price?: { currency: 'CLP', min?: number, max?: number, isFree: boolean, label?: string },
  ticketUrl?: string,
  source: { type: 'official' | 'ticketing' | 'organizer' | 'community' | 'knowledge_base', name: string, url: string, ingestion?: 'api' | 'feed' | 'scrape' | 'manual', lastCheckedAt?: Timestamp, contentHash?: string },
  offers: [{
    type: 'student' | 'hanet' | 'general',
    label: string,
    verification: 'verified' | 'pending' | 'expired' | 'unverified',
    value?: string,
    requirements?: string,
    redemptionUrl?: string,
    validUntil?: Timestamp,
    source?: { type: string, name: string, url: string, lastCheckedAt?: Timestamp }
  }],
  status: 'draft' | 'pending_review' | 'published' | 'cancelled' | 'expired' | 'archived',
  moderation: {
    status: 'draft' | 'pending_review' | 'published' | 'cancelled' | 'expired' | 'archived',
    needsReview: boolean,
    reviewReason?: 'new' | 'source_changed' | 'date_changed' | 'price_changed' | 'cancelled' | 'reported' | 'manual',
    reviewedBy?: string,
    reviewedAt?: Timestamp,
    rejectionReason?: string,
    archivedAt?: Timestamp,
    archivedBy?: string
  },
  featured: boolean,
  verifiedAt?: Timestamp,
  createdAt?: Timestamp,
  updatedAt?: Timestamp
}
```

## Reglas de producto

- Un precio no implica descuento estudiantil.
- HaNet solo muestra “Activar descuento HaNet” si existe una oferta `hanet` con `verification: 'verified'` y vigente.
- Un beneficio estudiantil externo se etiqueta como `student` y enlaza a sus requisitos/fuente.
- Eventos sin descuento siguen siendo válidos y deben mostrar compra o acceso gratuito según corresponda.
- Cancelaciones y vencimientos se conservan como estados, pero no aparecen en `Cerca de mi`.
- Los candidatos scrapeados nunca se publican automáticamente: entran como `pending_review`.
- El borrado debe ser lógico (`archived`), conservando historial y fuente para auditoría.
- El detalle debe mostrar la fuente del evento y el aviso de responsabilidad que aparece en Figma.
- El detalle debe distinguir “Información del evento” de “Sobre el artista/recinto”; esta segunda sección puede venir de Wikimedia/Wikidata y debe mostrar atribución cuando corresponda.

## Flujo de consulta

1. Resolver ubicación activa (`city`, `region`), inicialmente Temuco / La Araucanía.
2. Consultar `regionalEvents` y normalizar documentos externos.
3. Filtrar `published`, ciudad, categoría, fechas y beneficios.
4. Ordenar destacados primero y luego por fecha de inicio.
5. Abrir detalle por `eventId`; los botones de compra y beneficios salen de URLs verificadas del documento.

## Portal administrativo

El portal debe ser una superficie separada de la app pública. Sus acciones mínimas son:

- bandeja de eventos nuevos o con cambios detectados;
- revisar y editar título, categoría, ubicación, fechas, imágenes y fuente;
- aprobar, rechazar, cancelar, archivar y restaurar;
- revisar ofertas estudiantiles y HaNet por separado;
- fijar eventos destacados;
- consultar historial de cambios y última captura del scraper.

La interfaz puede ocultar acciones según el rol, pero la autorización real debe estar en reglas/Cloud Functions. Como base, `Admin` y `HNT` pueden administrar; otros roles solo deben recibir permisos explícitos para revisar o editar.

La capa TypeScript que implementa este flujo está en `services/regional-events-service.ts` y el contrato en `types/regional-events.ts`.
