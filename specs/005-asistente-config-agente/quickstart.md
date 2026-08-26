# Quickstart: Asistente conversacional de configuración del agente

## Requisito previo

La organización debe tener un proveedor de IA configurado (Settings →
Proveedor de IA, o `OPENROUTER_API_TOKEN`/`OPENROUTER_MODEL` en variables de
entorno). Sin esto, el asistente aparece deshabilitado — es el comportamiento
esperado (FR-008), no un error.

## Flujo manual (verificación humana rápida)

1. Entra a **Settings → Agente**.
2. Si hay proveedor de IA configurado, verás un botón/entrada nueva junto a
   los campos de tono/instrucciones/reglas de escalado invitando a usar el
   asistente conversacional.
3. Al abrirlo, responde las preguntas guiadas:
   - Canal principal de atención del negocio.
   - A qué se dedica el negocio.
   - Cómo quieres que suene el agente (tono).
   - Cuándo debe escalar la conversación a un humano.
4. Al confirmar, el sistema muestra una **propuesta** de tono, instrucciones
   y reglas de escalado — todavía no guardada.
5. Revisa el contenido propuesto. Puedes aplicarlo (se guarda en los mismos
   campos de Settings → Agente) o descartarlo sin ningún cambio.
6. Tras aplicar, edita manualmente cualquier campo si quieres ajustar algo —
   funciona exactamente igual que si lo hubieras escrito tú mismo.

## Self-test E2E (automatizado, `pnpm test:e2e`)

Guion completo en `tests/e2e/005-asistente-config-agente.md`. Cubre, contra
`ai-mock`:

1. **Camino feliz**: completar el wizard con respuestas válidas → ver la
   propuesta → confirmar → los campos de Settings → Agente quedan poblados.
2. **Edición manual posterior**: tras aplicar la propuesta, editar
   directamente el campo de tono desde la UI existente y verificar que se
   guarda sin restricción del asistente.
3. **Sin proveedor de IA**: con una organización sin credenciales de IA
   configuradas, verificar que el asistente aparece deshabilitado con el
   mensaje esperado.
4. **Camino infeliz — proveedor falla**: con `ai-mock` configurado para
   devolver un error o una respuesta inválida, verificar que el asistente
   muestra un mensaje de error claro, permite reintentar, y que
   `agentProfile` no queda modificado.
5. **Reconfiguración con advertencia**: sobre un perfil que ya tiene tono e
   instrucciones (generados o manuales), abrir el asistente de nuevo y
   verificar que se muestra la advertencia de sobrescritura (FR-006) antes de
   aplicar cualquier cambio nuevo.

## Verificación de tipos/lint/build/test (gate técnico)

```bash
pnpm typecheck && pnpm lint && pnpm build && pnpm test
```
