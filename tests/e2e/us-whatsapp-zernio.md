# E2E — WhatsApp por Zernio (080)

Arnés: `scripts/e2e-whatsapp-zernio.mjs`. Spec:
[`specs/080-whatsapp-por-zernio/spec.md`](../../specs/080-whatsapp-por-zernio/spec.md).

Precondición: app corriendo (`next dev`) sobre una base migrada (hasta la
`0033`), con mocks (`WA_MOCK_ENABLED=true`, `ZERNIO_BASE_URL` → zernio-mock,
`META_GRAPH_BASE_URL` → wa-mock) y **`WHATSAPP_ZERNIO=on`**. No hace falta
agente ni cerebro: se prueba la entrada, la salida y los acuses.

El arnés hace de **Zernio**: entrega eventos `message.received` y los acuses
`message.sent|delivered|read|failed` con la forma observada en el sandbox
(2026-11-25), firmados con el secreto del webhook (`x-zernio-signature`,
HMAC-SHA256 en hex del cuerpo crudo), y lee del simulador lo que el CRM le
mandó (`GET /api/dev/zernio-mock/_sent`). El simulador responde **401** a quien
pida un adjunto sin la llave, como el real.

```bash
node --env-file=.env scripts/e2e-whatsapp-zernio.mjs
```

## Conectar

1. `PUT /api/settings/whatsapp-zernio` con una llave que Zernio rechaza → 422
   `invalid_token`, y no se guarda. Con una buena → 200. `GET` enseña la
   cuenta, `status = connected` y solo los últimos 4 de la llave; ni la llave
   ni el secreto salen.
2. Se da de alta el webhook en Zernio, limitado a esa cuenta, hacia
   `/api/webhooks/wa/<token>`, con `message.received` y los cuatro acuses.
3. Con Zernio conectado, `PUT /api/settings/whatsapp` (Meta) → 409
   `source_conflict`: una organización tiene una sola fuente.

## Entrada

4. Segmento equivocado → 404. Firma inválida → 401. Ninguno deja nada en la
   bandeja.
5. Firma válida → 200; la conversación aparece con el nombre del perfil, canal
   `whatsapp` y el texto del cliente. La misma entrega otra vez → un solo
   entrante.
6. Una imagen se baja con la llave de Zernio y la bandeja la sirve. Una cuyo
   `sha256` no coincide queda como fallida y el mensaje se conserva.
7. Una ubicación entra con sus coordenadas; un contacto compartido entra como
   tarjeta y su teléfono **no** crea ni cambia contactos.
8. Un evento de otra plataforma conectada a la misma llave no entra.

## Acuses

9. El mensaje del operador nace `pending` y llega a Zernio con la cuenta y una
   `Idempotency-Key`. `read`, `delivered` y `sent` en desorden → `read`; un
   `delivered` tardío no lo baja.
10. Un `message.failed` con el código 131047 deja el mensaje `failed` con el
    motivo traducido («24 h»).

## Salida

11. Responder citando → Zernio recibe `replyTo` con el `wamid` del citado.
12. Ubicación y contacto salen con su forma. Un archivo sale por
    `multipart/form-data` (campo `attachment`) con su tipo y su pie.

## Límites y fallos

13. Fuera de las 24 horas → 409 `window_closed`, con el motivo dicho para Zernio
    (sin plantillas por ahora), y sin llamar a Zernio.
14. Zernio caído → 503 `meta_unavailable`. Llave revocada → `reconnect_required`,
    la conexión pide reconectar y los envíos se detienen; pegar una llave nueva
    reconecta y se vuelve a poder enviar.
15. Desconectar → la conexión desaparece y los mensajes guardados se conservan.

## Por verificar con una cuenta real (T028)

El simulador no prueba lo que solo Zernio sabe: el formato real del `sha256`,
la forma de `message.failed`, el adjunto por `multipart`, `Idempotency-Key`,
`reaction.received` y, en la entrega 2, las plantillas. Ver la spec,
«No verificado».
