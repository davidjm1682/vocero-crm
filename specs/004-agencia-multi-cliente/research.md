# Research: Panel de agencia multi-cliente

## Decisión 1 — Cómo modelar la relación agencia↔workspaces

**Decisión**: Nueva tabla `agency` (id, name, plan, planLimit, createdAt) +
columna nullable `organizationId` FK en... no — al revés: nueva columna
`agencyId` nullable en `organization`, con FK a `agency.id`
(`onDelete: "restrict"` para no borrar workspaces por accidente al borrar una
agencia).

**Rationale**: El spec exige explícitamente "reutilizar al máximo el modelo
actual de organization... la agencia es una capa nueva por ENCIMA, no un
reemplazo" (FR-004). Una columna nullable en `organization` es la forma más
directa de expresar "esta organización pertenece opcionalmente a una
agencia" sin tocar ninguna query, índice o política de aislamiento existente
sobre `organization` — el 100% del código que ya usa `organizationId` sigue
funcionando idéntico. Una organización sin agencia (`agencyId = null`) es
exactamente el caso de uso actual del producto (negocio directo), sin ningún
cambio de comportamiento (SC-005 del spec).

**Alternativas consideradas**:
- *Tabla puente `agency_organization` (N:N)*: rechazada — el spec (FR-004,
  Key Entities) describe una relación 1:N (una organización pertenece a lo
  sumo a una agencia), no N:N. Una tabla puente añadiría complejidad sin
  beneficio; se puede migrar a N:N después si algún día un workspace necesita
  pertenecer a más de una agencia, pero eso no está en alcance.
- *Reemplazar `organization` por `agency` como tenant raíz*: rechazado —
  violaría directamente FR-004 y rompería el aislamiento existente descrito
  en `tenant.ts`/`scoped()`, que asume `organization` como la unidad atómica
  en cada tabla de dominio.

## Decisión 2 — Membresía multi-organización de un miembro de agencia

**Decisión**: Reutilizar el modelo `member` de Better Auth tal cual (ya es
N:N entre `user` y `organization` — confirmado en `src/lib/auth/index.ts` y
en el schema de `member`). Al crear un workspace de cliente nuevo dentro de
una agencia, insertar una fila `member` por cada usuario que ya sea miembro
de la agencia (mismo patrón que `onUserCreated` ya usa para crear la primera
membresía de un usuario). `resolveMembership()` en
`src/server/auth/on-signup.ts` deja de usar `.limit(1)` a ciegas: para un
usuario con múltiples membresías, resuelve por `session.activeOrganizationId`
si está seteado (columna que Better Auth ya persiste en la sesión —
confirmado en `databaseHooks.session.create.before`), y cae a la primera
membresía solo si no hay organización activa explícita (caso de negocio
directo sin agencia, comportamiento actual sin cambios).

**Rationale**: Better Auth ya modela correctamente "un usuario en múltiples
organizaciones" — el límite de hoy es artificial, vive únicamente en cómo
`resolveMembership` consulta (`.limit(1)`, sin ORDER BY, tomando
esencialmente cualquiera). No hace falta un sistema de permisos nuevo ni una
tabla de membresía paralela: extender la función de resolución existente
para que respete la organización activa de la sesión es el cambio mínimo que
soporta "cambiar de workspace de cliente" (equivalente conceptual a lo que
Better Auth llama "switch active organization", que su plugin ya expone
nativamente vía `setActive`).

**Alternativas consideradas**:
- *Tabla `agency_member` separada de `member`*: rechazada — duplicaría el
  concepto de membresía que Better Auth ya resuelve, y complicaría cualquier
  código existente que ya consulta `member` para saber quién tiene acceso a
  una organización (haría falta un JOIN adicional en todas partes).
- *Un solo `member` "agencia" con acceso implícito a todos sus workspaces
  (sin filas `member` individuales por workspace)*: rechazado — rompería la
  invariante actual de que `scoped()`/consultas de acceso a una organización
  verifican `member` directamente; mantener una fila real por workspace es
  más simple de razonar y auditar (queda explícito en BD quién tiene acceso a
  qué, sin lógica implícita "es de mi agencia entonces puedo").

## Decisión 3 — Enforcement del límite de plan

**Decisión**: Antes de insertar la fila `organization` nueva dentro de un
flujo de creación de workspace, contar `organization` activas
(`archivedAt IS NULL` o equivalente) con `agencyId = <la agencia>` y
comparar contra `agency.planLimit`. Si el conteo ya alcanzó el límite,
rechazar la creación (409) antes de tocar la base de datos — sin condición de
carrera relevante dado el volumen esperado (agencias creando workspaces una
a la vez desde su panel, no en ráfaga concurrente).

**Rationale**: Simple, verificable, sin necesidad de un job en segundo plano
ni de un contador desnormalizado que pueda desincronizarse. Consistente con
FR-009 (solo cuentan los activos) y FR-010 (bloqueo con mensaje claro).

**Alternativas consideradas**:
- *Índice parcial UNIQUE en Postgres tipo "máx N filas por agencyId"*: no
  existe un mecanismo nativo de Postgres para expresar "máximo N filas que
  cumplen una condición" a nivel de constraint — se simuló ya en el proyecto
  para "máx 1 corrida `running` por organización" (`agentTestRun`) porque ahí
  el límite es 1 (expresable con UNIQUE parcial); para un límite arbitrario
  (10/15/30) no hay equivalente declarativo simple, así que el conteo
  aplicativo antes del insert es la opción correcta.

## Decisión 4 — Requiere `organization` archivable (soft-delete)

**Decisión**: Agregar `archivedAt` (timestamp nullable) a `organization` si
no existe ya [verificar en Fase 1 contra el schema real]. Un workspace
archivado deja de contar contra el límite de plan (Decisión 3) pero conserva
todos sus datos.

**Rationale**: Exigido directamente por el edge case del spec ("¿Qué pasa si
la agencia quiere archivar/dar de baja a un cliente... sin borrar sus
datos?") y por FR-014.

**Alternativas consideradas**: Ninguna real — es el patrón estándar de
soft-delete y ya existe precedente en el proyecto (`contact.archivedAt`
usado para contactos sintéticos del Laboratorio, según `runner.ts`).
