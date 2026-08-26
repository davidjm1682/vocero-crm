# Research: Asistente conversacional de configuración del agente

## Decisión 1: Reutilizar `chatJson<T>` sin nuevo adaptador

**Decision**: El asistente conversacional llama a `chatJson<T>` de
`src/lib/ai/index.ts` pasando `organizationId`, exactamente como ya hace
`src/server/ai/pipeline.ts` para las respuestas del agente principal.

**Rationale**: Es el único punto de contacto con el proveedor LLM permitido
por la Constitución (Principio II). Ya resuelve credenciales por
organización (`resolveProvider`), ya tiene reintentos y extracción robusta de
JSON, y ya cae a `not_configured` de forma tipada cuando no hay proveedor —
exactamente el comportamiento que el spec (FR-007, FR-008) exige replicar sin
inventar nada nuevo.

**Alternatives considered**: Un cliente LLM dedicado para el asistente
(descartado — violaría el Principio II al introducir una segunda vía de
acceso al proveedor externo, y duplicaría lógica de reintentos/extracción ya
resuelta).

## Decisión 2: Sin migración de esquema — reutilizar columnas de `agentProfile`

**Decision**: El resultado generado por el asistente (`tone`,
`instructions`, `escalationRules`) se aplica a las columnas ya existentes de
`agentProfile` (`src/lib/db/schema.ts`), vía el `PUT /api/agent/profile` ya
existente.

**Rationale**: El spec es explícito (FR-004): los campos generados deben
quedar en los mismos campos editables que existen hoy, no en una
representación paralela. Las columnas ya son `text` nullable de tamaño
suficiente (hasta 8000 caracteres en `instructions`), y el endpoint `PUT` ya
valida, autoriza por sesión/organización y persiste. Añadir una tabla de
"sesión de asistente" persistente iría contra FR-010 (no persiste el
historial no confirmado) y contra el principio de no introducir estado que
no se necesita.

**Alternatives considered**: Tabla `agentConfigAssistantSession` para
guardar el progreso de la conversación (descartada — el spec pide
explícitamente que una conversación abandonada no deje rastro; persistirla
complicaría el modelo sin necesidad real).

## Decisión 3: El endpoint del asistente solo *propone*; no escribe en `agentProfile`

**Decision**: `POST /api/agent/config-assistant` recibe las respuestas del
wizard y devuelve `{ tone, instructions, escalationRules }` generado — no
toca la base de datos. La aplicación real ocurre cuando el dueño confirma en
la UI, reutilizando el `PUT /api/agent/profile` ya existente.

**Rationale**: Cumple FR-012 (mostrar el contenido antes de guardar y pedir
confirmación explícita) de forma natural: la generación y la escritura son
dos pasos distintos en la red, así que no hace falta un flag adicional de
"modo previsualización" en el endpoint de escritura. También evita duplicar
la lógica de autorización/validación que el `PUT` ya tiene bien resuelta y
probada.

**Alternatives considered**: Un único endpoint que genera y guarda en un
solo paso, con un parámetro `confirm: boolean` (descartado — mezcla dos
responsabilidades, y complica la advertencia de sobrescritura de FR-006 al
tener que decidir esa lógica dos veces en el mismo handler).

## Decisión 4: Conversación en estado de cliente (React), no en el servidor

**Decision**: El intercambio de preguntas/respuestas del wizard vive en
estado de componente de React (`config-assistant-dialog.tsx`). El servidor
solo se invoca una vez, al final, con todas las respuestas ya recopiladas,
para generar la propuesta.

**Rationale**: El spec no requiere que el asistente "razone" turno a turno de
forma abierta — son preguntas fijas y acotadas (canal principal, qué hace el
negocio, tono deseado, cuándo escalar), consistente con la Assumption del
spec de que esto es "un intercambio acotado, no un chat abierto de duración
indefinida". Resolver todo en una sola llamada final (en vez de una llamada
por turno) es más simple, más barato (una sola invocación LLM en vez de
varias) y evita tener que gestionar estado de conversación en el servidor
sin necesidad.

**Alternatives considered**: Loop de turnos servidor-cliente con el LLM
decidiendo la siguiente pregunta dinámicamente (descartado por sobre-alcance
para el problema descrito — el spec pide reducir fricción con preguntas
guiadas, no un chatbot de exploración abierta; también complicaría el manejo
de FR-009 de forma resiliente ante fallos del proveedor a mitad de
conversación).

## Decisión 5: Detección de "ya configurado" reutiliza `isAiConfiguredFor`

**Decision**: El botón/entrada al asistente en `agent-client.tsx` se
deshabilita usando la misma señal `aiConfigured` que ya devuelve `GET
/api/agent/profile` (basada en `isAiConfiguredFor(organizationId)`).

**Rationale**: Es exactamente el criterio que el spec pide (FR-008): mismo
tratamiento que el agente principal en esa misma condición. El endpoint ya
expone ese booleano; no hace falta una nueva consulta.

**Alternatives considered**: Ninguna — es una reutilización directa de una
señal ya expuesta, no hay ambigüedad de diseño aquí.
