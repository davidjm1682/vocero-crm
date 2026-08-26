# Research: Checklist de onboarding guiado

## Decisión 1: Estado calculado en cada consulta, sin persistir "completado"

**Decision**: `getOnboardingStatus(organizationId)` lee en vivo
`metaCredentials`, `agentProfile` y `organization` cada vez que se llama —
no hay columna ni tabla que registre "onboarding completado".

**Rationale**: El spec exige (FR-006, edge case de deshacer un paso) que si
el dueño desconecta WhatsApp después de haberlo conectado, el checklist debe
volver a mostrar ese paso como pendiente. Persistir un flag de "completado"
crearía una fuente de verdad paralela que se desincroniza exactamente en ese
caso. Derivar en cada lectura también resuelve gratis el edge case de
organizaciones preexistentes (FR-009): no hace falta backfill ni migración
de datos, el primer cálculo ya refleja la realidad.

**Alternatives considered**: Columna `organization.onboarding_completed_at`
actualizada por trigger o job (descartada — requiere sincronizar 3 fuentes
de verdad distintas y reintroduce el riesgo de desincronización que el spec
pide evitar explícitamente).

## Decisión 2: Criterio de "completo" por paso

**Decision**:
- **WhatsApp conectado**: existe una fila en `metaCredentials` para la
  organización con `status = "connected"`.
- **Agente de IA configurado**: `agentProfile.enabled === true` Y
  (`tone` no vacío O `instructions` no vacío).
- **Marca personalizada**: vía `getBranding(organizationId)`
  (`src/server/branding.ts`) — `branding.name !== "Vocero"` (el default) O
  `branding.favicon !== null`.

**Rationale**: Son señales ya usadas o expuestas en otras partes del código
(`GET /api/agent/profile` ya calcula algo análogo con `aiConfigured`).
**Corrección tras verificación en vivo**: la primera versión de este
criterio de marca leía `organization.name`/`organization.logo` directamente
— resultó ser la fuente EQUIVOCADA. Lo que edita "Settings → Marca" (nombre
visible del CRM, acento, favicon) vive en `organization.metadata` (JSON),
accedido exclusivamente vía `getBranding()`/`saveBranding()`
(`src/server/branding.ts`); `organization.name`/`.logo` son columnas de
Better Auth sin relación con el white-labeling visible. Este error solo se
detectó ejerciendo el flujo real (Principio IX) — cambiar el nombre del
negocio vía la API real no marcaba el paso como completo hasta corregir la
fuente de lectura.

**Alternatives considered**: Exigir que el agente tenga TODOS los campos
(tono Y instrucciones Y reglas de escalado) para contar como "configurado"
(descartado — el spec solo pide que el paso refleje una configuración
real y sustantiva, no exhaustividad; exigir los 3 campos generaría falsos
"pendiente" para negocios que deliberadamente dejan reglas de escalado
vacías porque no las necesitan).

## Decisión 3: Un único endpoint agregado, no 3 llamadas separadas

**Decision**: `GET /api/onboarding` devuelve los 3 pasos y el progreso
calculado en una sola respuesta, en vez de que el cliente combine 3 fetches
existentes (`/api/agent/profile`, `/api/settings/whatsapp`, `/api/settings/branding`).

**Rationale**: Evita acoplar el componente de checklist a la forma interna
de 3 endpoints no diseñados para este propósito (algunos exponen más datos
de los necesarios, como el token de WhatsApp parcialmente enmascarado). Un
endpoint dedicado también deja un solo lugar donde ajustar el criterio de
"completo" de cada paso si cambia en el futuro.

**Alternatives considered**: Componer 3 fetches en el cliente (descartada
por acoplamiento y porque expondría al cliente una superficie de datos más
amplia de la necesaria solo para calcular 3 booleanos).

## Decisión 4: Punto de acceso persistente reutiliza el patrón del link "Agencia"

**Decision**: El nav (`src/components/app-nav.tsx`) hace un fetch condicional
a `/api/onboarding` en `useEffect` (mismo patrón que ya usa para
`/api/agency` → `hasAgency`) y muestra un link "Configuración inicial" (o
similar) mientras el progreso sea menor a 100%; tras completarse, el link se
mantiene pero deja de destacarse — así el checklist siempre es alcanzable
sin necesitar una segunda ubicación en la UI.

**Rationale**: Es exactamente el mecanismo que FR-008 pide (punto de acceso
persistente) y ya existe un precedente idéntico en el mismo archivo (feature
004). Reutilizarlo evita inventar un segundo patrón de "feature condicional
en el nav" para el mismo problema.

**Alternatives considered**: Un banner separado fuera del nav, sin
persistencia tras completarse (descartado — no cumple FR-008, que exige que
el checklist siga siendo consultable después de completarse).
