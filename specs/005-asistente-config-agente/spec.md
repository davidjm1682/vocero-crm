# Feature Specification: Asistente conversacional de configuración del agente

**Feature Branch**: `005-asistente-config-agente`

**Created**: 2026-08-25

**Status**: Draft

**Input**: User description: "Asistente conversacional de configuración del agente: un chat guiado (similar a un onboarding conversacional) dentro de Settings → Agente donde el dueño del negocio responde preguntas en lenguaje natural (canal principal de atención, qué hace el negocio, cómo debe sonar el agente, cuándo debe escalar a un humano) y al finalizar la conversación, el sistema genera automáticamente el tono, las instrucciones y las reglas de escalado del agente — llenando esos mismos campos que hoy se editan manualmente en texto libre. El dueño puede seguir editando esos campos a mano después si quiere ajustar algo; el asistente no los reemplaza, solo reduce la fricción de la configuración inicial para alguien que no sabe escribir un prompt técnico. El asistente conversacional usa el mismo proveedor de IA ya configurado por la organización — si la organización no tiene proveedor de IA configurado, el asistente tampoco está disponible, igual que hoy pasa con el agente principal."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configurar el agente conversando en vez de escribiendo un prompt (Priority: P1)

Un dueño de negocio sin experiencia técnica entra a Settings → Agente por primera vez y, en lugar de enfrentar campos de texto libre en blanco (tono, instrucciones, reglas de escalado), inicia un chat guiado. El asistente le hace preguntas simples en lenguaje natural sobre su negocio (a qué se dedica, cómo quiere que suene el agente, cuándo debe pasar la conversación a un humano) y, al terminar, genera automáticamente el contenido de esos campos.

**Why this priority**: Es el valor central de la feature — sin esto no hay producto. Reduce la barrera de entrada que hoy exige que el dueño sepa "escribir un prompt", que es la fricción de configuración inicial identificada como el problema a resolver.

**Independent Test**: Puede probarse por completo entrando a Settings → Agente con un perfil de agente recién creado (sin tono/instrucciones previas), completando la conversación guiada, y verificando que los campos de tono, instrucciones y reglas de escalado quedan poblados con contenido coherente con las respuestas dadas.

**Acceptance Scenarios**:

1. **Given** una organización con proveedor de IA configurado y un perfil de agente sin tono/instrucciones definidos, **When** el dueño abre el asistente conversacional y responde todas las preguntas guiadas, **Then** el sistema genera y guarda tono, instrucciones y reglas de escalado en el perfil del agente, y los muestra en los campos editables correspondientes.
2. **Given** una conversación con el asistente en curso, **When** el dueño da una respuesta ambigua o muy breve, **Then** el asistente puede pedir una aclaración adicional antes de continuar, sin bloquear la conversación de forma permanente.
3. **Given** que el asistente terminó de generar los campos, **When** el dueño revisa el resultado, **Then** puede ver claramente qué fue generado y desde dónde continuar editando manualmente.

---

### User Story 2 - Editar manualmente después de usar el asistente (Priority: P1)

Un dueño que ya usó el asistente para generar la configuración inicial de su agente quiere ajustar un detalle puntual (por ejemplo, afinar una frase del tono o agregar una regla de escalado adicional) sin tener que repetir toda la conversación guiada.

**Why this priority**: Es una decisión de diseño explícita y no negociable del feature: el asistente genera, nunca reemplaza la edición manual. Sin esto, el asistente se convertiría en la única vía de configuración, lo cual contradice el requisito confirmado.

**Independent Test**: Puede probarse generando la configuración vía el asistente, luego editando directamente el campo de texto de tono (o instrucciones, o reglas de escalado) sin pasar por el asistente, y verificando que el cambio se guarda igual que hoy funciona la edición manual.

**Acceptance Scenarios**:

1. **Given** campos de tono/instrucciones/reglas de escalado generados por el asistente, **When** el dueño edita manualmente cualquiera de esos campos desde la interfaz existente, **Then** el cambio se guarda sin restricciones adicionales impuestas por el asistente.
2. **Given** un perfil de agente ya configurado (manualmente o vía asistente), **When** el dueño vuelve a abrir el asistente conversacional, **Then** el sistema le advierte que continuar generará contenido nuevo que sobrescribirá los campos actuales, y pide confirmación antes de aplicar los cambios.

