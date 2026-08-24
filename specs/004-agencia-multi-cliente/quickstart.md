# Quickstart: Panel de agencia multi-cliente

Verificación de comportamiento en vivo (Principio IX) para las 3 historias
del spec. Requiere la app corriendo local con mocks activos
(`WA_MOCK_ENABLED=true`, `OPENROUTER_BASE_URL` → ai-mock).

## Historia 1 — Crear workspace de cliente dentro del límite

1. Crear una agencia de prueba en plan `starter` (planLimit=10) con un
   usuario dueño.
2. Iniciar sesión como ese usuario, entrar al panel de agencia
   (`/agency`).
3. Click en "Agregar cliente" → completar nombre → confirmar.
4. **Verificar**: el nuevo workspace aparece en la lista, contador pasa a
   1/10.
5. Conectar el WhatsApp de prueba (mock) a ese workspace específico.
6. Enviar un mensaje entrante simulado a ese número (vía wa-mock).
7. **Verificar**: el mensaje aparece en el inbox de ESE workspace, y NO
   aparece si se revisa cualquier otro workspace de la misma agencia (crear
   un segundo workspace vacío y confirmar que su inbox sigue vacío).

## Historia 2 — Navegar entre clientes desde el panel único

1. Con la agencia del paso anterior ya con 2+ workspaces creados, abrir
   `/agency`.
2. **Verificar**: ambos workspaces aparecen listados con nombre y estado de
   conexión de WhatsApp.
3. Click en el primer workspace → **verificar** que entra al inbox/pipeline
   de ESE workspace (no del otro).
4. Volver al panel de agencia, click en el segundo → **verificar** que ahora
   opera el segundo, con sus propios datos.
5. Intentar acceder por URL directa a un workspace de OTRA agencia (creada
   con otro usuario de prueba) → **verificar** que el acceso es denegado
   (403 o redirect, no un 500 ni datos filtrados).

## Historia 3 — Bloqueo al llegar al límite del plan

1. Usando una agencia de prueba, crear workspaces hasta alcanzar exactamente
   el `planLimit` (10 para `starter`).
2. **Verificar**: el botón "Agregar cliente" aparece deshabilitado, con un
   mensaje visible indicando que se alcanzó el límite del plan Starter.
3. Intentar forzar la creación llamando directamente a
   `POST /api/agency/workspaces` (bypaseando la UI) → **verificar** que la
   API responde 409 `plan_limit_reached`, no crea el workspace.
4. Archivar uno de los 10 workspaces existentes.
5. **Verificar**: el contador baja a 9/10, el botón "Agregar cliente" vuelve
   a estar habilitado, y el workspace archivado sigue existiendo con todos
   sus datos intactos (solo no cuenta contra el límite ni aparece en la
   lista activa).

## Camino infeliz — degradación sin colgarse

- Intentar crear un workspace con un nombre vacío → error de validación
  claro, sin 500.
- Intentar conectar un número de WhatsApp que ya está activo en otro
  workspace (misma agencia u otra) → rechazado con mensaje claro (FR-012),
  sin dejar el workspace a medio configurar.
- Remover a un miembro de la agencia → **verificar** que pierde acceso
  inmediato a TODOS los workspaces de esa agencia, no solo al que tenía
  abierto en ese momento.
