# Feature Specification: Panel de agencia multi-cliente

**Feature Branch**: `004-agencia-multi-cliente`

**Created**: 2026-08-24

**Status**: Draft

**Input**: User description: "Panel de agencia multi-cliente: una nueva entidad 'agencia' con un plan (Starter=10, Growth=15, Scale=30 workspaces de cliente incluidos) que administra múltiples workspaces de negocio (cada uno hoy es una 'organization' completa: su propio WhatsApp Business conectado, contactos, pipeline, agente de IA y conversaciones, totalmente aislados entre sí). La agencia opera desde UN panel único donde ve la lista de sus clientes/workspaces conectados y puede entrar a cada uno para gestionar sus conversaciones y pipeline como si fuera el dueño de esa organización. Solo la agencia (sus miembros) conecta el WhatsApp de cada cliente nuevo — el cliente final nunca tiene login propio ni ve Vocero directamente, es transparente para él. Al llegar al límite de workspaces de su plan, el botón de 'agregar cliente' se deshabilita con un mensaje claro de que debe subir de plan para seguir agregando. Reutiliza al máximo el modelo actual de 'organization' como la unidad aislada de datos (WhatsApp, contactos, pipeline, IA) — la agencia es una capa nueva por ENCIMA de organization, no un reemplazo. Los miembros de la agencia deben poder acceder a TODAS las organizaciones/workspaces bajo su agencia (hoy un member solo pertenece a una organización)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Crear un workspace de cliente nuevo dentro del límite del plan (Priority: P1)

Un miembro de la agencia entra a su panel, hace clic en "Agregar cliente", le pone un nombre al nuevo negocio y conecta el WhatsApp Business de ese cliente. El nuevo workspace queda listo para operar: contactos, pipeline y agente de IA vacíos, esperando la primera conversación.

**Why this priority**: Sin esto no existe el producto — es el flujo que justifica cobrar por plan de N clientes. Es el mínimo indispensable para que una agencia empiece a usar Vocero bajo este modelo.

**Independent Test**: Puede probarse por completo creando una agencia nueva en plan Starter, agregando un workspace de cliente, conectando un número de WhatsApp de prueba, y confirmando que llegan mensajes a ESE workspace específico sin afectar a ningún otro.

**Acceptance Scenarios**:

1. **Given** una agencia en plan Starter con 3 de 10 workspaces usados, **When** un miembro de la agencia hace clic en "Agregar cliente" y completa el formulario, **Then** se crea un workspace nuevo, vacío, aislado de los demás, y el contador pasa a 4 de 10.
2. **Given** un workspace de cliente recién creado, **When** el miembro de la agencia conecta el WhatsApp Business de ese cliente, **Then** los mensajes entrantes a ese número aparecen únicamente en ese workspace.
3. **Given** dos workspaces de clientes distintos bajo la misma agencia, **When** se revisa el pipeline, los contactos o las conversaciones de uno, **Then** no aparece ningún dato del otro workspace.

---

### User Story 2 - Ver y entrar a la lista de clientes de la agencia (Priority: P1)

Un miembro de la agencia entra a su panel único y ve la lista de todos los workspaces de cliente activos (nombre, estado de conexión de WhatsApp, y algún indicador de actividad reciente). Hace clic en uno y entra a gestionar sus conversaciones y pipeline como si fuera el dueño de ese negocio.

**Why this priority**: Es el uso diario del producto — sin poder navegar entre clientes desde un solo lugar, la agencia no puede operar múltiples cuentas de forma práctica.

**Independent Test**: Puede probarse creando 2+ workspaces bajo una agencia, entrando al panel, confirmando que ambos aparecen listados, y verificando que al entrar a cada uno se ve el pipeline/inbox correcto de ESE cliente.

**Acceptance Scenarios**:

1. **Given** una agencia con 5 workspaces de cliente creados, **When** un miembro de la agencia abre el panel de agencia, **Then** ve los 5 workspaces listados con su nombre y estado de conexión de WhatsApp.
2. **Given** el panel de agencia con la lista de clientes, **When** el miembro hace clic en uno de ellos, **Then** entra al inbox/pipeline de ese workspace específico y puede operarlo con normalidad (leer y responder conversaciones, mover leads de etapa).
3. **Given** un miembro que pertenece a la agencia, **When** intenta acceder a un workspace de cliente de OTRA agencia (no la suya) mediante manipulación directa de URL, **Then** el acceso es denegado.

