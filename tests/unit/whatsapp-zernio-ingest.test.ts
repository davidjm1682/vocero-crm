import { describe, expect, it } from "vitest";
import { normalizeZernioWhatsappEvent } from "@/server/whatsapp-zernio/ingest";

/**
 * 080 · T009/T013 — Formas REALES de `message.received` observadas en el
 * sandbox de Zernio (2026-11-25), con los datos personales cambiados por
 * valores inventados: teléfono, BSUID, cuenta y ids de mensaje.
 */
const CUENTA = "6b00000000000000000000a1";
const TELEFONO = "56900000000"; // sin «+», como lo manda Zernio en sender.id
const BSUID = "CL.1000000000000001";
const WAMID = "wamid.TEST0001";

function evento(message: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    id: "evt_1",
    event: "message.received",
    message: {
      id: "zmsg_1",
      conversationId: "conv_1",
      platform: "whatsapp",
      platformMessageId: WAMID,
      direction: "incoming",
      text: null,
      attachments: [],
      sender: {
        id: TELEFONO,
        phoneNumber: `+${TELEFONO}`,
        name: "Cliente de prueba",
        businessScopedUserId: BSUID,
        contactId: "ctc_1",
      },
      sentAt: "2026-11-25T14:00:00.000Z",
      isRead: false,
      ...message,
    },
    conversation: { id: "conv_1", platformConversationId: "p_1", contactId: "ctc_1" },
    account: { id: CUENTA, accountId: CUENTA, platform: "whatsapp", username: "+56 9 0000 0000" },
    metadata: {},
    ...extra,
  };
}

const uno = (payload: unknown) => {
  const r = normalizeZernioWhatsappEvent(payload);
  expect(r).toHaveLength(1);
  return r[0]!;
};

describe("080 · entrada de WhatsApp por Zernio: identidad (D3/D6)", () => {
  it("el teléfono sale de sender.id (sin «+»), igual que el `from` de Meta", () => {
    const m = uno(evento({ text: "Hola" }));
    expect(m.phone).toBe(TELEFONO);
    expect(m.waUserId).toBe(BSUID);
    expect(m.profileName).toBe("Cliente de prueba");
    expect(m.accountRef).toBe(CUENTA);
  });

  it("sin teléfono pero con BSUID, la identidad es el BSUID", () => {
    const m = uno(
      evento({
        text: "Hola",
        sender: { businessScopedUserId: BSUID, name: "Sin número" },
      })
    );
    expect(m.phone).toBeNull();
    expect(m.waUserId).toBe(BSUID);
  });

  it("sin teléfono ni BSUID no hay a quién atribuirlo: se descarta", () => {
    expect(normalizeZernioWhatsappEvent(evento({ text: "Hola", sender: { name: "Nadie" } }))).toEqual([]);
  });

  it("el id del mensaje es el wamid (platformMessageId), no el id de Zernio", () => {
    expect(uno(evento({ text: "Hola" })).messageId).toBe(WAMID);
  });

  it("sin platformMessageId se usa el id del mensaje de Zernio", () => {
    const m = uno(evento({ text: "Hola", platformMessageId: undefined }));
    expect(m.messageId).toBe("zmsg_1");
  });

  it("la fecha sale de sentAt en segundos", () => {
    expect(uno(evento({ text: "Hola" })).timestamp).toBe(
      String(Math.floor(Date.parse("2026-11-25T14:00:00.000Z") / 1000))
    );
  });

  it("el hilo es el conversationId de Zernio, opaco", () => {
    expect(uno(evento({ text: "Hola" })).threadRef).toBe("conv_1");
  });
});

