# Implementation Plan: Asistente conversacional de configuración del agente

**Branch**: `005-asistente-config-agente` | **Date**: 2026-08-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-asistente-config-agente/spec.md`

## Summary

Un chat guiado dentro de la pantalla existente de configuración del agente
(`src/components/agent/agent-client.tsx`) donde el dueño responde unas
preguntas en lenguaje natural y, al confirmar, el sistema usa `chatJson`
(el único adaptador LLM del proyecto) para generar tono, instrucciones y
reglas de escalado, y los precarga como propuesta editable en los mismos
campos de texto que ya existen en `agentProfile` — sin tocar el esquema de
base de datos. No hay historial persistente: la conversación vive en estado
de cliente (React) hasta que el dueño confirma o abandona.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict + `noUncheckedIndexedAccess`), Node.js (runtime de Next.js)

**Primary Dependencies**: Next.js 15 (App Router) · React 19 · `chatJson<T>` (`src/lib/ai/index.ts`, adaptador OpenRouter-compatible existente) · Zod

**Storage**: PostgreSQL vía Drizzle — SIN migración nueva. Reutiliza las columnas ya existentes `agentProfile.tone`, `.instructions`, `.escalationRules` (`src/lib/db/schema.ts`).

**Testing**: Vitest (unit) para la lógica de generación de prompt/parseo de respuesta; guion E2E en `tests/e2e/*.md` automatizado vía `pnpm test:e2e` contra `ai-mock`.

**Target Platform**: Servidor Linux self-hosted (Docker, Coolify o docker compose + Caddy) — sin cambios de infraestructura.

**Project Type**: Monolito web (Next.js App Router, frontend + backend en el mismo proyecto).

**Performance Goals**: Sin metas de throughput especiales — es una interacción síncrona iniciada por el usuario, del mismo orden de magnitud que una corrida del Laboratorio (`src/server/lab/`).

**Constraints**: Cero proveedores de IA nuevos (Constitución II) — usa exclusivamente `chatJson` con `organizationId` para resolver las credenciales ya configuradas por la organización (`resolveProvider` en `src/lib/ai/index.ts`, que ya cae a `isAiConfiguredFor`). Si no hay proveedor configurado, el asistente se deshabilita igual que ya deshabilita hoy el agente principal (mismo criterio, mismo mensaje).

**Scale/Scope**: Una conversación acotada (algunas preguntas fijas), sin historial persistente entre sesiones (FR-010). No introduce tablas nuevas.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluado contra Constitución v1.4.0:

- **I. Seguridad de Datos Primero** — PASA. No se introduce ningún secreto
  nuevo; se reutiliza `getAiProviderCredentials`/`chatJson`, que ya cifra en
  reposo y nunca expone el token al cliente. La conversación en sí (texto del
  dueño sobre su negocio) no es un secreto de credenciales.
- **II. Soberanía / Self-Hosted** — PASA. Cero dependencias externas nuevas:
  el asistente usa el mismo adaptador OpenRouter-compatible ya presente. Sin
  proveedor configurado, la feature se deshabilita (no degrada a otro
  servicio).
- **III. Multi-Tenancy Real** — PASA. El endpoint del asistente exige sesión
  y usa `scoped()`/`organizationId` de la sesión igual que el resto de rutas
  de `agentProfile`; nunca opera sobre el perfil de otra organización.
- **IV. Idempotencia** — N/A directo (no hay webhook ni evento externo
  entrante; es una acción síncrona iniciada por el usuario).
- **V. Calidad Verificable** — Aplica el gate técnico estándar (typecheck +
  lint + build + test) antes de "Hecho".
- **VI. Specs Antes de Código** — Ciclo completo, porque aunque esta feature
  NO toca el modelo de datos (reutiliza columnas existentes) ni un contrato
  publicado externo, se eligió el ciclo completo por consistencia con el
  resto del repo en features de esta complejidad (varias pantallas/estados de
  interacción). *Nota: por el criterio objetivo del Principio VI (sin
  migración, sin contrato publicado), esta feature calificaría para carril
  ligero; se documenta la elección de ciclo completo como decisión, no como
  requisito.*
- **VIII. Foco Vertical** — PASA. Sirve directamente a "un agente de IA que
  atiende con el conocimiento del negocio" — es una vía adicional (no
  exclusiva) para configurar ese agente, dentro del dominio ya cubierto.
- **IX. Verificación de Comportamiento en Vivo** — Aplica: self-test E2E de
  las 3 historias del spec (completar el asistente y ver campos generados,
  editar manualmente después, comportamiento sin proveedor de IA) antes de
  declarar la feature terminada.

Sin violaciones. No se requiere Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/005-asistente-config-agente/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── lib/
│   └── ai/
│       └── index.ts                    # sin cambios — se reutiliza chatJson<T> tal cual
├── server/
│   └── ai/
│       └── config-assistant.ts         # NUEVO — construye el prompt guiado,
│                                        #   define el esquema Zod de salida
│                                        #   (tone/instructions/escalationRules),
│                                        #   y llama a chatJson con organizationId
├── app/
│   └── api/
│       └── agent/
│           └── config-assistant/
│               └── route.ts            # NUEVO — POST: recibe las respuestas
│                                        #   del wizard, devuelve la propuesta
│                                        #   generada (NO escribe en agentProfile
│                                        #   todavía — eso lo hace el PUT existente
│                                        #   de /api/agent/profile tras confirmar)
└── components/
    └── agent/
        ├── agent-client.tsx             # MODIFICADO — agrega el punto de
        │                                #   entrada al asistente conversacional
        │                                #   junto a los campos existentes
        └── config-assistant-dialog.tsx  # NUEVO — el chat guiado en sí:
                                          #   preguntas fijas, estado de
                                          #   conversación en cliente, pantalla
                                          #   de revisión/confirmación antes de
                                          #   aplicar al formulario

tests/
├── unit/
│   └── config-assistant.test.ts        # NUEVO — construcción de prompt,
│                                        #   parseo de la respuesta del LLM,
│                                        #   comportamiento sin proveedor
│                                        #   configurado
└── e2e/
    └── 005-asistente-config-agente.md  # NUEVO — guion de las 3 historias
```

**Structure Decision**: Monolito Next.js existente, sin proyectos nuevos. Se
sigue el mapa de código de `CLAUDE.md`: comportamiento del agente en
`src/server/ai/`, ruta API bajo `src/app/api/agent/`, UI bajo
`src/components/agent/`. El endpoint nuevo SOLO genera la propuesta de texto;
la escritura real en `agentProfile` sigue pasando por el `PUT
/api/agent/profile` ya existente y ya probado, evitando duplicar lógica de
persistencia/autorización.

## Complexity Tracking

*Sin violaciones — tabla omitida.*
