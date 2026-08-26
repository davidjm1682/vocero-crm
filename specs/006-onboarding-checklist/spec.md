# Feature Specification: Checklist de onboarding guiado

**Feature Branch**: `006-onboarding-checklist`

**Created**: 2026-08-25

**Status**: Draft

**Input**: User description: "Checklist de onboarding guiado: al entrar por primera vez a Vocero, el dueño del negocio ve un panel con una lista de pasos numerados y una barra de progreso (porcentaje completado) que lo guían a completar la configuración inicial esencial: conectar WhatsApp, configurar el agente de IA, personalizar la marca (nombre/logo del negocio), y crear su primer contacto o pipeline. Cada paso muestra su estado (pendiente/completo) y un enlace directo a la pantalla donde se completa. El checklist desaparece o se colapsa una vez completados todos los pasos esenciales, pero puede volver a mostrarse desde algún lugar accesible."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver el progreso de configuración inicial de un vistazo (Priority: P1)

Un dueño de negocio que acaba de registrarse entra por primera vez a Vocero y, en lugar de tener que descubrir por su cuenta qué debe configurar antes de que el CRM sea útil, ve un panel con los pasos esenciales (conectar WhatsApp, configurar el agente de IA, personalizar la marca del negocio) y una barra de progreso que le muestra cuánto le falta.

**Why this priority**: Es el valor central de la feature — sin esto no hay checklist. Reduce el riesgo de que un dueño nuevo se pierda o abandone antes de completar la configuración mínima para que el producto funcione (WhatsApp conectado + agente configurado son requisitos reales de valor, no opcionales cosméticos).

**Independent Test**: Puede probarse por completo con una organización recién creada (sin WhatsApp conectado, sin agente configurado, sin marca personalizada) entrando a la pantalla principal y verificando que el checklist aparece con todos los pasos en estado pendiente y 0% de progreso.

**Acceptance Scenarios**:

1. **Given** una organización recién creada sin ningún paso completado, **When** el dueño entra a Vocero, **Then** ve el checklist de onboarding con todos los pasos marcados como pendientes y la barra de progreso en 0%.
2. **Given** el checklist visible, **When** el dueño hace clic en un paso pendiente, **Then** es llevado directamente a la pantalla de configuración correspondiente a ese paso.
3. **Given** una organización que ya completó algunos pasos (por ejemplo, WhatsApp conectado) pero no todos, **When** el dueño ve el checklist, **Then** los pasos completados aparecen marcados como tal y la barra de progreso refleja la proporción real completada.

---

### User Story 2 - El checklist se actualiza automáticamente al completar cada paso (Priority: P1)

Un dueño que está completando el onboarding conecta WhatsApp desde la pantalla correspondiente y vuelve al checklist (o navega a cualquier pantalla donde el checklist es visible). Sin ninguna acción adicional de su parte, el paso aparece marcado como completo y el progreso general aumenta.

**Why this priority**: Sin actualización automática, el checklist se vuelve una lista estática que puede mentir sobre el estado real y perder toda su utilidad como guía confiable — es tan esencial como mostrar el checklist en primer lugar.

**Independent Test**: Puede probarse completando un paso desde su pantalla nativa (por ejemplo, guardando tono e instrucciones en Settings → Agente) y verificando que, sin recargar manualmente el estado del checklist, este refleja el paso como completo la próxima vez que se consulta.

**Acceptance Scenarios**:

1. **Given** el paso "Conectar WhatsApp" pendiente, **When** el dueño completa la conexión de WhatsApp desde su pantalla dedicada, **Then** el checklist muestra ese paso como completo la siguiente vez que se visualiza, sin requerir edición manual del checklist.
2. **Given** todos los pasos esenciales completados excepto uno, **When** el dueño completa el último paso pendiente, **Then** la barra de progreso llega a 100% y el sistema refleja que el onboarding está terminado.

---

