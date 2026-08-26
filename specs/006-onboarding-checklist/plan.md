# Implementation Plan: Checklist de onboarding guiado

**Branch**: `006-onboarding-checklist` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-onboarding-checklist/spec.md`

## Summary

Un endpoint nuevo (`GET /api/onboarding`) calcula, en el momento de
consultarse, el estado de 3 pasos esenciales (WhatsApp conectado, agente de
IA configurado, marca personalizada) leyendo directamente las tablas ya
existentes (`metaCredentials`, `agentProfile`, `organization`) — sin nueva
tabla ni columna. Un panel de checklist (`OnboardingChecklist`) se muestra en
`/inicio`-equivalente (la bandeja, primera pantalla tras login) mientras
falte algún paso, y colapsa a un link persistente en el nav
(`src/components/app-nav.tsx`, mismo patrón que el link condicional
"Agencia") una vez completos todos los pasos.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict + `noUncheckedIndexedAccess`), Node.js (runtime de Next.js)

**Primary Dependencies**: Next.js 15 (App Router) · React 19 · Drizzle ORM

**Storage**: PostgreSQL vía Drizzle — SIN migración nueva. Lee `metaCredentials.status`, `agentProfile.enabled/tone/instructions`, `organization.name/logo` (todas ya existentes).

**Testing**: Vitest (unit) para el cálculo de estado/progreso; guion E2E en `tests/e2e/*.md`.

**Target Platform**: Servidor Linux self-hosted — sin cambios de infraestructura.

**Project Type**: Monolito web (Next.js App Router).

**Performance Goals**: Sin metas especiales — 3 lecturas puntuales por `organizationId`, del mismo orden que cualquier fetch de Settings ya existente.

**Constraints**: Cero dependencias externas nuevas (Constitución II). El estado se deriva en cada consulta (research.md, Decisión 1) — no se persiste "onboarding completado" en ningún lado, para que nunca se desincronice de la configuración real (FR-006, FR-009 del spec).

**Scale/Scope**: 3 pasos fijos en esta primera versión (spec.md → Assumptions). Reutiliza 100% de tablas existentes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluado contra Constitución v1.4.0:

- **I. Seguridad de Datos Primero** — PASA. El endpoint de onboarding solo
  lee booleanos derivados (conectado/no, configurado/no) — nunca expone
  tokens ni contenido sensible de las tablas que consulta.
- **II. Soberanía / Self-Hosted** — PASA. Cero dependencias externas nuevas.
- **III. Multi-Tenancy Real** — PASA. Todas las lecturas usan `scoped()`/
  `organizationId` de la sesión, igual que el resto de endpoints de Settings.
- **IV. Idempotencia** — N/A directo (no hay webhook ni evento externo
  entrante).
- **V. Calidad Verificable** — Aplica el gate técnico estándar.
- **VI. Specs Antes de Código** — Por el criterio objetivo del principio
  (sin migración de esquema, sin contrato publicado externo), esta feature
  calificaría para carril ligero. Se optó por documentar plan+tasks igual,
  por consistencia con el resto del repo en features de esta complejidad
  (múltiples pantallas/estados) — mismo criterio aplicado en 005.
- **VIII. Foco Vertical** — PASA. Guía al dueño a completar configuración
  que ya sirve directamente al dominio (WhatsApp, agente, marca del
  negocio) — no introduce alcance nuevo, solo visibilidad sobre configuración
  existente.
- **IX. Verificación de Comportamiento en Vivo** — Aplica: self-test E2E de
  las 3 historias del spec antes de declarar la feature terminada.

Sin violaciones. No se requiere Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/006-onboarding-checklist/
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
├── server/
│   └── onboarding/                 # NUEVO — lógica de dominio de onboarding
│       └── status.ts               # getOnboardingStatus(organizationId):
│                                    #   lee metaCredentials/agentProfile/
│                                    #   organization y devuelve los 3 pasos
│                                    #   + progreso calculado
├── app/
│   └── api/
│       └── onboarding/
│           └── route.ts            # NUEVO — GET: expone getOnboardingStatus
│                                    #   de la organización activa de sesión
└── components/
    ├── onboarding/                  # NUEVO
    │   └── onboarding-checklist.tsx # panel de pasos + barra de progreso;
    │                                #   se muestra en /inbox mientras falte
    │                                #   algún paso; también reutilizable
    │                                #   como vista completa bajo demanda
    └── app-nav.tsx                  # MODIFICADO — agrega el punto de acceso
                                      #   persistente (mismo patrón que el
                                      #   link condicional "Agencia" de 004)

tests/
├── unit/
│   └── onboarding-status.test.ts   # NUEVO — cálculo de cada paso y del
│                                    #   progreso agregado, casos de
│                                    #   organización preexistente
└── e2e/
    └── 006-onboarding-checklist.md # NUEVO — guion de las 3 historias
```

**Structure Decision**: Monolito Next.js existente, sin proyectos nuevos.
Lógica de dominio nueva en `src/server/onboarding/` (paralelo a
`src/server/agency/`, `src/server/ai-provider/`), ruta API bajo
`src/app/api/onboarding/`, UI bajo `src/components/onboarding/`. El punto de
acceso persistente reutiliza literalmente el patrón ya usado por el link
"Agencia" en `app-nav.tsx` (fetch condicional en `useEffect`, mostrar/ocultar
un item de nav).

## Complexity Tracking

*Sin violaciones — tabla omitida.*