---

### User Story 3 - Usar el asistente cuando no hay proveedor de IA configurado (Priority: P2)

Un dueño de negocio cuya organización todavía no configuró ningún proveedor de IA intenta abrir el asistente conversacional de configuración.

**Why this priority**: Es una restricción explícita del alcance (reutilizar el proveedor de IA existente sin nueva infraestructura), pero es un caso secundario respecto al flujo principal — importa que se comunique con claridad, no que tenga una solución alternativa.

**Independent Test**: Puede probarse en una organización sin credenciales de proveedor de IA configuradas, abriendo Settings → Agente y verificando que el asistente se muestra deshabilitado con una indicación de la causa, de forma consistente con el estado actual del agente principal en la misma situación.

**Acceptance Scenarios**:

1. **Given** una organización sin proveedor de IA configurado, **When** el dueño visita Settings → Agente, **Then** el asistente conversacional aparece deshabilitado o no disponible, con un mensaje que indica que se requiere configurar un proveedor de IA primero (consistente con el mensaje ya existente para el agente principal).
2. **Given** una organización que configura su proveedor de IA por primera vez, **When** el dueño vuelve a Settings → Agente, **Then** el asistente conversacional pasa a estar disponible sin pasos adicionales.

### Edge Cases

- ¿Qué pasa si el dueño abandona la conversación a la mitad (cierra la pestaña o navega fuera)? El progreso no confirmado se pierde; al volver a abrir el asistente, empieza una conversación nueva.
- ¿Qué pasa si el proveedor de IA configurado falla o responde de forma inesperada durante la conversación o durante la generación final de campos? El sistema debe degradar con un mensaje de error claro y permitir reintentar, sin dejar el perfil del agente en un estado parcialmente sobrescrito.
- ¿Qué pasa si el dueño da respuestas contradictorias entre sí (por ejemplo, pide un tono formal y luego pide "sé bien relajado y usa emojis")? El asistente prioriza la respuesta más reciente y puede reflejar la contradicción pidiendo que el dueño aclare antes de generar el resultado final.
- ¿Qué pasa si el negocio no tiene reglas de escalado claras (el dueño no sabe cuándo debe intervenir un humano)? El asistente debe poder ofrecer una regla de escalado por defecto razonable (por ejemplo, escalar ante quejas o solicitudes fuera del alcance del negocio) en vez de bloquear la conversación por falta de respuesta.
- ¿Qué pasa si dos personas de la misma organización usan el asistente al mismo tiempo en pestañas distintas? Debe prevalecer un resultado consistente (el último guardado gana), igual que ocurre hoy con la edición manual concurrente de los mismos campos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE ofrecer, dentro de Settings → Agente, un asistente conversacional que guía al dueño del negocio mediante preguntas en lenguaje natural para configurar el agente.
- **FR-002**: El asistente DEBE recopilar, como mínimo, la siguiente información antes de generar el resultado: el canal principal de atención del negocio, una descripción de a qué se dedica el negocio, cómo debe sonar/comportarse el agente (tono), y bajo qué condiciones debe escalar la conversación a un humano.
- **FR-003**: Al finalizar la conversación, el sistema DEBE generar automáticamente contenido para los campos de tono, instrucciones y reglas de escalado del perfil del agente, a partir de las respuestas dadas por el dueño.
- **FR-004**: Los campos generados por el asistente DEBEN quedar en los mismos campos de texto editables que existen hoy en Settings → Agente (tono, instrucciones, reglas de escalado) — el asistente no introduce una representación paralela o separada de esta configuración.
- **FR-005**: El dueño DEBE poder editar manualmente, en cualquier momento después de usar el asistente, los campos generados, exactamente igual que si los hubiera escrito él mismo.
- **FR-006**: Si el dueño vuelve a abrir el asistente sobre un perfil de agente que ya tiene tono/instrucciones/reglas de escalado (generados o escritos a mano), el sistema DEBE advertir que continuar sobrescribirá el contenido existente y pedir confirmación antes de aplicar los cambios generados.
- **FR-007**: El sistema DEBE usar, para las respuestas del asistente conversacional, el mismo proveedor de IA (credenciales y adaptador) ya configurado por la organización para el agente principal — no debe introducirse un proveedor, credencial o infraestructura de IA adicional.
- **FR-008**: Si la organización no tiene un proveedor de IA configurado, el sistema DEBE mostrar el asistente conversacional como no disponible, con un mensaje que indique la causa, de forma consistente con el tratamiento actual del agente principal en esa misma condición.
- **FR-009**: El sistema DEBE manejar de forma resiliente una respuesta inesperada, vacía o fallida del proveedor de IA en cualquier punto de la conversación o de la generación final, mostrando un mensaje de error claro y permitiendo reintentar sin corromper ni sobrescribir parcialmente los campos existentes del perfil del agente.
- **FR-010**: El historial de una conversación con el asistente que no fue confirmada/finalizada NO DEBE persistir entre sesiones — al volver a abrir el asistente tras abandonar una conversación a medias, el dueño empieza desde cero.
- **FR-011**: El acceso al asistente conversacional DEBE respetar el mismo aislamiento por organización que el resto de la configuración del agente — un dueño solo puede usar el asistente sobre el perfil de agente de su propia organización.
- **FR-012**: Antes de aplicar los cambios generados por el asistente al perfil del agente, el sistema DEBE mostrarle al dueño el contenido que se va a guardar (tono, instrucciones, reglas de escalado) para que pueda revisarlo, y solo aplicarlo tras una confirmación explícita.

