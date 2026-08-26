# Contract: `POST /api/agent/config-assistant`

Endpoint interno (mismo origen, autenticado por sesión) — no es un contrato
publicado externo (Constitución VI: por eso esta feature no exige ciclo
completo por esa vía, aunque se optó por él igual, ver `plan.md`).

## Autenticación y alcance

- Requiere sesión activa (`withAuth`, igual que el resto de `src/app/api/agent/*`).
- Opera exclusivamente sobre la organización activa de la sesión
  (`session.organizationId`) — nunca recibe ni acepta un `organizationId` en
  el body.

## Request

```http
POST /api/agent/config-assistant
Content-Type: application/json
```

```json
{
  "canal": "WhatsApp Business",
  "negocio": "Vendemos productos de skincare artesanal, por catálogo",
  "tono": "Cercano y cálido, pero profesional, sin muchos emojis",
  "escalado": "Si preguntan por reembolsos o se quejan de un pedido"
}
```

Schema Zod (referencia, definido en `src/server/ai/config-assistant.ts`):

```ts
const requestSchema = z.object({
  canal: z.string().trim().min(1).max(200),
  negocio: z.string().trim().min(1).max(1000),
  tono: z.string().trim().min(1).max(500),
  escalado: z.string().trim().min(1).max(500),
});
```

## Response — éxito (200)

```json
{
  "ok": true,
  "proposal": {
    "tone": "Cercano, cálido y profesional. Evita el exceso de emojis...",
    "instructions": "Eres el asistente de ventas de un negocio de skincare artesanal por catálogo...",
    "escalationRules": "Escala a un humano cuando el cliente pida un reembolso o se queje de un pedido..."
  }
}
```

## Response — sin proveedor de IA configurado (409)

Mismo código/semántica que ya usa el resto del agente cuando falta proveedor,
para consistencia con FR-008.

```json
{
  "ok": false,
  "error": "not_configured",
  "detail": "Configura un proveedor de IA en Settings antes de usar el asistente"
}
```

## Response — fallo del proveedor tras reintentos (502)

Corresponde a FR-009: error claro, no deja nada escrito (este endpoint nunca
escribe en `agentProfile`).

```json
{
  "ok": false,
  "error": "provider_error",
  "detail": "El proveedor de IA no respondió correctamente. Intenta de nuevo."
}
```

## Response — validación de entrada (400)

```json
{
  "ok": false,
  "error": "invalid_input",
  "detail": "El campo 'negocio' es obligatorio"
}
```

## Garantías del contrato

- Este endpoint es **idempotente en efectos de escritura**: nunca modifica
  `agentProfile` ni ninguna otra tabla. Llamarlo dos veces con la misma
  entrada puede dar salidas distintas (el LLM no es determinista), pero
  nunca deja el perfil del agente en un estado intermedio o corrupto — porque
  no lo toca en absoluto.
- La aplicación real del resultado al perfil del agente ocurre exclusivamente
  vía el contrato ya existente `PUT /api/agent/profile` (sin cambios en ese
  contrato).
