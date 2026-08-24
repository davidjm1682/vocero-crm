# Data Model: Panel de agencia multi-cliente

## Entidades

### `agency` (nueva)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | text, PK | prefijo nanoid nuevo, p. ej. `agency_` |
| `name` | text, NOT NULL | nombre comercial de la agencia |
| `plan` | text enum, NOT NULL | `starter` \| `growth` \| `scale` |
| `planLimit` | integer, NOT NULL | 10 / 15 / 30 según plan; se persiste el número, no solo el nombre del plan, para permitir ajustes puntuales sin migrar el enum |
| `createdAt` | timestamp, NOT NULL, default now() | |

Sin `organizationId` propio — `agency` no es en sí misma un tenant de datos
de dominio (no tiene contactos, pipeline, etc.); es una entidad de
agrupación administrativa por encima de `organization`.

### `organization` (existente, extendida)

| Campo nuevo | Tipo | Notas |
|---|---|---|
| `agencyId` | text, FK → `agency.id`, NULLABLE, `onDelete: "restrict"` | `null` = organización independiente (comportamiento actual, sin cambios) |
| `archivedAt` | timestamp, NULLABLE | workspace archivado por la agencia; no cuenta contra el límite del plan; conserva todos sus datos |

Todo lo demás del modelo de `organization` permanece sin cambios: sigue
siendo la unidad aislada de WhatsApp, contactos, pipeline, agente de IA y
conversaciones (Constitución I y III sin excepción).

### `member` (existente, sin cambios de schema)

Sin cambios de columnas. Cambia el **patrón de uso**: hoy el código asume
(vía `resolveMembership` con `.limit(1)`) que un usuario tiene como mucho una
fila relevante en `member`. Con esta feature, un miembro de agencia tiene una
fila `member` por cada workspace de cliente de su agencia (N filas, una por
`organizationId`), reflejando 1:1 el modelo N:N que Better Auth ya soporta
nativamente en esta tabla.

## Relaciones

```text
agency (1) ──── (N) organization      [agencyId, nullable]
user   (N) ──── (N) organization      [vía member, ya existente]
```

Una organización pertenece a lo sumo a una agencia. Un usuario puede tener
membresía en múltiples organizaciones (ya soportado). La pertenencia de un
usuario a "la agencia" es implícita: es miembro de agencia si tiene al menos
una fila `member` en alguna organización con `agencyId` no nulo apuntando a
esa agencia — no existe una tabla `agency_member` separada (ver Decisión 2
en research.md).

## Reglas de validación

- `agency.planLimit` MUST ser > 0.
- Crear una `organization` con `agencyId` no nulo MUST verificar primero que
  `count(organization WHERE agencyId = X AND archivedAt IS NULL) < agency.planLimit`
  para esa agencia; si no, rechazar (FR-010).
- Un número de WhatsApp Business (identificador de conexión, ya modelado en
  las credenciales de WhatsApp existentes) MUST ser único a través de TODAS
  las organizaciones activas del sistema, no solo dentro de una agencia
  (FR-012) — esta validación ya debería existir a nivel de credenciales de
  WhatsApp; confirmar en Fase de tareas si hace falta reforzarla.
- Archivar una organización (`archivedAt = now()`) NUNCA borra sus filas
  relacionadas (contactos, conversaciones, pipeline); solo la excluye del
  conteo contra el límite de plan y, presumiblemente, de la lista activa del
  panel de agencia.

## Estados / transiciones

`organization.archivedAt`:

```text
null (activo) ──[agencia archiva]──> timestamp (archivado)
timestamp (archivado) ──[agencia reactiva, si se decide soportarlo]──> null
```

La reactivación no está explícitamente pedida en el spec (fuera de alcance
de las 3 historias de usuario); se deja como extensión natural del mismo
campo si se necesita después, sin cambio de modelo.
