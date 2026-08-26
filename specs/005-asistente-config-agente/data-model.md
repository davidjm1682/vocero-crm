# Data Model: Asistente conversacional de configuración del agente

Esta feature **no agrega columnas ni tablas nuevas**. Reutiliza en su
totalidad el modelo existente de `agentProfile` (ver
`src/lib/db/schema.ts`).

## Entidades persistidas (existentes, sin cambio)

### `agentProfile` (reutilizada, sin migración)

| Campo | Tipo | Uso en esta feature |
|---|---|---|
| `tone` | `text`, nullable | Destino de la propuesta generada por el asistente tras confirmación |
| `instructions` | `text`, nullable, hasta 8000 chars | Destino de la propuesta generada |
| `escalationRules` | `text`, nullable, hasta 4000 chars | Destino de la propuesta generada |
| `enabled` | `boolean` | Sin cambio — el asistente no lo modifica |
| `greeting`, `name` | `text` | Fuera de alcance de esta feature (el spec no los menciona como generados) |

El asistente escribe en estos campos exclusivamente a través del `PUT
/api/agent/profile` ya existente (mismo schema Zod, misma autorización por
sesión/organización).

## Entidades transitorias (no persistidas)

### Sesión de asistente (estado de cliente únicamente)

Representa el intercambio de preguntas/respuestas mientras el dueño completa
el wizard. Vive como estado de React en `config-assistant-dialog.tsx` —
**no tiene tabla, no tiene fila, no sobrevive a un refresh de página** (FR-010
del spec).

Forma conceptual (tipo TypeScript, no esquema de BD):

```ts
type ConfigAssistantAnswers = {
  canal: string;          // "canal principal de atención"
  negocio: string;        // "a qué se dedica el negocio"
  tono: string;            // "cómo debe sonar el agente"
  escalado: string;        // "cuándo debe escalar a un humano"
};

type ConfigAssistantProposal = {
  tone: string;
  instructions: string;
  escalationRules: string;
};
```

### Resultado de generación (respuesta del endpoint, no persistida)

`POST /api/agent/config-assistant` devuelve un `ConfigAssistantProposal` (ver
arriba). No se guarda en ninguna tabla — el cliente lo mantiene en memoria
hasta que el dueño confirma (momento en que se envía al `PUT
/api/agent/profile` existente) o descarta.

## Relación con el aislamiento multi-tenant

Sin cambios: la generación y la escritura siguen exigiendo sesión activa y
usan `organizationId` de esa sesión, igual que el resto de rutas de
`agentProfile`. No se introduce ningún nuevo vector de acceso cross-tenant.