---

### User Story 3 - Bloqueo al llegar al límite del plan (Priority: P2)

Una agencia en plan Starter (10 workspaces incluidos) ya tiene 10 clientes activos. Un miembro intenta agregar el cliente número 11. El sistema le impide crear el workspace nuevo y le muestra un mensaje claro indicando que debe subir de plan para seguir agregando clientes.

**Why this priority**: Es lo que hace el modelo de precios por volumen sostenible — sin este límite, no hay razón para que una agencia pague más al crecer. Es P2 (no P1) porque el negocio puede operar manualmente vendiendo planes sin este enforcement automático en un primer momento, pero se vuelve necesario en cuanto haya más de una agencia activa.

**Independent Test**: Puede probarse llevando una agencia de prueba al límite de su plan (crear el número exacto de workspaces incluidos) e intentando crear uno adicional — debe bloquearse sin necesidad de ningún otro flujo.

**Acceptance Scenarios**:

1. **Given** una agencia en plan Starter con 10 de 10 workspaces usados, **When** un miembro intenta agregar un cliente nuevo, **Then** el botón "Agregar cliente" aparece deshabilitado (o la acción es rechazada) con un mensaje explicando que alcanzó el límite del plan y debe subir de plan para continuar.
2. **Given** una agencia que alcanzó su límite y fue movida manualmente a un plan superior (ej. de Starter a Growth), **When** un miembro vuelve a intentar agregar un cliente, **Then** la acción se permite normalmente hasta el nuevo límite (15).
3. **Given** una agencia con workspaces archivados/desactivados que ya no cuentan como clientes activos, **When** se calcula el uso contra el límite del plan, **Then** solo se cuentan los workspaces activos, no los archivados.

---

### Edge Cases

- ¿Qué pasa si un miembro de la agencia es removido de la agencia? Pierde acceso a TODOS los workspaces de esa agencia inmediatamente, no solo a uno.
- ¿Qué pasa si se intenta crear un workspace de cliente con el mismo número de WhatsApp que ya está conectado en otro workspace (de la misma agencia u otra)? Debe rechazarse — un número de WhatsApp solo puede estar activo en un workspace a la vez en todo el sistema.
- ¿Cómo se distingue una "organization" que es un workspace de cliente de una agencia, de una "organization" independiente (un negocio que usa Vocero directamente, sin agencia)? El sistema debe tratar ambos casos sin conflicto — una organización sin agencia asociada sigue funcionando exactamente igual que hoy.
- ¿Qué pasa si la agencia quiere archivar/dar de baja a un cliente que ya no le paga, sin borrar sus datos? Debe existir una forma de desactivar un workspace (dejándolo fuera del conteo del límite del plan) sin eliminar permanentemente sus datos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir crear una entidad "agencia" con un nombre y un plan asignado (Starter, Growth, o Scale), cada uno con un límite numérico de workspaces de cliente incluidos (10, 15, 30 respectivamente).
- **FR-002**: El sistema DEBE permitir que una agencia tenga uno o más miembros (usuarios) con acceso administrativo a la agencia y a todos sus workspaces de cliente.
- **FR-003**: El sistema DEBE permitir que un miembro de la agencia cree un workspace de cliente nuevo, siempre que la agencia no haya alcanzado el límite de su plan.
- **FR-004**: El sistema DEBE reutilizar el modelo de datos existente de "organization" (WhatsApp conectado, contactos, pipeline, agente de IA, conversaciones) como la unidad aislada que representa cada workspace de cliente — sin duplicar ni reemplazar ese modelo.
- **FR-005**: El sistema DEBE aislar completamente los datos entre workspaces de clientes distintos, incluso cuando pertenecen a la misma agencia — ningún dato (contacto, conversación, pipeline) de un workspace debe ser visible desde otro.
- **FR-006**: El sistema DEBE dar a todo miembro de la agencia acceso a operar (ver y gestionar conversaciones, pipeline) cualquier workspace de cliente que pertenezca a su agencia.
- **FR-007**: El sistema DEBE presentar un panel único de agencia donde los miembros vean la lista de todos sus workspaces de cliente activos, con al menos: nombre del cliente y estado de conexión de WhatsApp.
- **FR-008**: El sistema DEBE permitir entrar desde el panel de agencia a la vista completa (inbox, pipeline, contactos) de un workspace de cliente específico.
- **FR-009**: El sistema DEBE contar únicamente los workspaces de cliente activos (no archivados/dados de baja) contra el límite del plan de la agencia.
- **FR-010**: El sistema DEBE bloquear la creación de un nuevo workspace de cliente cuando la agencia alcanzó el límite de su plan, mostrando un mensaje que indique que debe subir de plan para continuar.
- **FR-011**: El sistema DEBE impedir que un miembro de una agencia acceda a workspaces de clientes que pertenecen a una agencia distinta.
- **FR-012**: El sistema DEBE impedir conectar un mismo número de WhatsApp Business en más de un workspace activo simultáneamente en todo el sistema.
- **FR-013**: El sistema DEBE permitir que una organización exista de forma independiente, sin pertenecer a ninguna agencia, funcionando exactamente igual que hoy (compatibilidad retroactiva total con el modelo actual de un negocio directo).
- **FR-014**: El sistema DEBE permitir archivar/dar de baja un workspace de cliente sin eliminar sus datos, y excluirlo del conteo contra el límite del plan al hacerlo.
- **FR-015**: El sistema DEBE revocar el acceso a todos los workspaces de una agencia inmediatamente cuando un miembro es removido de esa agencia.
- **FR-016**: El sistema DEBE permitir que el operador de Vocero actualice el plan de una agencia (cambiar su límite de workspaces incluidos) mediante una acción administrativa directa — sin autoservicio ni cobro automático, dado que no hay procesador de pagos integrado en v1 (Constitución II).