### Key Entities

- **Sesión de asistente de configuración**: Representa una conversación en curso (o recién finalizada) entre el dueño y el asistente. Contiene el intercambio de preguntas/respuestas necesario para producir el resultado final; no persiste como historial permanente una vez que la conversación se abandona sin confirmar.
- **Perfil del agente (existente)**: Entidad ya existente en el sistema que contiene tono, instrucciones y reglas de escalado en texto libre. Esta feature no cambia su forma — solo agrega una vía adicional (conversacional) para poblarla, junto a la edición manual ya existente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un dueño de negocio sin experiencia técnica puede completar la configuración inicial del tono, instrucciones y reglas de escalado de su agente en menos de 5 minutos usando únicamente el asistente conversacional, sin necesitar ayuda externa para redactar texto.
- **SC-002**: Al menos el 90% de las conversaciones completadas con el asistente producen contenido en los tres campos (tono, instrucciones, reglas de escalado) sin dejar ninguno vacío.
- **SC-003**: El dueño puede identificar, sin ambigüedad, que un campo fue generado por el asistente y sigue siendo editable manualmente, sin necesitar explicación adicional fuera de la propia interfaz.
- **SC-004**: El 100% de los intentos de uso del asistente en una organización sin proveedor de IA configurado resultan en un mensaje explicativo claro, nunca en un error genérico o una conversación que se cuelga sin respuesta.
- **SC-005**: Ningún uso del asistente sobrescribe los campos existentes del perfil del agente sin que el dueño haya visto y confirmado explícitamente el contenido a guardar.

## Assumptions

- El asistente conversacional es una capacidad adicional dentro de Settings → Agente, no una pantalla ni un flujo de onboarding separado del producto.
- El idioma de la conversación del asistente es el mismo que el resto de la interfaz de Vocero (español), consistente con el resto del producto.
- La conversación con el asistente ocurre en un intercambio acotado (unas pocas preguntas guiadas), no como un chat abierto de duración indefinida — esto mantiene el alcance comparable a un asistente de configuración, no a un chatbot general.
- No se requiere guardar el historial completo de la conversación con el asistente como dato permanente del negocio; solo importa el resultado final aplicado al perfil del agente.
- El asistente reutiliza el mismo mecanismo de resolución de proveedor de IA por organización que ya usa el agente principal (incluyendo su comportamiento de "no disponible" cuando no hay proveedor configurado), sin agregar un nuevo tipo de credencial.
- Un único dueño/usuario administrador es quien normalmente usaría el asistente; el caso de dos personas usándolo simultáneamente es un edge case tratado con la misma política de "último guardado gana" que ya aplica a la edición manual concurrente, sin requerir bloqueo o mecanismo de colaboración en tiempo real.
