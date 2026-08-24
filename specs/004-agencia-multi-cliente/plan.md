# Implementation Plan: Panel de agencia multi-cliente

**Branch**: `004-agencia-multi-cliente` | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-agencia-multi-cliente/spec.md`

## Summary

Una agencia de marketing administra múltiples workspaces de cliente (cada uno
una `organization` existente y aislada, sin cambios en su modelo) desde un
panel único, con un límite de workspaces según su plan (Starter=10, Growth=15,
Scale=30). Enfoque técnico: agregar una entidad `agency` y una relación
opcional `organization.agencyId`; extender el modelo de membresía existente
(hoy artificialmente limitado a 1 organización por usuario pese a que Better
Auth ya soporta N:N) para que un miembro de agencia tenga membresía en todas
las organizaciones de su agencia; un panel nuevo de listado + creación con
enforcement del límite del plan.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict + `noUncheckedIndexedAccess`), Node.js (runtime de Next.js)

**Primary Dependencies**: Next.js 15 (App Router) · React 19 · Better Auth 1.1 (plugin `organization`) · Drizzle ORM 0.38 · Zod

**Storage**: PostgreSQL (self-hosted, vía `postgres` driver + Drizzle), migraciones versionadas en `drizzle/`

**Testing**: Vitest (unit) + guiones E2E en `tests/e2e/*.md`, automatizados vía `pnpm test:e2e` contra mocks internos (`WA_MOCK_ENABLED`, `OPENROUTER_BASE_URL` → ai-mock)

**Target Platform**: Servidor Linux self-hosted (Docker, Coolify o docker compose + Caddy)

**Project Type**: Monolito web (Next.js App Router, frontend + backend en el mismo proyecto)

**Performance Goals**: Sin metas de throughput especiales — el volumen esperado (decenas de agencias, cada una con hasta 30 workspaces) es órdenes de magnitud menor a lo que Postgres/Next.js manejan por defecto.

**Constraints**: Cero servicios externos nuevos (Constitución II) — sin billing, sin cola externa; el enforcement del límite de plan y la membresía multi-organización se resuelven con Postgres + Better Auth ya presentes. Cambio de plan de agencia es una acción administrativa manual (sin UI de autoservicio con cobro).

**Scale/Scope**: 3 planes fijos de agencia (10/15/30 workspaces); reutiliza el 100% del modelo de `organization` existente sin duplicarlo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluado contra Constitución v1.3.0 (post-enmienda de este mismo ciclo):

- **I. Seguridad de Datos Primero** — PASA. Cada workspace de cliente sigue
  siendo una `organization` aislada; la capa de agencia solo agrupa acceso
  administrativo, no comparte datos entre organizaciones. El aislamiento
  existente (`scoped()` en `tenant.ts`) no cambia.
- **II. Soberanía / Self-Hosted** — PASA. Sin dependencias externas nuevas.
  El cambio de plan de agencia es manual (sin Stripe/billing), cumpliendo la
  restricción explícita reafirmada en la enmienda del Principio VIII.
- **III. Multi-Tenancy Real** — PASA. `organization_id` sigue siendo el
  parámetro de primer nivel en cada tabla de dominio; la agencia no introduce
  un tenant nuevo compartido, solo una relación de agrupación.
- **IV. Idempotencia** — N/A directo (esta feature no introduce webhooks ni
  eventos externos nuevos).
- **V. Calidad Verificable** — Aplica el gate técnico estándar (typecheck +
  lint + build + test) antes de "Hecho".
- **VIII. Foco Vertical** — PASA tras la enmienda v1.3.0: el modelo de agencia
  multi-cliente es ahora una excepción explícitamente permitida.
- **IX. Verificación de Comportamiento en Vivo** — Aplica: self-test E2E de
  los 3 flujos de usuario del spec (crear workspace, navegar panel, bloqueo
  por límite) antes de declarar la feature terminada.

Sin violaciones. No se requiere Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
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
│   ├── db/
│   │   ├── schema.ts          # + tabla `agency`, + columna `organization.agencyId`
│   │   └── ids.ts             # + prefijo nanoid para `agency`
│   └── auth/
│       └── index.ts           # sin cambios de configuración; se reutiliza el
│                               #   plugin `organization` de Better Auth tal cual
├── server/
│   ├── auth/
│   │   └── on-signup.ts       # `resolveMembership` deja de asumir 1 org por
│   │                           #   usuario (quita `.limit(1)` implícito);
│   │                           #   nueva función para crear workspace de
│   │                           #   cliente dentro del límite de plan de agencia
│   └── agency/                # NUEVO — lógica de dominio de agencia
│       ├── credentials.ts     # crear agencia, contar workspaces activos,
│       │                       #   enforcement del límite de plan
│       └── members.ts         # dar/quitar acceso de un miembro a todos los
│                               #   workspaces de su agencia
├── app/
│   ├── api/
│   │   └── agency/            # NUEVO
│   │       ├── route.ts               # GET (datos de la agencia + plan)
│   │       ├── workspaces/route.ts    # GET (listar) / POST (crear, con gate
│   │       │                           #   de límite de plan)
│   │       └── workspaces/[id]/archive/route.ts  # POST (archivar sin borrar)
│   └── (app)/
│       └── agency/            # NUEVO — panel de agencia
│           └── page.tsx
└── components/
    └── agency/                # NUEVO
        └── agency-client.tsx  # lista de workspaces + botón "Agregar cliente"
                                 #   (deshabilitado al llegar al límite)

drizzle/
└── <NNNN>_<nombre>.sql        # migración: tabla `agency` + columna
                                 #   `organization.agency_id` (nullable, FK)

tests/
├── unit/
│   └── agency.test.ts         # NUEVO — límite de plan, aislamiento, membresía
└── e2e/
    └── 004-agencia-multi-cliente.md  # guion de las 3 historias del spec
```

**Structure Decision**: Monolito Next.js existente, sin proyectos nuevos. Se
sigue el mapa de código ya documentado en `CLAUDE.md`: campos/tablas en
`src/lib/db/schema.ts`, lógica de dominio nueva en `src/server/agency/`
(paralelo a `src/server/lab/`, `src/server/inbox/`, etc.), rutas API bajo
`src/app/api/agency/`, UI bajo `src/components/agency/` +
`src/app/(app)/agency/`. No se crean paquetes, servicios ni proyectos
adicionales.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
