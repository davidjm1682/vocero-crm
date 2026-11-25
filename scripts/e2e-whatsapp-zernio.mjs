/**
 * Self-test E2E de comportamiento — 080: WhatsApp por Zernio.
 *
 * Conduce la app real con los mocks: conecta la cuenta de Zernio del negocio,
 * mete mensajes por el webhook como lo haría Zernio (firmados), comprueba que
 * entran a la bandeja (texto, imagen con descarga autenticada, ubicación,
 * contacto compartido), que los acuses desordenados no degradan el estado, y
 * que lo que el operador manda sale por la conversación de Zernio (texto, cita,
 * ubicación, contacto, archivo por multipart). Empuja también los caminos
 * infelices: segmento y firma malos, llave muerta, ventana cerrada, exclusión
 * con Meta.
 *
 * Uso: app corriendo (`pnpm dev`) sobre una base migrada, con
 *   WA_MOCK_ENABLED=true, WHATSAPP_ZERNIO=on, ZERNIO_BASE_URL → zernio-mock,
 *   META_GRAPH_BASE_URL → wa-mock, y luego
 *   node --env-file=<env> scripts/e2e-whatsapp-zernio.mjs
 * Sale con código 1 si algún check falla. Guion: tests/e2e/us-whatsapp-zernio.md.
 */
import { createHash, createHmac } from "node:crypto";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";
const ACCOUNT = "zernio-wa-001";
const SECRET = "secreto-del-webhook-de-zernio";
const RUN = Date.now().toString(36);
const MARCA = `#${RUN}`;
const HORA = 60 * 60 * 1000;
const MOCK = `${BASE}/api/dev/zernio-mock`;

let cookie = "";
let failures = 0;
let checks = 0;

function ok(name, cond, extra = "") {
  checks++;
  if (cond) console.log(`  OK  ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      ...(opts.body instanceof FormData ? {} : { "content-type": "application/json" }),
      origin: BASE,
      ...(cookie ? { cookie } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  let json = null;
  try {
    json = await res.clone().json();
  } catch {}
  return { res, json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera a que algo OCURRA, en vez de dormir un rato y confiar. */
async function hasta(cond, ms = 15000, paso = 200) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await cond();
    if (v) return v;
    if (Date.now() > fin) return null;
    await sleep(paso);
  }
}

// ---------------------------------------------------------------------------
// Zernio de mentira: lo que entrega y lo que recibió
// ---------------------------------------------------------------------------

let nEvento = 0;
const TELEFONO = (n) => `5690000${String(n).padStart(4, "0")}`;

/** Un `message.received` de WhatsApp con la forma observada en el sandbox. */
function recibido({ telefono, nombre, text, hilo, sentAt, attachments = [], metadata = {} }) {
  nEvento++;
  return {
    id: `evt-wa-${RUN}-${nEvento}`,
    event: "message.received",
    message: {
      id: `zmsg-wa-${RUN}-${nEvento}`,
      conversationId: hilo,
      platform: "whatsapp",
      platformMessageId: `wamid.IN${RUN}${nEvento}`,
      direction: "incoming",
      text: text ?? null,
      attachments,
      sender: {
        id: telefono,
        phoneNumber: `+${telefono}`,
        name: nombre,
        businessScopedUserId: `CL.${telefono}`,
      },
      sentAt: (sentAt ?? new Date()).toISOString(),
    },
    conversation: { id: hilo, status: "active" },
    account: { id: ACCOUNT, accountId: ACCOUNT, platform: "whatsapp" },
    metadata,
  };
}

/** Un acuse de envío (`message.sent|delivered|read|failed`). */
function acuse(evento, wamid, extra = {}) {
  nEvento++;
  return {
    id: `evt-wa-${RUN}-${nEvento}`,
    event: evento,
    message: {
      id: `zmsg-out-${RUN}-${nEvento}`,
      platform: "whatsapp",
      platformMessageId: wamid,
      direction: "outgoing",
      statusAt: new Date().toISOString(),
    },
    account: { id: ACCOUNT, accountId: ACCOUNT, platform: "whatsapp" },
    ...extra,
  };
}

/** Entrega un evento a la URL de WhatsApp, firmado como lo firma Zernio. */
async function entregar(payload, { token = VERIFY_TOKEN, firma } = {}) {
  const cuerpo = typeof payload === "string" ? payload : JSON.stringify(payload);
  const res = await fetch(`${BASE}/api/webhooks/wa/${token}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-zernio-signature": firma ?? createHmac("sha256", SECRET).update(cuerpo).digest("hex"),
      "x-zernio-event-id": typeof payload === "object" ? payload.id : "sin-id",
    },
    body: cuerpo,
  });
  return res.status;
}

