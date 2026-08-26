# Guion E2E — 005: Asistente conversacional de configuración del agente

> Conducido con Playwright (MCP) contra `pnpm dev` con el entorno de pruebas
> interno (`OPENROUTER_BASE_URL` → `ai-mock`, `WA_MOCK_ENABLED=true`).
> Requiere una organización con proveedor de IA configurado salvo donde se
> indique lo contrario.

## Camino feliz (US1 — FR-001 a FR-005, FR-012)

1. Abrir `/agent` con un perfil de agente sin tono/instrucciones definidos.
   ✅ El botón "Configurar con el asistente" está habilitado.
2. Hacer clic en el botón.
   ✅ Se abre el diálogo con la primera pregunta ("¿Cuál es el canal
   principal...?").
3. Responder las 4 preguntas guiadas y avanzar con "Siguiente"/"Generar
   propuesta".
   ✅ El botón final muestra "Generando…" mientras espera la respuesta del
   `ai-mock`.
4. Al recibir la propuesta.
   ✅ Se muestra la pantalla de revisión con tono, instrucciones y reglas de
   escalado en texto de solo lectura, y los botones "Descartar"/"Aplicar".
5. Hacer clic en "Aplicar".
   ✅ El diálogo se cierra y los campos de tono/instrucciones/reglas de
   escalado en `ProfileSection` quedan poblados con el contenido generado.
6. Recargar la página `/agent`.
   ✅ Los campos siguen mostrando el contenido generado (persistido vía
   `PUT /api/agent/profile`).

## Edición manual posterior (US2 — FR-005, FR-006)

7. Con los campos ya poblados por el asistente, editar manualmente el campo
   de tono en `ProfileSection` (sin abrir el asistente) y hacer clic en
   "Guardar comportamiento".
   ✅ El cambio se guarda sin ninguna restricción impuesta por el asistente
   (mismo comportamiento que antes de esta feature).
8. Abrir el asistente de nuevo sobre este mismo perfil (que ya tiene
   contenido).
   ✅ Aparece la pantalla de advertencia "Esto reemplazará tu configuración
   actual" antes de cualquier pregunta.
9. Hacer clic en "Cancelar" en esa advertencia.
   ✅ El diálogo se cierra sin generar ni modificar nada.
10. Repetir el paso 8 y hacer clic en "Continuar".
    ✅ Avanza a la primera pregunta del wizard con normalidad.

## Sin proveedor de IA configurado (US3 — FR-008)

11. Con una organización SIN proveedor de IA configurado (sin fila en
    `aiProviderCredentials` y sin variables de entorno de proceso), abrir
    `/agent`.
    ✅ El botón "Configurar con el asistente" está deshabilitado.
    ✅ Se muestra el texto "Configura tu proveedor de IA para activar el
    asistente de configuración."
12. Configurar el proveedor de IA de la organización (Settings → Proveedor
    de IA) y volver a `/agent`.
    ✅ El botón pasa a estar habilitado sin ningún paso adicional.

## Camino infeliz — el proveedor falla (FR-009)

13. Con `ai-mock` configurado para devolver una respuesta inválida o un
    error, completar el wizard hasta "Generar propuesta".
    ✅ Se muestra un mensaje de error claro ("El proveedor de IA no
    respondió correctamente. Intenta de nuevo.") en vez de quedarse cargando
    indefinidamente o lanzar una excepción visible al usuario.
14. Verificar en `/agent` (recargando) que `agentProfile` no quedó
    modificado por el intento fallido.
    ✅ Los campos de tono/instrucciones/reglas de escalado siguen con su
    valor anterior al intento.
15. Reintentar con `ai-mock` respondiendo correctamente.
    ✅ El flujo se completa con normalidad desde el mismo diálogo, sin
    necesitar recargar la página.
