# Implementation Plan: WhatsApp por Zernio

**Branch**: `feat/080-whatsapp-por-zernio` | **Spec**: [spec.md](spec.md)

## Summary

WhatsApp gana una **segunda fuente**: además de Meta directo, un negocio puede
conectar su número a través de su propia cuenta de Zernio. Es el mismo canal
(`whatsapp`, siempre encendido) con otra fuente de credenciales, como Instagram
y Messenger ya tienen la suya, pero con tabla propia para no tocar
`meta_credentials`. Lo nuevo respecto a TikTok es que WhatsApp **ya existe** en
el núcleo (ventana de 24 h, plantillas, acuses, citas, ubicación, contactos,
medios): el trabajo es traducir Zernio a lo que el núcleo ya entiende, no
inventar capacidades.

## Modelo de datos

`whatsapp_zernio_credentials` (migración `0033_whatsapp_por_zernio`), con la forma
de `tiktok_credentials`:

| Columna | Tipo | Nota |
|---|---|---|
| `id` | text PK | |
| `organization_id` | text NOT NULL, FK cascade | único: una cuenta por organización |
| `source` | text NOT NULL default `zernio` | enum de un valor, como TikTok |
| `account_ref` | text NOT NULL | `accountId` de la cuenta de WhatsApp en Zernio; por él enruta el webhook. Único. |
| `display_phone_number` | text NULL | para enseñarlo en Ajustes (`username` de la cuenta) |
| `verified_name` | text NULL | nombre que Zernio da a la cuenta, solo para Ajustes |
| `token_cipher`, `token_iv`, `token_tag` | text NOT NULL | la API key, cifrada |
| `webhook_secret_cipher`, `webhook_secret_iv`, `webhook_secret_tag` | text NULL | secreto HMAC, cifrado (030); **no** nace la columna en claro |
| `status` | text NOT NULL default `connected` | `connected` o `reconnect_required` |
| `created_at`, `updated_at` | timestamp | |

**Secreto de firma.** `columnasDelSecreto` y `secretoDeLaFila`
(`src/server/zernio/secreto-guardado.ts`) devuelven y esperan también el campo en
claro `webhookSecret`, que la 030 dejó obsoleto. La tabla nueva **no** lo lleva:
`credentials.ts` descarta ese campo al escribir (`const { webhookSecret: _, ...cifradas }`)
y lo pasa en `null` al leer. Así no nace una columna que ya hay que quitar en la
siguiente versión mayor.

`conversation.channel_thread_ref` ya existe (lo usan Instagram, Messenger y
TikTok): guarda el `conversationId` de Zernio. `message.wa_message_id` es el
`wamid`, igual que en Meta directo. Nada más cambia de forma.

**Una sola fuente por organización** (D1) se hace cumplir en código, en una única
función `getWhatsappSource(organizationId): "meta" | "zernio" | null`, y no con una
restricción cruzada entre tablas: así `meta_credentials` sigue intacta.

## Contratos

- **`/api/webhooks/wa/[webhookToken]`** — `POST` acepta además el cuerpo de
  Zernio (un evento plano con `account`). Meta sigue por su firma; Zernio, por
  `X-Zernio-Signature`. Respuestas como las de Instagram: 404 con segmento
  equivocado, 401 con firma inválida, 200 si no. Hoy la ruta valida la firma de
  Meta **antes** de leer el cuerpo; pasa a leer primero, como `ig`.
- **`GET/PUT/DELETE /api/settings/whatsapp-zernio`** — nueva, 404 sin la bandera;
  solo el dueño; la llave solo se muestra con sus últimos 4.
- **`GET /api/health`** — `features` gana `whatsappZernio: boolean` (aditivo, igual
  que `agenda` y `atribucion`: siempre presente, `false` por defecto).
- **`GET /api/settings/webhook`** — sin cambios de forma (la URL de WhatsApp es la
  de siempre).
- **`/api/bot/*`, SSE, despacho** — sin cambios de forma. `channel` sigue valiendo
  `whatsapp`.

## Diseño

1. **Bandera.** `WHATSAPP_ZERNIO` en `src/lib/env.ts` (cadena opcional, `on`), con
   su ayuda `isWhatsappZernioEnabled()` junto a `isChannelEnabled`. Apagada, nada
   de lo siguiente es alcanzable por el usuario.
2. **Credenciales y fuente.** `src/server/whatsapp-zernio/credentials.ts`
   (patrón de `tiktok/credentials.ts`, con `columnasDelSecreto`) y
   `getWhatsappSource`.
