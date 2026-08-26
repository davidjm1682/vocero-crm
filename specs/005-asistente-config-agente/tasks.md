---
description: "Task list for Asistente conversacional de configuración del agente"
---

# Tasks: Asistente conversacional de configuración del agente

**Input**: Design documents from `/specs/005-asistente-config-agente/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/config-assistant-api.md, quickstart.md

**Tests**: No se pidió TDD explícito en el spec. Se sigue el patrón ya
establecido en el proyecto (ver `tests/unit/judge.test.ts`,
`tests/unit/agency-workspace.test.ts`): un test unitario por pieza de lógica
de dominio no trivial, escrito junto con la implementación, más el guion de
`quickstart.md` como self-test de comportamiento en vivo (Principio IX) antes
de declarar la feature terminada.

**Organization**: Tareas agrupadas por historia de usuario del spec, en el
mismo orden de prioridad (P1, P1, P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias)
- **[Story]**: US1 (configurar conversando), US2 (editar manualmente
  después), US3 (sin proveedor de IA)

## Path Conventions

Monolito Next.js existente (ver `plan.md` → Project Structure). Todas las
rutas son relativas a la raíz del repo `vocero-crm/`.

---

## Phase 1: Setup

**Purpose**: No hay modelo de datos nuevo que preparar (research.md,
Decisión 2) — el setup se limita a la lógica de dominio compartida que todas
las historias necesitan.

- [x] T001 Definir el schema Zod de request/response del asistente
  (`ConfigAssistantAnswers`, `ConfigAssistantProposal`) en
  `src/server/ai/config-assistant.ts`, según `contracts/config-assistant-api.md`
- [x] T002 [P] Escribir la función de construcción de prompt
  `buildConfigAssistantPrompt(answers)` en
  `src/server/ai/config-assistant.ts` — arma los mensajes de sistema/usuario
  a partir de las 4 respuestas del wizard (canal, negocio, tono, escalado)

**Checkpoint**: Contratos de datos y construcción de prompt listos, sin
tocar aún la red ni la UI.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: La llamada real a `chatJson` y el endpoint que la expone son
prerequisito bloqueante de las 3 historias — ninguna historia es probable sin
poder generar una propuesta.

**⚠️ CRITICAL**: Ninguna historia puede implementarse sin esto completo.

- [x] T003 Implementar `generateConfigAssistantProposal(organizationId, answers)`
  en `src/server/ai/config-assistant.ts` — llama a `chatJson` (de
  `src/lib/ai/index.ts`) con `organizationId` y el prompt de T002, valida la
  salida contra el schema de T001, y devuelve `ChatJsonResult<ConfigAssistantProposal>`
  tal cual (sin re-envolver el tipo de error)
- [x] T004 Crear `POST /api/agent/config-assistant` en
  `src/app/api/agent/config-assistant/route.ts` — usa `withAuth`, valida el
  body contra el schema de request (T001), llama a
  `generateConfigAssistantProposal` con `session.organizationId`, y traduce
  `ChatJsonResult` a las respuestas HTTP de `contracts/config-assistant-api.md`
  (200 con `proposal`, 409 `not_configured`, 502 `provider_error`, 400
  `invalid_input`) — este endpoint NUNCA escribe en `agentProfile`
  (research.md, Decisión 3)

**Checkpoint**: El endpoint genera propuestas reales contra el proveedor de
IA configurado, sin tocar la base de datos. Listo para construir las 3
historias de UI sobre esto.

---

## Phase 3: User Story 1 - Configurar el agente conversando (Priority: P1) 🎯 MVP

**Goal**: El dueño abre el asistente desde Settings → Agente, responde las
preguntas guiadas, ve una propuesta generada y puede aplicarla a los campos
existentes.

**Independent Test**: Con una organización con proveedor de IA configurado y
un perfil de agente sin tono/instrucciones, completar el wizard de punta a
punta y verificar que los campos de Settings → Agente quedan poblados tras
confirmar.

- [x] T005 [P] [US1] Crear `src/components/agent/config-assistant-dialog.tsx`
  — modal/diálogo con las 4 preguntas guiadas (canal, negocio, tono,
  escalado) como pasos secuenciales de un formulario controlado en estado de
  React (research.md, Decisión 4); botón "Siguiente" deshabilitado hasta que
  el paso actual tenga respuesta no vacía
- [x] T006 [US1] En `config-assistant-dialog.tsx`, al confirmar la última
  pregunta, llamar a `POST /api/agent/config-assistant` con las 4 respuestas
  y mostrar estado de carga mientras se genera la propuesta
- [x] T007 [US1] En `config-assistant-dialog.tsx`, mostrar la pantalla de
  revisión con el `proposal` recibido (tono/instrucciones/reglas de
  escalado) en texto de solo lectura, con botones "Aplicar" y "Descartar"
  (cumple FR-012: revisar antes de guardar)
- [x] T008 [US1] Al presionar "Aplicar", invocar la función `onSave` ya
  existente de `ProfileSection` (reutilizando el `PUT /api/agent/profile`
  actual) con el `proposal` generado, cerrar el diálogo y refrescar el
  perfil visible
- [x] T009 [US1] En `src/components/agent/agent-client.tsx`, agregar el
  punto de entrada al asistente (botón "Configurar con el asistente" o
  similar) junto a `ProfileSection`, que abre `ConfigAssistantDialog`;
  deshabilitado cuando `aiConfigured` es `false` (reutiliza la señal ya
  devuelta por `GET /api/agent/profile`)
- [x] T010 [P] [US1] Test unitario en `tests/unit/config-assistant.test.ts`
  para `buildConfigAssistantPrompt` y `generateConfigAssistantProposal` —
  cubre construcción de mensajes y propagación de un `ChatJsonResult` exitoso

**Checkpoint**: La historia 1 es funcional de punta a punta y demostrable de
forma independiente — MVP alcanzado.

---

## Phase 4: User Story 2 - Editar manualmente después de usar el asistente (Priority: P1)

**Goal**: Los campos generados por el asistente siguen siendo editables sin
restricción; reabrir el asistente sobre un perfil ya configurado advierte
antes de sobrescribir.

**Independent Test**: Generar campos vía el asistente, editar manualmente el
campo de tono desde `ProfileSection` sin pasar por el asistente, y verificar
que el cambio se guarda igual que hoy. Luego reabrir el asistente y verificar
que aparece la advertencia de sobrescritura antes de aplicar.

- [x] T011 [US2] Verificar (sin cambios de código esperados, solo prueba) que
  `ProfileSection` en `agent-client.tsx` permite editar y guardar tono,
  instrucciones y reglas de escalado tras haber sido poblados por el
  asistente — si algo interfiere, corregirlo en `agent-client.tsx`
- [x] T012 [US2] En `config-assistant-dialog.tsx`, antes de mostrar la
  primera pregunta, verificar si el perfil actual ya tiene tono o
  instrucciones no vacíos (recibido como prop desde `agent-client.tsx`) y, si
  es así, mostrar una advertencia de que continuar sobrescribirá el
  contenido existente, requiriendo una confirmación explícita para avanzar
  (FR-006)
- [x] T013 [P] [US2] Test unitario en `tests/unit/config-assistant.test.ts`
  (o archivo de componente si el proyecto ya prueba componentes React) que
  cubra la lógica de detección de "perfil ya configurado" usada por T012

**Checkpoint**: Generar y editar manualmente conviven sin fricción; reabrir
el asistente sobre un perfil existente nunca sobrescribe en silencio.

---

## Phase 5: User Story 3 - Comportamiento sin proveedor de IA configurado (Priority: P2)

**Goal**: En una organización sin proveedor de IA, el asistente se muestra
como no disponible con un mensaje claro, consistente con el tratamiento
actual del agente principal.

**Independent Test**: En una organización sin credenciales de IA
configuradas, entrar a Settings → Agente y verificar que el punto de entrada
del asistente aparece deshabilitado con el mensaje esperado; configurar el
proveedor y verificar que pasa a estar disponible sin pasos adicionales.

- [x] T014 [US3] En `agent-client.tsx`, cuando `aiConfigured` es `false`,
  mostrar junto al punto de entrada del asistente (T009) un mensaje
  consistente con el ya existente para el agente principal ("Configura tu
  proveedor de IA para activar..."), en vez de solo deshabilitar el botón
  sin explicación
- [x] T015 [US3] Verificar que `POST /api/agent/config-assistant` devuelve
  409 `not_configured` de forma defensiva incluso si la UI llegara a
  invocarlo con el botón deshabilitado (doble verificación servidor/cliente)
- [x] T016 [P] [US3] Test unitario en `tests/unit/config-assistant.test.ts`
  que cubra el caso `not_configured` de `generateConfigAssistantProposal`
  (sin proveedor configurado en la organización)

**Checkpoint**: Las 3 historias del spec están completas e independientemente
verificables.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verificación de comportamiento en vivo (Principio IX) y cierre
del gate técnico completo antes de declarar la feature "Hecha".

- [x] T017 Escribir el guion E2E `tests/e2e/005-asistente-config-agente.md`
  cubriendo los 5 escenarios de `quickstart.md` (camino feliz, edición
  manual posterior, sin proveedor de IA, camino infeliz por fallo del
  proveedor, reconfiguración con advertencia)
- [x] T018 Ejecutar `pnpm test:e2e` contra `ai-mock` con los 5 escenarios de
  T017 y corregir hasta verde (loop de auto-corrección, Principio IX)
- [x] T019 Ejecutar el gate técnico completo:
  `pnpm typecheck && pnpm lint && pnpm build && pnpm test`, corrigiendo
  cualquier fallo hasta verde
- [x] T020 Actualizar `README.md` con una sección breve sobre el asistente
  conversacional de configuración del agente, siguiendo el estilo de la
  sección "Panel de agencia multi-cliente" ya existente

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → bloquea Phase 2.
- **Phase 2 (Foundational)** → bloquea las 3 historias (Phase 3, 4, 5). No
  hay historia que pueda avanzar sin el endpoint de generación funcionando.
- **User Story 1 (Phase 3)** → independiente tras Phase 2. Es el MVP.
- **User Story 2 (Phase 4)** → depende de que exista el diálogo de US1
  (`config-assistant-dialog.tsx`) para agregarle la advertencia — no es
  bloqueante para el endpoint, pero sí para la UI concreta.
- **User Story 3 (Phase 5)** → depende del punto de entrada de US1
  (`agent-client.tsx` modificado) para agregarle el mensaje explicativo.
- **Phase 6 (Polish)** → después de las 3 historias.

## Parallel Execution Examples

Dentro de Phase 1: T001 y T002 pueden ir en paralelo (mismo archivo, pero
piezas independientes — en la práctica conviene secuenciar por ser el mismo
archivo; marcar [P] refleja que no hay dependencia lógica entre ambas, no que
deban editarse simultáneamente).

Dentro de Phase 3: T005 y T010 son paralelizables entre sí (componente UI vs.
test de la capa de servidor ya completada en Phase 2).

## Implementation Strategy

**MVP first**: Completar Phase 1 + Phase 2 + Phase 3 (User Story 1) entrega
un asistente conversacional funcional de punta a punta — el valor central de
la feature. Las historias 2 y 3 son refinamientos de robustez y edge cases
sobre ese mismo flujo, no funcionalidad nueva independiente.

**Incremental delivery**: Tras el MVP, Phase 4 (edición manual + advertencia
de sobrescritura) y Phase 5 (mensaje sin proveedor de IA) pueden entregarse
en cualquier orden entre sí — ambas son mejoras acotadas sobre el mismo
componente ya construido.