const mock = (ruta, body) =>
  fetch(`${MOCK}/${ruta}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

const enviadosPorZernio = async (hilo) =>
  ((await (await fetch(`${MOCK}/_sent`)).json()).sent ?? []).filter((m) => m.conversationId === hilo);

const conversaciones = async () => (await api("/api/conversations")).json?.conversations ?? [];
const convDe = (nombre) =>
  hasta(async () => (await conversaciones()).find((c) => c.contact.name === nombre && c.lastInboundAt !== null));
const mensajesDe = async (convId) => (await api(`/api/conversations/${convId}/messages`)).json?.messages ?? [];
const enviar = (convId, body) =>
  api(`/api/conversations/${convId}/messages`, { method: "POST", body: JSON.stringify(body) });
const estadoDe = async (convId, id) => (await mensajesDe(convId)).find((m) => m.id === id);

// ---------------------------------------------------------------------------

async function main() {
  console.log("== Setup ==");
  const email = "e2e@vocero.test";
  const password = "password-e2e-123";
  let su = await api("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Operador E2E" }),
  });
  if (!su.res.ok) {
    su = await api("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password }) });
  }
  ok("registro o login del operador", su.res.ok, JSON.stringify(su.json));

  const salud = await (await fetch(`${BASE}/api/health`)).json();
  if (salud?.features?.whatsappZernio !== true) {
    console.error("WHATSAPP_ZERNIO no está encendida: arranca la app con WHATSAPP_ZERNIO=on.");
    process.exit(1);
  }
  ok("/api/health anuncia la característica", salud.features.whatsappZernio === true);

  // Una organización tiene UNA fuente de WhatsApp: si otro guion dejó Meta
  // conectado (o una corrida anterior dejó Zernio), se parte de cero.
  await api("/api/settings/whatsapp", { method: "DELETE" });
  await api("/api/settings/whatsapp-zernio", { method: "DELETE" });
  ok("se parte sin ninguna fuente de WhatsApp", (await api("/api/settings/whatsapp-zernio")).json?.connection === null);

  await mock("_reset");
  await mock("_accounts", {
    accounts: [
      { _id: ACCOUNT, platform: "whatsapp", username: "+56 9 0000 0000", displayName: "Negocio demo", isActive: true, platformStatus: "active" },
    ],
  });
  await mock("_webhooks", { webhooks: [] });

  await conectar();
  const hilo = await entrada();
  if (hilo) {
    await acuses(hilo);
    await salida(hilo);
    await ventana();
    await llaveMuerta(hilo);
  }
  await desconectar();

  console.log(`\n${checks - failures}/${checks} checks en verde`);
  process.exit(failures > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------

async function conectar() {
  console.log("\n== Conectar ==");
  const mala = await api("/api/settings/whatsapp-zernio", {
    method: "PUT",
    body: JSON.stringify({ accountRef: ACCOUNT, token: "sk_llave-invalid" }),
  });
  ok("una llave que Zernio rechaza → 422 invalid_token", mala.res.status === 422 && mala.json?.error?.code === "invalid_token", `${mala.res.status} ${JSON.stringify(mala.json)}`);
  ok("y no se guardó", !(await api("/api/settings/whatsapp-zernio")).json?.connection);

  const buena = await api("/api/settings/whatsapp-zernio", {
    method: "PUT",
    body: JSON.stringify({ accountRef: ACCOUNT, token: "sk_llave-whatsapp-demo", webhookSecret: SECRET }),
  });
  ok("una llave buena → 200", buena.res.ok, JSON.stringify(buena.json));
  const estado = await api("/api/settings/whatsapp-zernio");
  const con = estado.json?.connection;
  ok(
    "la conexión enseña la cuenta y solo la cola de la llave",
    con?.accountRef === ACCOUNT && con?.tokenLast4 === "demo" && con?.status === "connected" && con?.hasWebhookSecret === true,
    JSON.stringify(con)
  );
  const crudo = JSON.stringify(estado.json);
  ok("ni la llave ni el secreto salen en la respuesta", !crudo.includes("sk_llave-whatsapp-demo") && !crudo.includes(SECRET));

  const wh = ((await (await fetch(`${MOCK}/_state`)).json()).webhooks ?? []).find((w) => (w.accountIds ?? []).includes(ACCOUNT));
  ok("se dio de alta el webhook en Zernio, limitado a la cuenta", Boolean(wh), "sin webhook");
  ok(
    "con mensajes y con los cuatro acuses",
    ["message.received", "message.sent", "message.delivered", "message.read", "message.failed"].every((e) => wh?.events?.includes(e)),
    JSON.stringify(wh?.events)
  );
  ok("hacia la URL de WhatsApp de esta instancia", wh?.url?.endsWith(`/api/webhooks/wa/${VERIFY_TOKEN}`), String(wh?.url).replace(VERIFY_TOKEN, "<token>"));

  const meta = await api("/api/settings/whatsapp", {
    method: "PUT",
    body: JSON.stringify({ wabaId: "222", phoneNumberId: "111", token: "EAAG-meta-demo" }),
  });
  ok("con Zernio conectado, conectar Meta → 409 source_conflict", meta.res.status === 409 && meta.json?.error?.code === "source_conflict", `${meta.res.status} ${JSON.stringify(meta.json)}`);
}

// ---------------------------------------------------------------------------

async function entrada() {
  console.log("\n== Entrada: las dos capas del webhook ==");
  const nombre = `Wanda WhatsApp ${MARCA}`;
  const telefono = TELEFONO(Number.parseInt(RUN.slice(-4), 36) % 10000);
  const hilo = `zconv-wa-${RUN}`;
  const texto = `hola, ¿tienen turno? ${MARCA}`;
  const primero = recibido({ telefono, nombre, text: texto, hilo });

  ok("segmento equivocado → 404", (await entregar(primero, { token: "no-es-el-token" })) === 404);
  ok("firma inválida → 401", (await entregar(primero, { firma: "0".repeat(64) })) === 401);
  await sleep(1000);
  ok("y nada de eso llegó a la bandeja", !(await conversaciones()).some((c) => c.contact.name === nombre));

  console.log("\n== Entrada: un mensaje de texto ==");
  ok("firma válida → 200", (await entregar(primero)) === 200);
  const conv = await convDe(nombre);
  ok("la conversación aparece con el nombre del perfil", Boolean(conv));
  if (!conv) return null;
  ok("es del canal WhatsApp", conv.channel === "whatsapp", conv.channel);
  const entrantes = (await mensajesDe(conv.id)).filter((m) => m.direction === "in");
  ok("con el texto del cliente", entrantes.length === 1 && entrantes[0].text === texto, JSON.stringify(entrantes.map((m) => m.text)));

  console.log("\n== Entrada: la misma entrega dos veces no se duplica ==");
  ok("la reentrega responde 200", (await entregar(primero)) === 200);
  await sleep(1200);
  ok("sigue habiendo un solo entrante", (await mensajesDe(conv.id)).filter((m) => m.direction === "in").length === 1);

  console.log("\n== Entrada: imagen con descarga autenticada ==");
  const idImg = `img-${RUN}`;
  const bytes = Buffer.from(`ARCHIVO-DE-PRUEBA-${idImg}`);
  const imagen = recibido({
    telefono, nombre, hilo,
    attachments: [
      {
        type: "image",
        url: `${MOCK}/whatsapp/media/${idImg}?accountId=${ACCOUNT}`,
        payload: { id: idImg, mimeType: "image/jpeg", sha256: createHash("sha256").update(bytes).digest("hex") },
      },
    ],
  });
  ok("entra → 200", (await entregar(imagen)) === 200);
  const msgImg = await hasta(async () => (await mensajesDe(conv.id)).find((m) => m.type === "image"));
  ok("hay un mensaje de imagen", Boolean(msgImg));
  const disponible = await hasta(async () => {
    const m = (await mensajesDe(conv.id)).find((x) => x.type === "image");
    return m?.media?.fetchStatus === "available" ? m : null;
  }, 20000);
  ok("el archivo se bajó con la llave de Zernio (el simulador responde 401 sin ella)", Boolean(disponible), JSON.stringify(msgImg?.media));
  if (disponible) {
    const archivo = await fetch(`${BASE}/api/media/${disponible.media.assetId}`, { headers: { cookie } });
    ok("y la bandeja lo sirve", archivo.ok && Buffer.from(await archivo.arrayBuffer()).equals(bytes), String(archivo.status));
  }

  console.log("\n== Entrada: imagen cuyo hash no coincide ==");
  const idMala = `mala-${RUN}`;
  const conHashMalo = recibido({
    telefono, nombre, hilo,
    attachments: [
      { type: "image", url: `${MOCK}/whatsapp/media/${idMala}?accountId=${ACCOUNT}`, payload: { id: idMala, mimeType: "image/jpeg", sha256: "0".repeat(64) } },
    ],
  });
  await entregar(conHashMalo);
  const fallida = await hasta(async () => {
    const m = (await mensajesDe(conv.id)).filter((x) => x.type === "image").find((x) => x.media?.fetchStatus === "failed");
    return m ?? null;
  }, 20000);
  ok("el adjunto con otro hash queda como fallido, el mensaje se conserva", Boolean(fallida));

  console.log("\n== Entrada: ubicación y contacto compartido ==");
  await entregar(recibido({ telefono, nombre, hilo, text: "📍 Location", metadata: { location: { latitude: -33.45, longitude: -70.66 } } }));
  const ubi = await hasta(async () => (await mensajesDe(conv.id)).find((m) => m.type === "location" && m.media));
  ok("la ubicación entra con sus coordenadas", ubi?.media?.kind === "location" && ubi.text === null, JSON.stringify(ubi));
  await entregar(
    recibido({
      telefono, nombre, hilo, text: "👤 Otra Persona",
      metadata: { contactsOrigin: "other", contacts: [{ name: { formatted_name: "Otra Persona" }, phones: [{ phone: "+56 9 9999 9999", wa_id: "56999999999" }], origin: "other" }] },
    })
  );
  const tarjeta = await hasta(async () => (await mensajesDe(conv.id)).find((m) => m.type === "contacts" && m.media));
  ok("el contacto compartido entra como tarjeta", tarjeta?.media?.kind === "contacts", JSON.stringify(tarjeta));
  const lista = await conversaciones();
  ok(
    "el teléfono de la tarjeta no creó ni cambió contactos: sigue siendo uno",
    lista.filter((c) => c.contact.name === nombre).length === 1
  );

  console.log("\n== Entrada: lo que no es del cliente ==");
  const antes = (await mensajesDe(conv.id)).length;
  const deIg = recibido({ telefono, nombre, hilo, text: "no soy de WhatsApp" });
  deIg.account.platform = "instagram";
  deIg.message.platform = "instagram";
  await entregar(deIg);
  await sleep(1200);
  ok("un evento de otra plataforma no entra como WhatsApp", (await mensajesDe(conv.id)).length === antes);

  return { conv, hilo, telefono, nombre, primero };
}

// ---------------------------------------------------------------------------

async function acuses({ conv, hilo }) {
  console.log("\n== Acuses: llegan en cualquier orden y nunca bajan el estado ==");
  const r = await enviar(conv.id, { text: `Sí, tenemos turno ${MARCA}` });
  ok("el envío del operador responde bien", r.res.ok, `${r.res.status} ${JSON.stringify(r.json)}`);
  const id = r.json?.messageId ?? r.json?.id;
  const sent = (await enviadosPorZernio(hilo)).find((m) => m.message === `Sí, tenemos turno ${MARCA}`);
  ok("Zernio lo recibió con la cuenta y una Idempotency-Key", sent?.accountId === ACCOUNT && Boolean(sent?.idempotencyKey), JSON.stringify(sent));
  const wamid = sent?.messageId;
  ok("nace pendiente: WhatsApp confirma por acuses", (await estadoDe(conv.id, id))?.status === "pending", String((await estadoDe(conv.id, id))?.status));
  if (!wamid) return;

  await entregar(acuse("message.read", wamid));
  await entregar(acuse("message.delivered", wamid));
  await entregar(acuse("message.sent", wamid));
  const leido = await hasta(async () => ((await estadoDe(conv.id, id))?.status === "read" ? true : null));
  ok("read, delivered y sent en desorden → queda read", Boolean(leido), String((await estadoDe(conv.id, id))?.status));
  await entregar(acuse("message.delivered", wamid));
  await sleep(800);
  ok("un delivered tardío no baja un read", (await estadoDe(conv.id, id))?.status === "read");

  console.log("\n== Acuses: un fallo trae su motivo ==");
  const f = await enviar(conv.id, { text: `Este va a fallar ${MARCA}` });
  const idF = f.json?.messageId ?? f.json?.id;
  const sentF = (await enviadosPorZernio(hilo)).find((m) => m.message === `Este va a fallar ${MARCA}`);
  await entregar(acuse("message.failed", sentF?.messageId, { error: { code: 131047, message: "Re-engagement message" } }));
  const fallado = await hasta(async () => {
    const m = await estadoDe(conv.id, idF);
    return m?.status === "failed" ? m : null;
  });
  ok("el mensaje queda failed con el motivo traducido", Boolean(fallado) && /24 h/.test(fallado?.error ?? ""), JSON.stringify(fallado?.error));
}

// ---------------------------------------------------------------------------

async function salida({ conv, hilo, primero }) {
  console.log("\n== Salida: cita, ubicación, contacto y archivo ==");
  const original = (await mensajesDe(conv.id)).find((m) => m.direction === "in" && m.text === primero.message.text);
  const cita = await enviar(conv.id, { text: `Te respondo a eso ${MARCA}`, replyToMessageId: original?.id });
  ok("responder citando → 2xx", cita.res.ok, `${cita.res.status} ${JSON.stringify(cita.json)}`);
  const citada = (await enviadosPorZernio(hilo)).find((m) => m.message === `Te respondo a eso ${MARCA}`);
  ok("Zernio recibe replyTo con el wamid del mensaje citado", citada?.replyTo === primero.message.platformMessageId, JSON.stringify(citada));

  const ubicacion = await enviar(conv.id, { type: "location", location: { latitude: -33.45, longitude: -70.66, name: "Oficina" } });
  ok("ubicación → 2xx", ubicacion.res.ok, `${ubicacion.res.status} ${JSON.stringify(ubicacion.json)}`);
  ok("Zernio recibe la ubicación", (await enviadosPorZernio(hilo)).some((m) => m.location?.latitude === -33.45 && m.location?.name === "Oficina"));

  const contacto = await enviar(conv.id, { type: "contacts", contacts: [{ name: "Persona de Prueba", phone: "+56911111111" }] });
  ok("contacto → 2xx", contacto.res.ok, `${contacto.res.status} ${JSON.stringify(contacto.json)}`);
  ok("Zernio recibe la tarjeta", (await enviadosPorZernio(hilo)).some((m) => m.contacts?.[0]?.name?.formatted_name === "Persona de Prueba"));

  const form = new FormData();
  form.append("file", new Blob([Buffer.from("PNG-DE-PRUEBA")], { type: "image/png" }), "foto.png");
  form.append("caption", `Mira esto ${MARCA}`);
  const archivo = await api(`/api/conversations/${conv.id}/messages/media`, { method: "POST", body: form });
  ok("archivo → 201", archivo.res.status === 201, `${archivo.res.status} ${JSON.stringify(archivo.json)}`);
  const subido = (await enviadosPorZernio(hilo)).find((m) => m.attachment?.name === "foto.png");
  ok(
    "Zernio recibe el archivo por multipart, con su tipo y su pie",
    subido?.via === "multipart" && subido.attachmentType === "image" && subido.attachment.type === "image/png" && subido.message === `Mira esto ${MARCA}`,
    JSON.stringify(subido)
  );
}

// ---------------------------------------------------------------------------

async function ventana() {
  console.log("\n== Ventana de 24 horas ==");
  const nombre = `Vera Vieja ${MARCA}`;
  const hilo = `zconv-wa-vieja-${RUN}`;
  await entregar(recibido({ telefono: TELEFONO(9001), nombre, text: `hace mucho ${MARCA}`, hilo, sentAt: new Date(Date.now() - 30 * HORA) }));
  const conv = await convDe(nombre);
  ok("la conversación vieja entra", Boolean(conv));
  if (!conv) return;
  const antes = (await enviadosPorZernio(hilo)).length;
  const r = await enviar(conv.id, { text: `¿sigues ahí? ${MARCA}` });
  ok(
    "fuera de ventana → 409 window_closed, dicho para Zernio (sin plantillas)",
    r.res.status === 409 && r.json?.error?.code === "window_closed" && /Zernio/.test(r.json?.error?.message ?? ""),
    `${r.res.status} ${JSON.stringify(r.json)}`
  );
  ok("y no se llamó a Zernio", (await enviadosPorZernio(hilo)).length === antes);
}

// ---------------------------------------------------------------------------

async function llaveMuerta({ conv, hilo }) {
  console.log("\n== Llave muerta y Zernio caído ==");
  await mock("_down", { routes: [`inbox/conversations/${hilo}/messages`] });
  const caido = await enviar(conv.id, { text: `con Zernio caído ${MARCA}` });
  ok("Zernio caído → 503 meta_unavailable, reintentable", caido.res.status === 503 && caido.json?.error?.code === "meta_unavailable", `${caido.res.status} ${JSON.stringify(caido.json)}`);
  await mock("_down", { routes: [] });

  await mock("_dead", { dead: true });
  const muerta = await enviar(conv.id, { text: `con la llave muerta ${MARCA}` });
  ok("llave revocada → reconnect_required", muerta.json?.error?.code === "reconnect_required", `${muerta.res.status} ${JSON.stringify(muerta.json)}`);
  ok("la conexión queda pidiendo reconectar", (await api("/api/settings/whatsapp-zernio")).json?.connection?.status === "reconnect_required");
  const pausado = await enviar(conv.id, { text: `sigue pausado ${MARCA}` });
  ok("y los envíos siguientes se detienen sin llamar a Zernio", pausado.json?.error?.code === "reconnect_required");

  await mock("_dead", { dead: false });
  const reconectar = await api("/api/settings/whatsapp-zernio", {
    method: "PUT",
    body: JSON.stringify({ accountRef: ACCOUNT, token: "sk_llave-whatsapp-nueva" }),
  });
  ok("pegar una llave nueva reconecta", reconectar.res.ok && (await api("/api/settings/whatsapp-zernio")).json?.connection?.status === "connected");
  const vuelve = await enviar(conv.id, { text: `ya volvió ${MARCA}` });
  ok("y se puede enviar de nuevo", vuelve.res.ok, `${vuelve.res.status} ${JSON.stringify(vuelve.json)}`);
}

// ---------------------------------------------------------------------------

async function desconectar() {
  console.log("\n== Desconectar ==");
  const r = await api("/api/settings/whatsapp-zernio", { method: "DELETE" });
  ok("desconectar → 200", r.res.ok);
  ok("la conexión ya no existe", (await api("/api/settings/whatsapp-zernio")).json?.connection === null);
  ok("y los mensajes ya guardados se conservan", (await conversaciones()).some((c) => c.channel === "whatsapp"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
