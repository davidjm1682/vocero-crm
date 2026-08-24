---
description: "Task list for Panel de agencia multi-cliente"
---

# Tasks: Panel de agencia multi-cliente

**Input**: Design documents from `/specs/004-agencia-multi-cliente/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/agency-api.md, quickstart.md

**Tests**: No se pidió TDD explícito en el spec. Se sigue el patrón ya
establecido en el proyecto (ver `tests/unit/judge.test.ts`,
`tests/unit/credentials.test.ts`): un test unitario por pieza de lógica de
dominio no trivial, escrito junto con la implementación, más el guion de
`quickstart.md` como self-test de comportamiento en vivo (Principio IX) antes
de declarar la feature terminada.

**Organization**: Tareas agrupadas por historia de usuario del spec, en el
mismo orden de prioridad (P1, P1, P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias)
- **[Story]**: US1 (crear workspace), US2 (panel/navegación), US3 (límite de plan)

## Path Conventions

Monolito Next.js existente (ver `plan.md` → Project Structure). Todas las
rutas son relativas a la raíz del repo `vocero-crm/`.

---

## Phase 1: Setup

**Purpose**: Preparar el modelo de datos base que todas las historias necesitan.

- [x] T001 Agregar prefijo nanoid `agency: "agency"` en `src/lib/db/ids.ts`
- [x] T002 Definir tabla `agency` (id, name, plan enum, planLimit, createdAt) en `src/lib/db/schema.ts` según `data-model.md`
- [x] T003 Agregar columnas `agencyId` (FK nullable, onDelete restrict) y `archivedAt` (timestamp nullable) a la tabla `organization` en `src/lib/db/schema.ts`
- [x] T004 Generar migración con `pnpm db:generate` y verificar el SQL resultante contra `data-model.md` antes de commitear

**Checkpoint**: Schema listo, migración generada y verificada (sin aplicar aún a producción).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extender el modelo de membresía/sesión existente para soportar que un usuario pertenezca a múltiples organizaciones — bloqueante para las 3 historias, ya que todas dependen de "un miembro de agencia opera varios workspaces".

**⚠️ CRITICAL**: Ninguna historia puede implementarse sin esto completo.

- [x] T005 En `src/server/auth/on-signup.ts`, actualizar `resolveMembership()` para resolver por `session.activeOrganizationId` cuando el usuario tiene múltiples membresías, con fallback a la primera membresía si no hay organización activa (research.md, Decisión 2) — SIN romper el caso actual de un usuario con una sola organización
- [x] T006 Crear `src/server/agency/credentials.ts` con `getAgencyForUser(userId)` (resuelve la agencia a partir de la organización activa del usuario vía `organization.agencyId`) y `countActiveWorkspaces(agencyId)` (cuenta `organization` con `agencyId` dado y `archivedAt IS NULL`)
- [x] T007 Crear `src/server/agency/members.ts` con `addMemberToWorkspace(userId, organizationId, role)` (inserta fila `member`, reutilizando el patrón de `onUserCreated`) y `grantAgencyMembersToWorkspace(agencyId, newOrganizationId)` (agrega a TODOS los miembros existentes de la agencia como `member` del nuevo workspace)
- [x] T008 [P] Endpoint `POST /api/agency/workspaces/:id/enter` en `src/app/api/agency/workspaces/[id]/enter/route.ts` — cambia `session.activeOrganizationId` al workspace indicado, validando que el usuario tenga membresía ahí (403 si no)

**Checkpoint**: Un usuario puede pertenecer a múltiples organizaciones y cambiar entre ellas; la resolución de sesión respeta cuál está activa. Listo para construir las historias sobre esto.

---

## Phase 3: User Story 1 - Crear workspace de cliente dentro del límite (Priority: P1) 🎯 MVP

**Goal**: Un miembro de agencia crea un workspace de cliente nuevo (organización aislada), conecta su WhatsApp, y los mensajes de ese cliente llegan únicamente ahí.

**Independent Test**: Crear una agencia de prueba en plan Starter, agregar un workspace, conectar un WhatsApp de prueba, confirmar aislamiento total frente a otros workspaces (ver `quickstart.md` → Historia 1).

### Implementation for User Story 1

- [x] T009 [US1] En `src/server/agency/credentials.ts`, agregar `createAgencyWorkspace(agencyId, name)`: valida `countActiveWorkspaces(agencyId) < planLimit` (409 si no), crea la `organization` con `agencyId` seteado, siembra pipeline + `agentProfile` (mismo patrón que `onUserCreated` en `on-signup.ts`), y llama a `grantAgencyMembersToWorkspace` (T007)
- [x] T010 [US1] Endpoint `POST /api/agency/workspaces` en `src/app/api/agency/workspaces/route.ts` — valida body con Zod (`name` requerido), llama a `createAgencyWorkspace`, devuelve 201 o 409 `plan_limit_reached` según contrato en `contracts/agency-api.md`
- [x] T011 [US1] Verificar que el flujo de conexión de WhatsApp existente (`src/components/settings/whatsapp-wizard.tsx` + su API) funciona sin cambios al operar dentro de un workspace de cliente (debe funcionar igual que hoy porque sigue siendo una `organization` normal) — ajustar solo si se detecta alguna asunción de "única organización de la instancia"
- [x] T012 [P] [US1] Test unitario en `tests/unit/agency-workspace.test.ts`: `createAgencyWorkspace` respeta el límite de plan, crea pipeline/agentProfile sembrados, y agrega membresía a todos los miembros de la agencia

**Checkpoint**: Se puede crear un workspace de cliente vía API, aislado y con WhatsApp conectable, dentro del límite del plan.

---

## Phase 4: User Story 2 - Panel único de navegación entre clientes (Priority: P1)

**Goal**: Un miembro de agencia ve la lista de sus workspaces desde un panel único y entra a cada uno para operarlo.

**Independent Test**: Crear 2+ workspaces bajo una agencia, confirmar que ambos aparecen listados y que entrar a cada uno muestra su inbox/pipeline correcto, sin fuga de datos entre ellos ni acceso a workspaces de otra agencia (ver `quickstart.md` → Historia 2).

### Implementation for User Story 2

- [x] T013 [US2] En `src/server/agency/credentials.ts`, agregar `listAgencyWorkspaces(agencyId)`: devuelve workspaces activos con nombre y estado de conexión de WhatsApp (join con la tabla de credenciales de WhatsApp existente)
- [x] T014 [US2] Endpoint `GET /api/agency` en `src/app/api/agency/route.ts` — devuelve los datos de la agencia del usuario en sesión + `activeWorkspaces` (usa `getAgencyForUser` + `countActiveWorkspaces` de T006), o `{agency: null}` si el usuario no pertenece a ninguna
- [x] T015 [US2] Endpoint `GET /api/agency/workspaces` en `src/app/api/agency/workspaces/route.ts` — usa `listAgencyWorkspaces` (T013)
- [x] T016 [US2] Página `src/app/(app)/agency/page.tsx` — server component que redirige/protege si el usuario no pertenece a una agencia
- [x] T017 [US2] Componente `src/components/agency/agency-client.tsx` — lista de workspaces (nombre + estado de conexión), cada uno navega a su inbox llamando a `POST /api/agency/workspaces/:id/enter` (T008) antes de redirigir
- [x] T018 [US2] Confirmar que el middleware/guard de acceso a rutas de una organización (donde exista) rechaza intentos de un usuario sin membresía en esa organización — cubre el edge case "acceso a workspace de otra agencia" del spec
- [x] T019 [P] [US2] Test unitario en `tests/unit/agency-panel.test.ts`: `listAgencyWorkspaces` solo devuelve workspaces activos de la agencia correcta; `getAgencyForUser` devuelve `null` para un usuario sin agencia

**Checkpoint**: El panel de agencia funciona de punta a punta: listar, entrar, operar cada workspace de forma aislada.

---

## Phase 5: User Story 3 - Bloqueo al llegar al límite del plan (Priority: P2)

**Goal**: Al alcanzar el límite de workspaces del plan, la creación de uno nuevo se bloquea con un mensaje claro; archivar un workspace libera espacio sin borrar datos.

**Independent Test**: Llevar una agencia de prueba al límite exacto de su plan, confirmar bloqueo tanto en UI como directamente contra la API; archivar un workspace y confirmar que el conteo baja y los datos persisten (ver `quickstart.md` → Historia 3).

### Implementation for User Story 3

- [x] T020 [US3] Endpoint `POST /api/agency/workspaces/:id/archive` en `src/app/api/agency/workspaces/[id]/archive/route.ts` — setea `archivedAt = now()` en la organización, validando que pertenezca a la agencia del usuario en sesión (404 si no)
- [x] T021 [US3] En `agency-client.tsx` (T017), deshabilitar el botón "Agregar cliente" cuando `activeWorkspaces >= planLimit`, con el mensaje de `contracts/agency-api.md` ("Alcanzaste el límite de N clientes de tu plan X...")
- [x] T022 [US3] Agregar acción de archivar workspace en la UI del panel de agencia (T017) — confirmación antes de archivar, dado que oculta el workspace de la lista activa
- [x] T023 [P] [US3] Test unitario en `tests/unit/agency-workspace.test.ts` (extiende T012): `createAgencyWorkspace` rechaza con 409 al llegar al límite exacto; un workspace archivado no cuenta contra el límite; archivar preserva todas las filas relacionadas (no hay `onDelete: cascade` disparándose)

**Checkpoint**: Las 3 historias del spec están completas y verificables independientemente.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cierre de la feature conforme a la Definición de Hecho reforzada del proyecto (Principios V y IX).

- [x] T024 Ejecutar gate técnico completo: `pnpm typecheck && pnpm lint && pnpm build && pnpm test`
- [x] T025 Ejecutar el guion de verificación en vivo de `quickstart.md` (las 3 historias + camino infeliz) contra la app corriendo local con mocks activos; corregir y re-verificar hasta verde (Principio IX — self-test por el implementador, no delegado)
- [x] T026 Confirmar que una organización SIN agencia (`agencyId = null`, el caso actual del producto) sigue funcionando exactamente igual que antes de esta feature — smoke test manual de un negocio directo existente
- [x] T027 [P] Documentar en el `README.md` o guía de operación cómo el operador de Vocero crea una agencia nueva y le asigna un plan (dado que es una acción administrativa manual, no self-service — FR-016)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sin dependencias — puede iniciar de inmediato
- **Foundational (Phase 2)**: Depende de Setup — BLOQUEA las 3 historias
- **User Story 1 (Phase 3)**: Depende de Foundational — es el MVP mínimo demostrable
- **User Story 2 (Phase 4)**: Depende de Foundational; usa el endpoint de creación de US1 en su UI pero es verificable con datos creados directamente en BD si se necesita probar en aislamiento
- **User Story 3 (Phase 5)**: Depende de US1 (necesita `createAgencyWorkspace` para poder alcanzar el límite) y reutiliza el componente de panel de US2 — por eso es P2 y va después
- **Polish (Phase 6)**: Depende de las 3 historias completas

### Parallel Opportunities

- T001–T003 pueden trabajarse en paralelo (mismo archivo `schema.ts` pero ediciones no solapadas) antes de T004
- T012, T019, T023 (tests unitarios) son paralelizables entre sí una vez sus respectivas implementaciones existen
- T008 (enter) es paralelizable con T009–T010 (creación) dentro de sus fases porque toca un archivo distinto

---

## Implementation Strategy

### MVP First (User Story 1)

1. Completar Phase 1 (Setup) + Phase 2 (Foundational)
2. Completar Phase 3 (US1) — a este punto ya se puede crear un workspace de cliente vía API y verificar aislamiento total
3. **DETENER Y VALIDAR**: correr Historia 1 de `quickstart.md`
4. Con esto ya es demostrable a una agencia real, aunque sin UI de panel todavía (se opera vía API/BD directamente para la demo)

### Entrega incremental

1. Setup + Foundational → base lista
2. US1 → demo de creación aislada de workspace (MVP técnico)
3. US2 → panel usable de punta a punta (MVP demostrable a una agencia real)
4. US3 → enforcement de plan, cierra el modelo de negocio por volumen
5. Polish → gate técnico + verificación en vivo antes de "Hecho"
