# Tasks — 080 WhatsApp por Zernio

Cada tarea termina con `pnpm typecheck`, `pnpm lint` y `pnpm test` en verde.
Las pruebas de cada bloque se escriben **antes** que el código que prueban.

## Entrega 1 — recibir, responder, estados

### Datos y bandera

- [x] T001 `WHATSAPP_ZERNIO` en `env.ts`, `whatsapp-zernio/flag.ts` (`whatsappZernioEnabled()`) y `features.whatsappZernio` en `/api/health`
- [x] T002 Tabla `whatsappZernioCredentials` en `schema.ts` (sin columna de secreto en claro)
- [x] T003 `pnpm db:generate` → `0033_whatsapp_por_zernio`; aplicada sobre una base en `0032` y sobre una vacía; re-ejecutable (no-op); restricciones comprobadas
- [x] T004 `whatsapp-zernio/credentials.ts` (guardar, leer por organización y por `accountRef`, marcar `reconnect_required`, borrar) y `whatsapp-zernio/source.ts` (`getWhatsappSource`, `puedeConectarFuente`)

### Zernio admite WhatsApp

- [x] T005 `cuentas.ts`: `ZernioChannel` y `ZERNIO_PLATFORMS` con `whatsapp`; `ZERNIO_SOCIAL_CHANNELS` para las pantallas de Canales
- [x] T006 `conexiones.ts`: `ZERNIO_CHANNELS`, `WEBHOOK_PATH.whatsapp = "wa"`, ramas de la tabla nueva; `ensureWebhookForOrg` calcula los eventos
- [x] T007 `webhooks.ts`: eventos de estado como constantes; `ensureZernioWebhook` recibe la lista
- [x] T008 `dispatch.ts`: `zernioTargetChannel` reconoce `whatsapp` y reparte al adaptador (`whatsapp-zernio/ingest.ts` es un stub con aviso hasta T010) (`whatsapp-zernio/ingest.ts` es un stub con aviso hasta T010)

### Entrada

- [x] T009 Pruebas del normalizador con los eventos reales del sandbox (sin datos personales): texto, botón, cita, imagen, nota de voz, documento, ubicación, contacto, evento de otra plataforma, saliente, sin cuenta
- [x] T010 `whatsapp-zernio/ingest.ts`: normalizador puro y `processZernioWhatsappEvent`
- [x] T011 `remote-media.ts` y `descarga-remota.ts`: origen `zernio-whatsapp`, credencial solo a `zernio.com`, sin redirecciones a otro host, `sha256`
- [x] T012 Pruebas de la descarga: 401 sin llave, host ajeno, redirección fuera de `zernio.com`, `sha256` que no coincide, tope por tipo
- [x] T013 Contacto con `origin: "other"` no cambia el teléfono del remitente

### Estados

- [x] T014 Conversión de `message.sent|delivered|read|failed` a `WebhookStatus` y `applyStatusUpdate`
- [x] T015 Pruebas: orden aleatorio de acuses, `delivered` tardío tras `read`, `message.sent` propio no duplica, `failed` con código traducido

### Salida

- [ ] T016 Pruebas de `send.ts` (texto, adjunto por `multipart`, cita, ubicación, contacto, `Idempotency-Key`) contra un `fetch` simulado
- [ ] T017 `whatsapp-zernio/send.ts` y la ampliación de `sendZernioMessage`
- [ ] T018 `prepareSend`, `sendText`, `sendMediaMessage` y `sendStructured`: rama de Zernio tras `is_test` y ventana, antes de las credenciales de Meta
- [ ] T019 `capabilities.ts`: capacidades de WhatsApp por fuente; el compositor solo ofrece lo que la fuente puede
- [ ] T020 Traducción de fallos: llave muerta → `reconnect_required`; 0/5xx → `meta_unavailable` con el mensaje `failed` visible

### Superficie

- [ ] T021 Ruta `/api/webhooks/wa/[token]`: leer primero y decidir Meta o Zernio; `recibirEvento`; pruebas de firma, segmento, dedupe y reentrega tardía
- [ ] T022 `/api/settings/whatsapp-zernio` (GET/PUT/DELETE, solo dueño, últimos 4, 404 sin bandera, exclusión con Meta)
- [ ] T023 Ajustes → WhatsApp → «Por Zernio» y `health`

### Simulador, E2E y documentación

- [ ] T024 Simulador de Zernio: WhatsApp (conversaciones, mensajes, medios con 401, acuses desordenados) y caminos infelices
- [ ] T025 `tests/e2e/us-whatsapp-zernio.md` y `scripts/e2e-whatsapp-zernio.mjs`
- [ ] T026 `ci.yml` (`WHATSAPP_ZERNIO` en `completo`), `.env.example`, `AGENTS.md`, README, `CHANGELOG.md`, `specs/README.md`
- [ ] T027 Los cuatro gates en las dos configuraciones y los E2E (`whatsapp-zernio`, `tiktok`, `messenger`, `despacho`, selftest)
- [ ] T028 Prueba en vivo y bitácora: lo pendiente de verificación humana de la spec, con una cuenta de prueba

## Entrega 2 — plantillas

> Antes de empezar: confirmar con un número real la forma de crear, listar y del
> evento de estado de plantillas (spec, «No verificado»).

- [ ] T029 Pruebas de sincronizar, crear, estado y envío contra el simulador
- [ ] T030 `templates.ts`: rama de Zernio en `syncTemplates` y `createTemplate`
- [ ] T031 `applyTemplateStatusEvent` por `account.id` y `whatsapp.template.status_updated`; el evento entra al webhook
- [ ] T032 `sendTemplate` por `POST /v1/inbox/conversations`, `templateParams` en orden y `conversationId` guardado
- [ ] T033 Errores del tope diario de un número nuevo y de plantilla no aprobada, con su motivo
- [ ] T034 Simulador y E2E de plantillas; gates; bitácora
