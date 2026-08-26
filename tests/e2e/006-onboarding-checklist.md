# Guion E2E — 006: Checklist de onboarding guiado

> Conducido con Playwright (MCP) o navegador real contra `pnpm dev`.

## Organización nueva (US1 — FR-001 a FR-004)

1. Registra una organización nueva y abre `/inbox`.
   ✅ Antes de cualquier conversación, se ve la tarjeta "Construyamos tu
   negocio en Vocero" con los 3 pasos pendientes y "0 de 3 completados · 0%".
   ✅ El link "Configuración inicial" aparece en el nav con "0%".
2. Hacer clic en "Conectar WhatsApp".
   ✅ Navega a `/settings/whatsapp`.

## Actualización automática (US2 — FR-005, FR-006)

3. Cambiar el nombre del negocio en Settings → Marca y volver a `/inbox`.
   ✅ El paso "Personalizar tu marca" aparece completo sin edición manual
   del checklist; el progreso sube a 33%; el nav refleja el nuevo
   porcentaje.
4. Activar el agente con un tono definido en `/agent` y volver a `/inbox`.
   ✅ El paso "Configurar el agente de IA" aparece completo; progreso 67%.
5. Conectar WhatsApp (o, en el entorno de prueba, simular la conexión) y
   volver a `/inbox`.
   ✅ El paso "Conectar WhatsApp" aparece completo; progreso 100%.
6. Desconectar WhatsApp desde Settings → WhatsApp y volver a `/inbox`.
   ✅ El paso vuelve a pendiente y el progreso baja de 100% — el checklist
   embebido reaparece en la bandeja (ya no está en 100%).

## Colapsar y reabrir (US3 — FR-007, FR-008)

7. Con los 3 pasos completos, abrir `/inbox`.
   ✅ El checklist embebido ya NO se muestra de forma prominente.
   ✅ El link "Configuración inicial" sigue visible en el nav, sin
   porcentaje.
8. Hacer clic en "Configuración inicial".
   ✅ Navega a `/onboarding` y muestra los 3 pasos, todos marcados como
   completos, con "3 de 3 completados · 100%".

## Organización preexistente (FR-009)

9. Con una organización que ya tenía WhatsApp/agente/marca configurados
   ANTES de que existiera esta feature, abrir `/inbox` por primera vez tras
   el deploy.
   ✅ El checklist aparece ya completo (o colapsado) desde el principio, sin
   pasar por un estado "todo pendiente" falso.