3. **Zernio admite WhatsApp.**
   - `src/server/zernio/cuentas.ts`: `ZernioChannel` deja de excluir `whatsapp`;
     `ZERNIO_PLATFORMS.whatsapp = ["whatsapp"]`; `pickZernioAccount` ya sabe
     elegir por plataforma.
   - `src/server/zernio/conexiones.ts`: `ZERNIO_CHANNELS` deja de filtrar
     `whatsapp`; `WEBHOOK_PATH.whatsapp = "wa"`; ramas de `byOrg`,
     `byAccountRef` y `update` para la tabla nueva; `ensureWebhookForOrg`
     calcula los eventos según los canales conectados.
   - `src/server/zernio/webhooks.ts`: constantes de los eventos de estado y de
     plantilla; `ensureZernioWebhook` recibe la lista de eventos en vez de una
     fija. Con WhatsApp: `message.sent`, `message.delivered`, `message.read`,
     `message.failed` y, en la entrega 2, `whatsapp.template.status_updated`.
   - `src/server/zernio/dispatch.ts`: `zernioTargetChannel` devuelve `whatsapp`;
     `processZernioPayload` reparte los eventos de mensajes y de estados al
     adaptador nuevo.
4. **Adaptador de entrada** `src/server/whatsapp-zernio/ingest.ts`: normalizador
   **puro** (como `normalizeZernioTiktokEvent`) que convierte el evento en lo que
   consume `ingestInboundMessage`:
   - Identidad: `ResolvedIdentity` con teléfono normalizado (la misma
     `normalizeMx` de hoy), `waUserId` = `businessScopedUserId`, `profileName`.
   - `waMessageId` = `platformMessageId` (respaldo `wz_<id>`); `timestamp` =
     `zernioSentAtSeconds(sentAt)`; `threadRef` = `conversationId`.
   - Partes: texto; imagen, audio, documento y sticker como adjuntos remotos con
     origen nuevo `zernio-whatsapp`; ubicación y contacto como partes
     estructuradas (`kind: "location" | "contacts"`) con el mismo formato que la
     ingesta de Meta; cita en `replyToWaMessageId`.
   - Estados: `message.sent|delivered|read|failed` → `WebhookStatus` →
     `applyStatusUpdate` (monótono). `message.sent` con `source: cloud_api` solo
     confirma. `failed` traduce el código con `lib/meta/send-errors.ts`.
5. **Descarga con credencial.** `src/server/inbox/remote-media.ts`: `OrigenRemoto`
   gana `zernio-whatsapp`; `urlDeAdjuntoPermitida` acepta solo `https` a
   `zernio.com` para ese origen. `src/server/inbox/descarga-remota.ts`:
   `descargarAdjuntoRemoto` acepta un `token` opcional que se manda como
   `Authorization` **solo si el host final es `zernio.com`**, y rechaza
   cualquier redirección a otro host. Verifica `sha256` si viene.
6. **Adaptador de salida** `src/server/whatsapp-zernio/send.ts`: `sendZernioMessage`
   (ya existe, solo texto) gana adjunto por subida `multipart` (campo
   `attachment`), `reply_to`, `location` y `contacts`; devuelve el `wamid`.
   `Idempotency-Key` con el id local del envío.
7. **Envío en el núcleo.** `src/server/inbox/send.ts`: `prepareSend` consulta
   `getWhatsappSource`; con `zernio` arma el destino `whatsappZernio` (credenciales,
   `channelThreadRef` como `conversationId`) **después** de la aserción de
   `is_test` y de la ventana de 24 h, y **antes** de pedir credenciales de Meta.
   `sendText`, `sendMediaMessage` y `sendStructured` ganan la rama; los fallos se
   traducen al `SendError` existente (`isAuthError` → `reconnect_required`;
   0/5xx → `meta_unavailable`).
8. **Capacidades por fuente.** `src/server/channels/capabilities.ts`:
   `capabilitiesFor` gana la fuente de WhatsApp. Con Zernio: acuses sí, medios sí,
   citas sí, estructurados sí (verificados); lo que no tenga camino no se ofrece.
9. **Webhook.** `src/app/api/webhooks/wa/[webhookToken]/route.ts`: lee el cuerpo y
   decide Meta o Zernio por su forma (`looksLikeMetaPayload`), como `ig`; usa
   `recibirEvento` (spec 047) para guardar antes de contestar 200.
