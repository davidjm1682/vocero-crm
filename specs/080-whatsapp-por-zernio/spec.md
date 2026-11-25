# 080 — WhatsApp por Zernio

**Feature Branch**: `feat/080-whatsapp-por-zernio`

**Created**: 2026-11-25

**Status**: Especificada antes de escribir código. Parte de lo que Zernio entrega
se **verificó en vivo** en su sandbox el 2026-11-25 (ver «Lo verificado»); lo que
no se pudo verificar queda marcado **«pendiente de verificación humana»** y se
cierra con un número real.

**Input**: decisión del dueño del despliegue (2026-11-25): que un negocio pueda
usar WhatsApp **sin registrar ni verificar una app propia en Meta**, conectando
su número a través de Zernio, el mismo transporte que ya usan Instagram,
Messenger y TikTok. Moldes: [014](../014-canal-instagram/spec.md),
[017](../017-canal-messenger/spec.md), [022](../022-canal-tiktok/spec.md) y
[030](../030-secreto-zernio-cifrado/spec.md).

**Carril**: ciclo completo (Principio VI). Toca el modelo de datos (tabla
`whatsapp_zernio_credentials`, migración `0033`) y un contrato publicado: la ruta
`/api/webhooks/wa/<token>` pasa a aceptar también eventos de Zernio. Plan en
[plan.md](plan.md), tareas en [tasks.md](tasks.md).

## Problema

Conectar WhatsApp a Vocero con Meta directo exige una app de Meta propia con
Facebook Login for Business y su verificación, un trámite de semanas que
frena a quien instala Vocero para un negocio pequeño. Zernio ya hace de
proveedor de acceso a la API de WhatsApp (Cloud API) y su flujo de conexión
(Embedded Signup alojado en zernio.com) no pide app propia. Hoy Vocero lo usa
para Instagram, Messenger y TikTok, pero **excluye WhatsApp a propósito**: un
evento de WhatsApp que llega de Zernio se descarta en silencio.

## Lo que Zernio entrega (verificado en el sandbox, 2026-11-25)

No son decisiones nuestras; son las formas reales con las que hay que trabajar.

- **Identidad.** `message.sender.id` es el teléfono **sin `+`**. Además llegan
  `phoneNumber` (con `+`), `name` (perfil) y `businessScopedUserId` (el BSUID,
  formato `CL.<dígitos>`).
- **Ids.** Cada mensaje trae `message.id` (de Zernio) y `message.platformMessageId`
  (el `wamid`). Lo que devuelve cada llamada de envío es **ese mismo `wamid`**, y
  los acuses (`message.sent`, `message.delivered`, `message.read`) lo traen.
- **Estados.** Los acuses llegan **fuera de orden** y con latencia de 1 a 4 s
  (una vez, 15 s). `message.failed` lleva el código de error de Cloud API.
- **Entrantes.** Texto; botón de plantilla (`metadata.buttonPayload`); respuesta
  citada (`metadata.quotedMessageId` y `quotedMessage`); imagen, nota de voz
  (`audio/ogg; codecs=opus`, `payload.voice: true`) y documento (`payload.filename`)
  como `attachments[]` con `payload { id, mimeType, sha256 }`; **ubicación** en
  `metadata.location { latitude, longitude }` (el `text` es solo un resumen);
  **contacto** en `metadata.contacts[] { name, phones[], vcard, origin }`.
- **Medios.** La `url` de un adjunto es `https://zernio.com/api/v1/whatsapp/media/<id>?accountId=<cuenta>`
  y **responde 401 sin credenciales**: no es un enlace público temporal.
- **Salida.** Conversación-céntrica: `POST /v1/inbox/conversations/{conversationId}/messages`
  para texto libre dentro de 24 h y `POST /v1/inbox/conversations` (con
  `templateName`, `templateLanguage`, `templateParams` plano) para abrir o
  reabrir. Probados y aceptados: plantilla, texto, cita (`reply_to` = `wamid`),
  imagen y documento por URL pública, ubicación y contacto.
- **Firma.** `X-Zernio-Signature` = HMAC-SHA256 hex del cuerpo crudo; coincidió
  en todas las entregas reales. `X-Zernio-Event-Id` es el `id` del evento.