### User Story 3 - Ocultar el checklist una vez terminado, pero poder volver a verlo (Priority: P2)

Un dueño que ya completó todos los pasos esenciales del onboarding ya no necesita ver el checklist en cada visita — pero en algún momento posterior quiere revisarlo de nuevo (por ejemplo, para confirmar qué configuró o para orientar a un colega nuevo en el equipo).

**Why this priority**: Evita que el checklist se convierta en ruido visual permanente para negocios ya operando, pero preserva su valor de referencia — es una mejora de la experiencia, no una función sin la cual el onboarding no cumple su propósito.

**Independent Test**: Puede probarse completando todos los pasos esenciales, verificando que el checklist deja de mostrarse de forma prominente por defecto, y luego accediendo a él desde el punto de entrada persistente para confirmar que sigue disponible bajo demanda.

**Acceptance Scenarios**:

1. **Given** todos los pasos esenciales completados, **When** el dueño navega por Vocero, **Then** el checklist ya no se muestra de forma prominente por defecto.
2. **Given** el checklist colapsado tras completarse, **When** el dueño busca el punto de entrada persistente para reabrirlo, **Then** puede consultar el checklist completo con el estado de cada paso en cualquier momento.

### Edge Cases

- ¿Qué pasa si un dueño completa un paso y luego lo "deshace" (por ejemplo, desconecta WhatsApp o borra el tono del agente)? El checklist debe reflejar el estado real vigente: el paso vuelve a aparecer como pendiente, ya que el estado se deriva de la configuración actual, no de un registro histórico de "alguna vez se completó".
- ¿Qué pasa si dos usuarios de la misma organización ven el checklist al mismo tiempo y uno completa un paso? El otro usuario ve el paso actualizado la próxima vez que consulta el checklist (no requiere sincronización en tiempo real).
- ¿Qué pasa si el negocio ya tenía WhatsApp/agente/marca configurados antes de que existiera esta feature (organización preexistente)? El checklist debe evaluar el estado real de cada paso al mostrarse por primera vez — una organización que ya cumple todos los criterios ve el checklist ya completo (o colapsado) desde el principio, sin pasar por el estado "todo pendiente".
- ¿Qué pasa si el paso "proveedor de IA configurado" ya viene resuelto por variables de entorno de la instancia (no por acción del dueño en la UI)? Cuenta igual como completo — al dueño le interesa que el producto funcione, no el mecanismo por el cual quedó configurado.
- ¿Qué pasa si el dueño nunca completa todos los pasos? El checklist permanece visible indefinidamente hasta que se completen o hasta que el dueño lo colapse manualmente (ver Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE mostrar, en un lugar prominente accesible tras iniciar sesión, un checklist de onboarding con los pasos esenciales de configuración inicial: conectar WhatsApp, configurar el agente de IA, y personalizar la marca del negocio (nombre y/o logo).
- **FR-002**: El checklist DEBE mostrar un indicador de progreso (por ejemplo, un porcentaje o una barra) que refleje la proporción de pasos esenciales completados sobre el total.
- **FR-003**: Cada paso del checklist DEBE mostrar su estado actual (pendiente o completo) de forma visualmente distinguible.
- **FR-004**: Cada paso pendiente DEBE incluir un enlace o acción que lleve directamente a la pantalla donde ese paso se completa.
- **FR-005**: El estado de cada paso DEBE derivarse de la configuración real y vigente de la organización (por ejemplo, existe una conexión de WhatsApp activa; el agente de IA tiene tono e instrucciones definidos y está habilitado; el nombre o logo del negocio fue personalizado más allá del valor por defecto) — no de un registro separado de "el dueño marcó esto como hecho".
- **FR-006**: Si un paso previamente completo deja de cumplir su condición (por ejemplo, se desconecta WhatsApp), el checklist DEBE reflejar ese paso como pendiente nuevamente la siguiente vez que se muestra.
- **FR-007**: Cuando todos los pasos esenciales están completos, el sistema DEBE dejar de mostrar el checklist de forma prominente por defecto.
- **FR-008**: El sistema DEBE ofrecer un punto de acceso persistente (visible incluso después de que el checklist se oculte por completitud) desde el cual cualquier usuario de la organización pueda volver a consultar el checklist completo y el estado de cada paso.
- **FR-009**: El checklist DEBE reflejar correctamente, desde la primera vez que se muestra, el estado real de una organización que ya cumplía algunos o todos los criterios antes de que esta feature existiera (sin requerir una migración de datos que "reinicie" el progreso a cero).
- **FR-010**: El checklist DEBE ser visible para cualquier usuario con acceso a la organización (no limitado a un rol específico), reflejando el mismo estado para todos los miembros.

### Key Entities

- **Paso de onboarding**: Representa una tarea esencial de configuración inicial (conectar WhatsApp, configurar agente de IA, personalizar marca). No es una entidad persistida de forma independiente — su estado (completo/pendiente) se deriva en el momento de consultarse a partir de la configuración existente de la organización (conexión de WhatsApp, perfil del agente, nombre/logo de la organización).
- **Progreso de onboarding**: Valor calculado (no almacenado) que resume cuántos pasos esenciales están completos sobre el total, usado para la barra/indicador de progreso.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un dueño de negocio nuevo puede identificar, en menos de 10 segundos desde que entra por primera vez a Vocero, cuáles de los pasos esenciales de configuración le faltan completar.
- **SC-002**: El 100% de las organizaciones que ya tenían WhatsApp, agente de IA o marca configurados antes de esta feature ven esos pasos correctamente marcados como completos la primera vez que se les muestra el checklist, sin necesitar volver a configurarlos.
- **SC-003**: Cada clic en un paso pendiente del checklist lleva al dueño a la pantalla correcta de configuración en un solo paso de navegación, sin necesitar buscarla manualmente en el menú.
- **SC-004**: Una vez completados todos los pasos esenciales, el checklist deja de aparecer de forma prominente en el 100% de las visitas posteriores, sin intervención manual del dueño.
- **SC-005**: El checklist sigue siendo accesible bajo demanda en el 100% de los casos después de completarse, verificable navegando al punto de acceso persistente.

## Assumptions

- Los pasos esenciales del checklist para esta primera versión son: conectar WhatsApp, configurar el agente de IA (tono e instrucciones definidos y agente habilitado), y personalizar la marca del negocio (nombre y/o logo distintos del valor por defecto). No se incluye "crear el primer contacto o pipeline" como paso obligatorio del checklist, dado que el pipeline ya viene sembrado automáticamente al crear la organización y no requiere una acción de configuración por parte del dueño; puede añadirse en una iteración futura si se decide lo contrario.
- El estado de cada paso se calcula en el momento de mostrarse (derivado de la configuración vigente), sin necesidad de una nueva columna o tabla que registre "onboarding completado" — esto evita que el checklist se desincronice de la realidad si el dueño deshace una configuración.
- El punto de acceso persistente para reabrir el checklist completado es un elemento de navegación siempre visible (por ejemplo, en el menú lateral), consistente con otros accesos condicionales ya existentes en el producto.
- "Configurar el agente de IA" se considera completo cuando el agente está habilitado y tiene tono e instrucciones definidos (no vacíos) — no requiere que el dueño haya usado ningún mecanismo específico (manual o asistido) para llegar a ese estado.
- El checklist es una capa de guía visual sobre configuración que ya existe hoy en Settings; no introduce nuevas pantallas de configuración, solo referencia y enlaza a las existentes (WhatsApp, Agente, Marca).
- No se requiere sincronización en tiempo real entre usuarios simultáneos de la misma organización viendo el checklist; alcanza con que cada consulta refleje el estado más reciente al momento de cargarse.
