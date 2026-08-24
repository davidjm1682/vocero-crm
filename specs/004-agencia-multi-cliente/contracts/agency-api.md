# Contrato: API de agencia

Convención del proyecto: rutas `withAuth` (requiere sesión), body validado
con Zod (`parseBody`), errores vía `apiError(status, code, message)`.

## `GET /api/agency`

Datos de la agencia del usuario en sesión (resuelta por la organización
activa → `organization.agencyId`).

**200**
```json
{
  "agency": {
    "id": "agency_...",
    "name": "Agencia Ejemplo",
    "plan": "starter",
    "planLimit": 10,
    "activeWorkspaces": 4
  }
}
```

**200 (usuario no pertenece a ninguna agencia)**
```json
{ "agency": null }
```

## `GET /api/agency/workspaces`

Lista los workspaces (organizaciones) activos de la agencia.

**200**
```json
{
  "workspaces": [
    {
      "id": "org_...",
      "name": "Cliente Uno",
      "whatsappConnected": true,
      "lastMessageAt": "2026-08-20T14:30:00.000Z"
    }
  ]
}
```

## `POST /api/agency/workspaces`

Crea un workspace de cliente nuevo dentro del límite del plan.

**Body**
```json
{ "name": "Nombre del cliente" }
```

**201**
```json
{ "workspace": { "id": "org_...", "name": "Nombre del cliente" } }
```

**409** — límite del plan alcanzado
```json
{ "error": { "code": "plan_limit_reached", "message": "Alcanzaste el límite de 10 clientes de tu plan Starter. Sube de plan para agregar más." } }
```

## `POST /api/agency/workspaces/:id/archive`

Archiva un workspace (soft-delete) — deja de contar contra el límite del
plan, conserva todos sus datos.

**200**
```json
{ "ok": true }
```

**404** — el workspace no existe o no pertenece a la agencia del usuario en sesión

## `POST /api/agency/workspaces/:id/enter`

Cambia la organización activa de la sesión al workspace indicado (equivalente
a "entrar a gestionar este cliente"), sujeto a que el usuario tenga membresía
en ese workspace.

**200**
```json
{ "ok": true }
```

**403** — el usuario no tiene membresía en ese workspace