- **Límites que impone Zernio.** Máximo 50 webhooks por usuario; error `131056`
  por demasiados mensajes seguidos al mismo destinatario; un número nuevo tiene
  un tope diario de contactos únicos; WhatsApp no admite editar ni borrar por
  esta API.

### No verificado (pendiente de verificación humana)

| Qué | Por qué | Cómo se cierra |
|---|---|---|
| Reacción entrante (`reaction.received`) | En el sandbox llegó como texto y como respuesta citada, nunca como reacción | Número real |
| Subida `multipart` de un adjunto privado | Requería la llave de Zernio en un script | Una cuenta de prueba propia |
| `Idempotency-Key` en envíos de WhatsApp | Misma razón | Una cuenta de prueba propia |
| Plantillas propias: crear, listar, evento de estado | El sandbox solo tiene una plantilla bloqueada | Número real conectado |
| Nota de voz saliente (`voice_note`, `.ogg` OPUS mono) | Requería un archivo OPUS | Cuenta de prueba |
| Atribución de anuncios (`adAttribution`) | En el sandbox viene `null` | Un anuncio real de clic a WhatsApp |
| Forma de `message.failed` (dónde viene el código y el motivo) | Nunca llegó uno en el sandbox; el código lo busca en `error(s)` del evento y del mensaje | Provocar un fallo real (p. ej. fuera de ventana) y mirar la entrega |
| Formato del `sha256` de un adjunto (hex o base64) | El código acepta los dos | Una imagen real |
| Una entrega de acuse que llega antes de guardarse el mensaje saliente | El acuse se ignora (igual que con Meta) | Medir con un envío real; si pasa, guardar el acuse |

## Decisiones

- **D1 — Una fuente de WhatsApp por organización: Meta o Zernio.** Tabla propia
  `whatsapp_zernio_credentials`, aditiva (migración `0033`), con la forma de
  `tiktok_credentials`. `meta_credentials` **no se toca**: su `waba_id` y
  `phone_number_id` son obligatorios y únicos, y relajarlos arriesgaría a las
  instancias que ya funcionan. Conectar una fuente exige que la otra no esté
  conectada.
- **D2 — Conector opcional (ADR-001).** Apagado por defecto: lo enciende
  `WHATSAPP_ZERNIO=on`. Apagado, la opción «Por Zernio» de Ajustes y la API de
  configuración no existen para el usuario (404); la migración se aplica igual
  (tabla vacía). WhatsApp sigue siendo, por defecto, directo con Meta.
  *Precisión añadida al implementar (2026-11-25):* la bandera gobierna la
  **superficie de configuración**, no el **tráfico**. Si una instancia ya tiene
  su WhatsApp conectado por Zernio y alguien apaga la bandera, sus mensajes no se
  pierden en silencio: la recepción y el envío siguen funcionando hasta que el
  dueño desconecte (una acción explícita). Lo contrario —cortar el tráfico por
  cambiar una variable— perdería mensajes de clientes y contradice el Principio
  II.3 («nunca bloquea ni pierde la operación core»). Una instancia por defecto
  tiene la tabla vacía, así que no carga ni pide nada.
- **D3 — La cuenta de Zernio es la del propio negocio** (decisión del dueño,
  2026-11-25). Cada instancia guarda **su** llave y **su** cuenta de WhatsApp en
  Zernio; Vocero no usa credenciales de una plataforma central (Principio II.4).
  Efecto colateral deseado: el límite de 50 webhooks es por usuario de Zernio, así
  que no se acumula entre negocios.
- **D4 — Misma identidad que Meta directo.** El contacto se identifica por el
  teléfono normalizado y guarda el BSUID como `waUserId`, exactamente como hoy.
  Una organización que pasa de Meta a Zernio **conserva sus contactos y
  conversaciones**.
- **D5 — El id del mensaje es el `wamid`.** `waMessageId = platformMessageId`; si
  falta, `wz_<id de Zernio>`. Así los acuses, las citas y la deduplicación usan la
  misma clave que en Meta directo.
- **D6 — La ventana y las plantillas siguen siendo las de WhatsApp:** 24 h desde
  el último entrante, y fuera de ella solo una plantilla aprobada. La hora del
  entrante sale de `sentAt`, no de la hora de llegada (una reentrega tardía no
  reabre la ventana; mismo principio que 017).