### Key Entities *(include if feature involves data)*

- **Agencia**: Representa al cliente que revende Vocero a sus propios clientes finales. Tiene un nombre, un plan (con un límite de workspaces incluidos), y uno o más miembros con acceso administrativo. Es la capa nueva que agrupa a varias organizaciones bajo un mismo panel.
- **Workspace de cliente**: Es la reutilización del concepto existente de "organization" — la unidad aislada de datos de un negocio (WhatsApp conectado, contactos, pipeline, agente de IA, conversaciones). La diferencia con hoy es que un workspace de cliente puede opcionalmente pertenecer a una agencia; una organización sin agencia sigue siendo un negocio independiente como ya funciona.
- **Miembro de agencia**: Un usuario con acceso a la agencia y, por extensión, a todos los workspaces de cliente activos bajo esa agencia — a diferencia del modelo actual donde un miembro pertenece a una sola organización.
- **Plan de agencia**: Define el límite de workspaces de cliente incluidos (Starter=10, Growth=15, Scale=30) que la agencia puede tener activos simultáneamente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un miembro de agencia puede crear un workspace de cliente nuevo y dejarlo listo para recibir mensajes de WhatsApp en menos de 5 minutos.
- **SC-002**: Una agencia con hasta 30 workspaces de cliente activos puede navegar entre todos ellos desde un único panel, sin necesidad de iniciar sesión por separado en cada uno.
- **SC-003**: El 100% de los intentos de crear un workspace por encima del límite del plan son bloqueados, sin excepciones.
- **SC-004**: El 100% de los datos (conversaciones, contactos, pipeline) de un workspace de cliente permanecen invisibles desde cualquier otro workspace, incluso dentro de la misma agencia.
- **SC-005**: Una organización creada antes de esta feature (sin agencia asociada) sigue operando sin ningún cambio de comportamiento visible para su dueño.

## Assumptions

- Solo los miembros de la agencia conectan el WhatsApp de cada cliente nuevo; el cliente final nunca tiene acceso propio a Vocero en esta versión (confirmado explícitamente por el dueño del producto).
- No existe procesador de pagos integrado (Constitución II prohíbe Stripe y servicios externos similares en v1); la asignación y el cambio de plan de una agencia se gestionan fuera del producto o mediante una acción administrativa simple, no un flujo de checkout self-service con cobro automático.
- Los tres planes (Starter/10, Growth/15, Scale/30) son fijos en esta versión; no se requiere un editor de planes personalizado.
- El límite del plan aplica sobre workspaces activos; los archivados no cuentan, pero tampoco se eliminan sus datos.
- Un miembro de agencia tiene el mismo nivel de acceso a todos los workspaces de su agencia (no hay, en esta versión, permisos diferenciados por workspace dentro de una misma agencia — eso queda fuera de alcance).
- El modelo de "organization" existente (WhatsApp, contactos, pipeline, IA, conversaciones) no requiere cambios de comportamiento — solo gana una relación opcional hacia una agencia.
