# Quickstart: Checklist de onboarding guiado

## Flujo manual (verificación humana rápida)

1. Registra una organización nueva (o usa una sin WhatsApp/agente/marca
   configurados).
2. Entra a la bandeja (`/inbox`).
   ✅ Se ve el checklist con 3 pasos, todos pendientes, y la barra de
   progreso en 0%.
3. Haz clic en el paso "Conectar WhatsApp".
   ✅ Navega a `/settings/whatsapp`.
4. Conecta WhatsApp (o, en el entorno de prueba, simula la conexión) y
   vuelve a `/inbox`.
   ✅ El paso "Conectar WhatsApp" aparece como completo y el progreso sube
   a 33%.
5. Repite para "Configurar el agente de IA" (activa el agente con tono o
   instrucciones) y "Personalizar tu marca" (cambia el nombre del negocio).
   ✅ El progreso llega a 100% y el checklist deja de mostrarse de forma
   prominente.
6. Busca el punto de acceso persistente en el menú lateral.
   ✅ Puedes volver a ver el checklist completo con los 3 pasos marcados.

## Self-test E2E (automatizado o guion manual, `tests/e2e/006-onboarding-checklist.md`)

1. **Organización nueva**: todos los pasos pendientes, 0% de progreso.
2. **Actualización automática**: completar un paso desde su pantalla nativa
   y verificar que el checklist lo refleja sin edición manual.
3. **Organización preexistente**: una organización que ya tenía WhatsApp/
   agente/marca configurados desde antes de esta feature ve el checklist
   ya completo (o colapsado) desde la primera vez que se muestra.
4. **Deshacer un paso**: desconectar WhatsApp tras haberlo conectado y
   verificar que el paso vuelve a pendiente.
5. **Acceso persistente**: tras completar todos los pasos, confirmar que el
   checklist sigue siendo accesible desde el nav.

## Verificación de tipos/lint/build/test (gate técnico)

```bash
pnpm typecheck && pnpm lint && pnpm build && pnpm test
```