- **D7 — Las capacidades de WhatsApp dependen de la fuente.** Con Zernio:
  acuses de entrega sí, medios salientes sí, citas sí, ubicación y contactos sí
  (verificados). Todo lo demás que el compositor ofrece hoy para WhatsApp sigue
  igual con Meta y **no se ofrece** con Zernio hasta que exista su camino.
- **D8 — Estados por el camino que ya existe.** Los acuses de Zernio se
  convierten al estado que consume `applyStatusUpdate`, que no degrada nunca un
  estado (`delivered` tardío no pisa `read`). Un `failed` lleva el error de Cloud
  API traducido por el mismo código que Meta directo.
- **D9 — Los medios entrantes se bajan con la llave del negocio.** La descarga
  remota gana un modo con credencial restringido al host `zernio.com` por `https`,
  sin seguir redirecciones a otros hosts, con los topes por tipo de siempre y con
  verificación del `sha256` cuando viene. Un adjunto que no baja entra con su tipo
  (spec 074).
- **D10 — Una URL de webhook para las dos fuentes**, como Instagram, Messenger y
  TikTok. En `/api/webhooks/wa/<token>`, un cuerpo con `object:
  "whatsapp_business_account"` es de Meta (firma de Meta); uno con `account` es de
  Zernio (firma `X-Zernio-Signature`). El reparto de Zernio reconoce la plataforma
  `whatsapp`. El webhook de Zernio de la instancia se suscribe a los eventos extra
  **solo si WhatsApp por Zernio está conectado**.
- **D11 — Plantillas (segunda entrega): viven en Zernio.** Sincronizar, crear,
  seguir su estado y enviar usan la API de plantillas y de conversaciones de
  Zernio. El envío usa `templateParams` en orden; el `conversationId` devuelto se
  guarda como hilo de la conversación. Las formas exactas de crear y listar se
  confirman con un número real antes de implementar esa parte.
- **D12 — Los contactos compartidos no prueban el número del remitente.** Un
  contacto con `origin: "other"` es una tarjeta elegida de la agenda; no se usa
  para completar el teléfono de nadie.

## Alcance

**Entra (entrega 1)**: tabla y credenciales cifradas; Ajustes → WhatsApp → «Por
Zernio» con llave probada y webhook dado de alta; recepción con firma, dedupe y
hora real; texto, imagen, nota de voz, documento, ubicación, contacto y cita
entrantes; descarga de medios con la llave; envío de texto, adjuntos, cita,
ubicación y contacto; acuses; estados; capacidades por fuente; simulador de
Zernio ampliado; arnés E2E.

**Entra (entrega 2)**: plantillas (sincronizar, crear, estado, enviar) por Zernio.

**Fuera de alcance a propósito**:

| Qué | Por qué no |
|---|---|
| Reacciones de WhatsApp por Zernio | No verificado (arriba); hoy `registrarReaccionZernio` solo atiende Instagram y Messenger |
| Mensajes editados y borrados | El sandbox no los ejerció; Meta los envía solo en coexistencia |
| Número con coexistencia (eco de la app de WhatsApp Business) | `message.sent` con otro `source` exige su propia spec |
| Mensajes interactivos salientes (botones, listas, CTA) y sus respuestas | Otro producto; el compositor no los ofrece |
| Atribución de anuncios | `adAttribution` no verificado con un anuncio real |
| Conectar el número desde dentro de Vocero (enlace `signup=hosted`) | Hoy el dueño lo conecta en Zernio y pega la llave; automatizarlo es otra spec |
| Direct Send (`category: utility`, utilidad sin plantilla) | Depende de la elegibilidad de cada cuenta |
| Pasar a una organización de Meta a Zernio sin desconectar | D1: una fuente a la vez |

## Comportamiento observable

### Historia 1 — Conectar (P1)

- **AC1** Con `WHATSAPP_ZERNIO=on`, Ajustes → WhatsApp ofrece conectar «Por
  Zernio»: el dueño pega la llave de su cuenta de Zernio y, si tiene varias
  cuentas de WhatsApp, elige cuál. La llave se prueba contra Zernio antes de
  guardar; una llave mala no se guarda. Hacia fuera solo viajan sus últimos 4.
