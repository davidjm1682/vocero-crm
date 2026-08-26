---
description: "Task list for Checklist de onboarding guiado"
---

# Tasks: Checklist de onboarding guiado

**Input**: Design documents from `/specs/006-onboarding-checklist/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/onboarding-api.md, quickstart.md

**Tests**: No se pidió TDD explícito. Se sigue el patrón ya establecido en
el proyecto: un test unitario por pieza de lógica de dominio no trivial,
más el guion de `quickstart.md` como self-test de comportamiento en vivo
(Principio IX) antes de declarar la feature terminada.

**Organization**: Tareas agrupadas por historia de usuario del spec, en el
mismo orden de prioridad (P1, P1, P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias)
- **[Story]**: US1 (ver progreso de un vistazo), US2 (actualización
  automática), US3 (colapsar y reabrir)

## Path Conventions

Monolito Next.js existente. Todas las rutas son relativas a la raíz del
repo `vocero-crm/`.

---

## Phase 1: Setup

**Purpose**: No hay modelo de datos nuevo que preparar (research.md,
Decisión 1) — el setup se limita a la lógica de cálculo de estado que todas
las historias necesitan.

- [x] T001 Crear `src/server/onboarding/status.ts` con el tipo
  `OnboardingStatus`/`OnboardingStep` (según `data-model.md`) y la constante
  de los 3 pasos con su `label`/`href` (WhatsApp → `/settings/whatsapp`,
  Agente → `/agent`, Marca → `/settings/branding`)

**Checkpoint**: Tipos y metadatos de los 3 pasos listos.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: El cálculo real de estado y el endpoint que lo expone son
prerequisito bloqueante de las 3 historias.

**⚠️ CRITICAL**: Ninguna historia puede implementarse sin esto completo.

- [x] T002 Implementar `getOnboardingStatus(organizationId)` en
  `src/server/onboarding/status.ts` — consulta `metaCredentials` (`status =
  "connected"`), `agentProfile` (`enabled` true y `tone`/`instructions` no
  vacíos) y `organization` (`name`/`logo` distintos del default, ver
  research.md Decisión 2) usando `scoped()`, calcula `completedCount`/
  `totalCount`/`percent`, y devuelve el `OnboardingStatus` completo
- [x] T003 Crear `GET /api/onboarding` en `src/app/api/onboarding/route.ts`
  — usa `withAuth`, llama a `getOnboardingStatus(session.organizationId)` y
  devuelve el resultado tal cual (contrato en `contracts/onboarding-api.md`)

**Checkpoint**: El endpoint devuelve el estado real de los 3 pasos para
cualquier organización. Listo para construir las 3 historias de UI sobre
esto.

---

## Phase 3: User Story 1 - Ver el progreso de configuración inicial de un vistazo (Priority: P1) 🎯 MVP

**Goal**: El dueño ve el checklist con los 3 pasos y la barra de progreso al
entrar a Vocero, y cada paso pendiente lleva a su pantalla correspondiente.

**Independent Test**: Con una organización recién creada (sin ningún paso
completado), entrar a `/inbox` y verificar que el checklist aparece con
todos los pasos pendientes y 0% de progreso; hacer clic en un paso y
verificar que navega a la pantalla correcta.

- [x] T004 [P] [US1] Crear `src/components/onboarding/onboarding-checklist.tsx`
  — hace fetch a `/api/onboarding`, muestra los 3 pasos con su estado
  (pendiente/completo) y una barra de progreso con el `percent` recibido;
  cada paso pendiente es un `Link` al `href` correspondiente
- [x] T005 [US1] Montar `OnboardingChecklist` en
  `src/app/(app)/inbox/page.tsx` (o en el componente cliente que envuelve la
  bandeja), visible solo mientras `percent < 100`

**Checkpoint**: La historia 1 es funcional de punta a punta — MVP alcanzado.

---

## Phase 4: User Story 2 - El checklist se actualiza automáticamente al completar cada paso (Priority: P1)

**Goal**: Completar un paso desde su pantalla nativa se refleja en el
checklist sin edición manual, incluyendo el caso de deshacer un paso.

**Independent Test**: Completar la conexión de WhatsApp desde
`/settings/whatsapp` y volver a `/inbox` — el paso aparece completo sin
ninguna acción adicional. Desconectar WhatsApp y verificar que vuelve a
pendiente.

- [x] T006 [US2] Verificar (sin cambios de código esperados, ya que
  `OnboardingChecklist` hace fetch fresco en cada montaje) que navegar desde
  `/settings/whatsapp` de vuelta a `/inbox` dispara un nuevo fetch a
  `/api/onboarding` — si el componente cachea el resultado entre
  navegaciones, corregirlo para que refetchee al montarse
- [x] T007 [P] [US2] Test unitario en `tests/unit/onboarding-status.test.ts`
  que cubra: paso completo cuando existe la condición, paso pendiente
  cuando NO existe (incluyendo el caso de "se desconectó después de estar
  conectado" — misma función, dos llamadas con datos distintos), y el
  cálculo de `percent` para 0/3, 1/3, 2/3 y 3/3 pasos completos

**Checkpoint**: El checklist siempre refleja el estado real y vigente, en
ambas direcciones (completar y deshacer).

---

## Phase 5: User Story 3 - Ocultar el checklist una vez terminado, pero poder volver a verlo (Priority: P2)

**Goal**: Al completar todos los pasos, el checklist deja de mostrarse de
forma prominente, pero sigue accesible desde un punto de acceso persistente.

**Independent Test**: Completar los 3 pasos, verificar que el checklist ya
no aparece en `/inbox`, y luego encontrar el punto de acceso persistente en
el nav para volver a verlo completo.

- [x] T008 [US3] En `src/components/app-nav.tsx`, agregar un fetch
  condicional a `/api/onboarding` en el mismo `useEffect` que ya resuelve
  `hasAgency` (patrón de 004), y mostrar un link "Configuración inicial" (o
  similar) hacia una vista de checklist completo — visible siempre, pero
  con un indicador de progreso solo mientras `percent < 100`
- [x] T009 [US3] Crear la vista de checklist completo accesible desde ese
  link (puede ser una ruta nueva bajo `/settings` o un modal que reutilice
  `OnboardingChecklist` con los 3 pasos siempre visibles, no solo mientras
  falten) — decisión de implementación libre siempre que cumpla FR-008
  (accesible bajo demanda con el estado de cada paso)
- [x] T010 [P] [US3] Test unitario o de componente que cubra que
  `OnboardingChecklist`/la vista completa muestra los 3 pasos con su estado
  incluso cuando todos están completos (no se vacía ni se rompe al llegar a
  100%)

**Checkpoint**: Las 3 historias del spec están completas e
independientemente verificables.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verificación de comportamiento en vivo (Principio IX) y cierre
del gate técnico completo antes de declarar la feature "Hecha".

- [x] T011 Escribir el guion E2E `tests/e2e/006-onboarding-checklist.md`
  cubriendo los 5 escenarios de `quickstart.md` (organización nueva,
  actualización automática, organización preexistente, deshacer un paso,
  acceso persistente)
- [x] T012 Ejecutar el self-test de comportamiento en vivo (navegador real o
  guion manual) contra los 5 escenarios de T011 y corregir hasta verde
  (loop de auto-corrección, Principio IX) — prestar especial atención al
  escenario de "organización preexistente" con datos reales ya cargados
- [x] T013 Ejecutar el gate técnico completo:
  `pnpm typecheck && pnpm lint && pnpm build && pnpm test`, corrigiendo
  cualquier fallo hasta verde
- [x] T014 Actualizar `README.md` con una sección breve sobre el checklist
  de onboarding, siguiendo el estilo de las secciones ya existentes

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → bloquea Phase 2.
- **Phase 2 (Foundational)** → bloquea las 3 historias. Ninguna historia
  puede avanzar sin el endpoint de estado funcionando.
- **User Story 1 (Phase 3)** → independiente tras Phase 2. Es el MVP.
- **User Story 2 (Phase 4)** → depende del componente de US1 para
  verificar/ajustar su comportamiento de refetch.
- **User Story 3 (Phase 5)** → depende de que exista `OnboardingChecklist`
  (US1) para reutilizarlo en la vista completa.
- **Phase 6 (Polish)** → después de las 3 historias.

## Parallel Execution Examples

Dentro de Phase 3: T004 es independiente y puede iniciarse en cuanto Phase 2
esté lista.

Dentro de Phase 4/5: T007 y T010 (tests) son paralelizables respecto a las
tareas de UI de su misma fase.

## Implementation Strategy

**MVP first**: Completar Phase 1 + Phase 2 + Phase 3 (User Story 1) entrega
un checklist funcional visible al entrar a Vocero — el valor central de la
feature.

**Incremental delivery**: Phase 4 (robustez ante deshacer un paso) y Phase 5
(colapsar + acceso persistente) son refinamientos sobre el mismo componente
base, entregables en cualquier orden entre sí tras el MVP.