10. **Ajustes.** `src/app/api/settings/whatsapp-zernio/route.ts`;
    `src/components/settings/whatsapp-zernio-client.tsx` y la opción «Por Zernio»
    en `src/app/(app)/settings/whatsapp/page.tsx` / `whatsapp-wizard.tsx`, solo con
    la bandera. Reutiliza `resolveZernioAccount` y `zernio-connect.tsx`.
11. **Plantillas (entrega 2).** `src/server/whatsapp/templates.ts`: `createTemplate`,
    `syncTemplates`, `applyTemplateStatusEvent` y `sendTemplate` ganan la rama de
    Zernio; los dos llamadores de `sendTemplate`
    (`conversations/[id]/messages/template` y `contacts/[id]/start-conversation`) no
    cambian. El envío usa `POST /v1/inbox/conversations` con `templateParams` y
    guarda el `conversationId`.
12. **Simulador.** `src/server/dev/zernio-mock-state.ts` y
    `src/app/api/dev/zernio-mock/[...path]/route.ts` aprenden WhatsApp:
    conversaciones, mensajes, medios (con 401 sin llave), acuses fuera de orden,
    plantillas, y caminos infelices (llave muerta, 5xx, límite por destinatario).

## Project Structure

```text
src/lib/env.ts, src/lib/db/schema.ts, drizzle/0033_whatsapp_por_zernio.sql
src/server/whatsapp-zernio/{credentials,ingest,send,source}.ts
src/server/zernio/{cuentas,conexiones,webhooks,dispatch,index}.ts
src/server/inbox/{send,remote-media,descarga-remota}.ts
src/server/channels/{capabilities,enabled}.ts
src/server/whatsapp/templates.ts            (entrega 2)
src/server/dev/zernio-mock-state.ts, src/app/api/dev/zernio-mock/[...path]/route.ts
src/app/api/webhooks/wa/[webhookToken]/route.ts
src/app/api/settings/whatsapp-zernio/route.ts, src/app/api/health/route.ts
src/app/(app)/settings/whatsapp/page.tsx
src/components/settings/{whatsapp-zernio-client,whatsapp-wizard}.tsx
tests/unit/whatsapp-zernio*.test.ts (+ capacidades, descarga, dispatch, contrato)
tests/e2e/us-whatsapp-zernio.md, scripts/e2e-whatsapp-zernio.mjs
.github/workflows/ci.yml, .env.example, AGENTS.md, README.md, CHANGELOG.md, specs/README.md
```

## Orden de implementación

Cada paso termina con `pnpm typecheck`, `pnpm lint` y `pnpm test` en verde antes
del siguiente; el E2E se corre al final de cada entrega.

1. **Datos y bandera:** esquema, migración, `credentials.ts`, `getWhatsappSource`,
   `WHATSAPP_ZERNIO`.
2. **Entrada:** normalizador puro con pruebas primero (los eventos reales del
   sandbox, sin datos personales, son los casos), descarga con credencial y
   reparto de Zernio.
3. **Estados:** conversión a `applyStatusUpdate` y orden aleatorio en las pruebas.
4. **Salida:** `send.ts`, rama en `prepareSend` y capacidades por fuente.
5. **Superficie:** webhook, ajustes, UI y `health`.
6. **Simulador y E2E** de la entrega 1; documentación.
7. **Entrega 2 (plantillas)**, solo después de confirmar con un número real la
   forma de crear, listar y el evento de estado; mismo esquema (pruebas, E2E).

## Verificación

- Los cuatro gates (`typecheck`, `lint`, `test`, `build`) en las dos
  configuraciones del CI; `ci.yml` añade `WHATSAPP_ZERNIO` a la configuración
  `completo`.
- `scripts/e2e-whatsapp-zernio.mjs` contra el simulador: camino feliz (conectar,
  recibir cada tipo, responder, acuses fuera de orden) e infelices (firma mala,
  llave muerta, Zernio caído, descarga con 401, host distinto de `zernio.com`,
  reentrega, límite por destinatario). Los E2E existentes (`e2e-tiktok`,
  `e2e-messenger`, `e2e-despacho` y el selftest) siguen en verde.
- Migración aplicada sobre una base en `0032` y sobre una vacía.
- En vivo: lo cubierto el 2026-11-25 contra el sandbox y lo **pendiente de
  verificación humana** están en el Constitution Check de la spec.