- **AC2** Al guardar, Vocero da de alta (o actualiza) el webhook en Zernio con
  los eventos que necesita, limitado a las cuentas de esa organización. Si Zernio
  falla en ese momento, la conexión queda guardada y la pantalla dice cómo
  reintentar (Ajustes → Estado); guardar nunca falla por eso.
- **AC3** Una organización con WhatsApp por Meta no puede guardar la conexión de
  Zernio sin desconectar Meta, ni al revés, con un mensaje que lo explica.
- **AC4** Con la bandera apagada, la opción «Por Zernio» y
  `/api/settings/whatsapp-zernio` responden 404 o no existen, y `/api/health`
  dice `features.whatsappZernio: false`. Una conexión ya guardada **sigue
  recibiendo y enviando** (D2).
- **AC5** Solo el dueño conecta o desconecta.

### Historia 2 — Recibir (P1)

- **AC6** Un `message.received` de WhatsApp firmado entra a la bandeja como
  conversación de WhatsApp, con el contacto identificado por teléfono y el nombre
  del perfil, y con su BSUID como `waUserId`.
- **AC7** Firma inválida → 401 y nada se guarda. Segmento de la URL equivocado →
  404. Sin secreto configurado, protege solo el segmento.
- **AC8** El mismo evento entregado dos veces no se duplica. Una reentrega
  tardía no reabre la ventana de 24 h (la hora es la de `sentAt`).
- **AC9** Imagen, nota de voz, documento (con su nombre), ubicación y contacto
  entran con su tipo y contenido. Los medios se descargan con la llave del negocio
  **solo desde `zernio.com`**, se comprueba su `sha256` y quedan en `MEDIA_DIR`.
  Un adjunto que no se puede bajar entra con su tipo y el aviso de siempre.
- **AC10** Una respuesta citada guarda la cita contra el mensaje original.
- **AC11** Un evento de otra plataforma, de una cuenta no conectada o que no
  corresponde a un mensaje o estado se descarta sin efectos.
- **AC12** El `message.sent` de un envío hecho por Vocero **no** crea un mensaje
  duplicado: confirma el que ya existe.
- **AC13** Un contacto con `origin: "other"` llega como tarjeta y no cambia el
  teléfono del remitente.

### Historia 3 — Responder (P1)

- **AC14** El operador, el agente incluido o un cerebro externo responden por
  `POST /api/conversations/{id}/messages` y `POST /api/bot/messages`; el texto
  llega a Zernio dentro de la conversación de ese cliente.
- **AC15** Pasadas 24 h del último entrante, el envío libre se rechaza con
  `window_closed` y el texto de siempre («usa una plantilla aprobada»).
- **AC16** Imagen, video, audio, documento y nota de voz salen por subida directa
  desde el almacenamiento privado de Vocero, con los límites por tipo de siempre.
- **AC17** Una respuesta con cita, una ubicación y un contacto salen como con
  Meta directo.
- **AC18** Un texto de más de 4,096 caracteres se rechaza como hoy (422).
- **AC19** Llave muerta (401): la conexión pasa a `reconnect_required` y la
  pantalla pide reconectar. Zernio caído (sin respuesta o 5xx): el mensaje queda
  guardado como `failed` y visible, nunca se pierde.
- **AC20** Un reintento del mismo envío no lo manda dos veces.

### Historia 4 — Estados (P1)

- **AC21** Un mensaje enviado pasa de `pending` a `sent`, `delivered` y `read`, y
  **nunca retrocede**, aunque los acuses lleguen fuera de orden.
- **AC22** Un envío rechazado muestra `failed` con el motivo traducido (por
  ejemplo, destinatario sin WhatsApp o demasiados mensajes seguidos).

### Historia 5 — Plantillas (P2, entrega 2)

- **AC23** «Sincronizar» trae las plantillas de la cuenta de Zernio que Vocero
  sabe enviar, con su estado.
- **AC24** Crear una plantilla desde Vocero la manda a Zernio y queda `pending`;
  el evento de estado la pasa a `approved` o `rejected` con el motivo.