describe("080 · entrada de WhatsApp por Zernio: tipos de mensaje", () => {
  it("texto", () => {
    const m = uno(evento({ text: "Hola, ¿tienen turno?" }));
    expect(m.type).toBe("text");
    expect(m.text).toBe("Hola, ¿tienen turno?");
    expect(m.attachments).toEqual([]);
  });

  it("botón de plantilla: entra como texto con el rótulo; sin texto, el payload del botón", () => {
    const conTexto = uno(
      evento({ text: "Sí, confirmo" }, { metadata: { buttonPayload: "CONFIRMAR" } })
    );
    expect(conTexto.text).toBe("Sí, confirmo");
    const sinTexto = uno(evento({ text: null }, { metadata: { buttonPayload: "CONFIRMAR" } }));
    expect(sinTexto.type).toBe("text");
    expect(sinTexto.text).toBe("CONFIRMAR");
  });

  it("respuesta citada: guarda el wamid del citado", () => {
    const m = uno(
      evento(
        { text: "Esa misma" },
        {
          metadata: {
            quotedMessageId: "wamid.CITADO",
            quotedMessage: { messageId: "zmsg_0", platformMessageId: "wamid.CITADO" },
          },
        }
      )
    );
    expect(m.replyTo).toBe("wamid.CITADO");
  });

  it("sin cita, replyTo es null", () => {
    expect(uno(evento({ text: "Hola" })).replyTo).toBeNull();
  });

  it("imagen: un adjunto con su URL, su tipo y su sha256, sin texto", () => {
    const m = uno(
      evento({
        attachments: [
          {
            type: "image",
            url: `https://zernio.com/api/v1/whatsapp/media/m1?accountId=${CUENTA}`,
            payload: { id: "m1", mimeType: "image/jpeg", sha256: "abc123" },
          },
        ],
      })
    );
    expect(m.type).toBe("image");
    expect(m.text).toBeNull();
    expect(m.attachments).toHaveLength(1);
    expect(m.attachments[0]!.payload).toMatchObject({ mimeType: "image/jpeg", sha256: "abc123" });
  });

  it("nota de voz: audio", () => {
    const m = uno(
      evento({
        attachments: [
          {
            type: "audio",
            url: "https://zernio.com/api/v1/whatsapp/media/m2",
            payload: { id: "m2", mimeType: "audio/ogg; codecs=opus", voice: true },
          },
        ],
      })
    );
    expect(m.type).toBe("audio");
  });

  it("documento: type «file» entra como document", () => {
    const m = uno(
      evento({
        attachments: [
          {
            type: "file",
            url: "https://zernio.com/api/v1/whatsapp/media/m3",
            payload: { id: "m3", mimeType: "application/pdf", filename: "cotizacion.pdf" },
          },
        ],
      })
    );
    expect(m.type).toBe("document");
  });

  it("imagen con pie de foto: el resumen es de imagen y el pie viaja como texto", () => {
    const m = uno(
      evento({
        text: "Mira esto",
        attachments: [{ type: "image", url: "https://zernio.com/api/v1/whatsapp/media/m4" }],
      })
    );
    expect(m.text).toBe("Mira esto");
    expect(m.attachments).toHaveLength(1);
  });

  it("ubicación: coordenadas de metadata.location; el texto «📍 Location» no se guarda", () => {
    const m = uno(
      evento(
        { text: "📍 Location" },
        { metadata: { location: { latitude: -33.45, longitude: -70.66 } } }
      )
    );
    expect(m.type).toBe("location");
    expect(m.text).toBeNull();
    expect(m.location).toEqual({ latitude: -33.45, longitude: -70.66 });
  });

  it("ubicación con coordenadas que no son números: no es una ubicación", () => {
    const r = normalizeZernioWhatsappEvent(
      evento({ text: "📍 Location" }, { metadata: { location: { latitude: "x", longitude: null } } })
    );
    // Queda como el texto que llegó: no se inventa una ubicación.
    expect(r[0]!.type).toBe("text");
    expect(r[0]!.location).toBeNull();
  });

  it("contacto compartido: tarjetas de metadata.contacts; el texto «👤 …» no se guarda", () => {
    const tarjeta = {
      name: { formatted_name: "Persona Compartida" },
      phones: [{ phone: "+56 9 1111 1111", wa_id: "56911111111", type: "CELL" }],
      origin: "other",
    };
    const m = uno(
      evento(
        { text: "👤 Persona Compartida" },
        { metadata: { contacts: [tarjeta], contactsOrigin: "other" } }
      )
    );
    expect(m.type).toBe("contacts");
    expect(m.text).toBeNull();
    expect(m.contacts).toEqual([tarjeta]);
  });
});

describe("080 · el contacto compartido no es el remitente (T013)", () => {
  it("el teléfono de la tarjeta (origin «other») no toca la identidad del remitente", () => {
    const m = uno(
      evento(
        { text: "👤 Otra" },
        {
          metadata: {
            contacts: [
              { name: { formatted_name: "Otra" }, phones: [{ phone: "+56 9 2222 2222", wa_id: "56922222222" }], origin: "other" },
            ],
            contactsOrigin: "other",
          },
        }
      )
    );
    expect(m.phone).toBe(TELEFONO);
    expect(m.waUserId).toBe(BSUID);
    expect(m.profileName).toBe("Cliente de prueba");
  });
});

describe("080 · lo que NO se ingiere", () => {
  it("un evento de otra plataforma conectada a la misma llave", () => {
    const e = evento({ text: "Hola", platform: "instagram" });
    e.account.platform = "instagram";
    expect(normalizeZernioWhatsappEvent(e)).toEqual([]);
  });

  it("un mensaje saliente o un acuse no es algo que dijo el cliente", () => {
    expect(normalizeZernioWhatsappEvent(evento({ text: "x", direction: "outgoing" }))).toEqual([]);
    expect(
      normalizeZernioWhatsappEvent({ ...evento({ text: "x" }), event: "message.sent" })
    ).toEqual([]);
    expect(
      normalizeZernioWhatsappEvent({ ...evento({ text: "x" }), event: "message.delivered" })
    ).toEqual([]);
  });

  it("sin cuenta no hay a qué organización enrutarlo", () => {
    const e = evento({ text: "Hola" }) as Record<string, unknown>;
    delete e.account;
    expect(normalizeZernioWhatsappEvent(e)).toEqual([]);
  });

  it("sin id de mensaje o sin contenido, nada", () => {
    expect(
      normalizeZernioWhatsappEvent(evento({ text: "Hola", id: undefined, platformMessageId: undefined }))
    ).toEqual([]);
    expect(normalizeZernioWhatsappEvent(evento({ text: null, attachments: [] }))).toEqual([]);
  });

  it("basura: null, texto, arreglo", () => {
    for (const x of [null, undefined, "hola", 42, []]) {
      expect(normalizeZernioWhatsappEvent(x)).toEqual([]);
    }
  });
});