- **AC25** Enviar una plantilla aprobada abre o reabre la conversación, tanto
  desde «Empezar conversación» como desde una conversación con la ventana
  cerrada. Las variables del cuerpo van en orden y el `conversationId` devuelto se
  guarda.
- **AC26** Faltan variables o la plantilla no está aprobada → error como hoy,
  antes de llamar a Zernio.
- **AC27** El tope diario de contactos nuevos de un número recién conectado se
  muestra con su motivo y con qué lo arregla.

### Historia 6 — Convivir (P1)

- **AC28** WhatsApp por Meta directo, Instagram, Messenger y TikTok entran y
  salen igual que antes, y sus pruebas siguen en verde.
- **AC29** El Laboratorio no toca ninguna API real, tampoco la de Zernio.
- **AC30** Una instalación 2.12 actualiza redesplegando: `0033` crea una tabla
  vacía.
- **AC31** Una organización que pasa de Meta a Zernio conserva sus contactos y
  conversaciones (D4).

## Requisitos no funcionales

- La llave de Zernio y el secreto de firma se cifran en reposo (AES-256-GCM) con
  las mismas funciones que los demás canales, y no salen a logs ni a respuestas.
- El webhook guarda el evento y contesta 200 de inmediato; el procesamiento corre
  fuera de la ruta (spec 047). Zernio reintenta 7 veces en unas 51 h.
- La firma se compara en tiempo constante, con la única implementación que ya
  comparten los canales por Zernio.
- La descarga con credencial nunca envía la llave a un host distinto de
  `zernio.com` ni sigue una redirección que salga de él.
- Los eventos pueden llegar fuera de orden y con latencia variable; ningún
  resultado depende del orden de llegada.

## Constitution Check

| Principio | Evaluación |
|---|---|
| I · Seguridad | Llave y secreto cifrados; segmento secreto + firma HMAC por cuenta; solo el dueño conecta; la llave solo viaja a `zernio.com`; nada de secretos en logs. |
| II · Soberanía | Zernio es un tercero y entra como **conector opcional** bajo las cinco condiciones: (1) apagado por defecto (`WHATSAPP_ZERNIO`); (2) aislado en `src/server/whatsapp-zernio/` + `src/server/zernio/`, el dominio no conoce al proveedor; (3) **la instancia funciona completa sin él**: WhatsApp directo con Meta es el camino por defecto y, si Zernio falla, el mensaje queda `failed` y visible, sin bloquear nada más; (4) **credenciales del propio negocio**: cada instancia guarda su llave y su cuenta de Zernio; no hay llave central; (5) verificable apagado y encendido: el CI corre ambas configuraciones y el simulador de Zernio cubre el camino infeliz. |
| III · Multi-tenancy | `organization_id` NOT NULL en `whatsapp_zernio_credentials`; toda consulta por `scoped()`; el webhook enruta por `account_ref` a su organización. |
| IV · Idempotencia | Dedupe por `wamid` en el índice único de mensajes; los acuses son idempotentes por ser monótonos; migración aditiva y re-ejecutable. |
| V · Hecho | Unitarias del normalizador, la firma, el reparto, la elección de fuente, la descarga con credencial, el mapeo de estados y las capacidades; arnés E2E contra el simulador; los cuatro gates en las dos configuraciones del CI. |
| VI · Specs | Ciclo completo: tabla nueva y contrato del webhook tocado. |
| VII · Trazabilidad | «Lo verificado» y «No verificado» dejan por escrito qué se observó y qué se supone. |
| VIII · Foco | El producto sigue siendo un CRM de conversaciones de WhatsApp; esto cambia **cómo** se conecta el número, no qué hace. |
| IX · En vivo | Parcialmente cubierto el 2026-11-25 contra el sandbox de Zernio (texto, citas, estados, medios, ubicación, contactos, firma). Pendiente de verificación humana lo de la tabla «No verificado», que exige una cuenta de prueba y un número real. |
| Contratos públicos | `/api/webhooks/wa/<token>` acepta además el cuerpo de Zernio; nada se quita ni se renombra. `/api/bot/*`, SSE y el despacho no cambian de forma. |
| Sandbox | La aserción de `is_test` sigue antes de la bifurcación por fuente. |

Sin violaciones.
