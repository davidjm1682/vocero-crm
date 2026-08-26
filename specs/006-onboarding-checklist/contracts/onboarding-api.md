# Contract: `GET /api/onboarding`

Endpoint interno (mismo origen, autenticado por sesión) — no es un contrato
publicado externo.

## Autenticación y alcance

- Requiere sesión activa (`withAuth`).
- Opera exclusivamente sobre la organización activa de la sesión.

## Response — éxito (200)

```json
{
  "steps": [
    { "key": "whatsapp", "label": "Conectar WhatsApp", "completed": false, "href": "/settings/whatsapp" },
    { "key": "agent", "label": "Configurar el agente de IA", "completed": false, "href": "/agent" },
    { "key": "branding", "label": "Personalizar tu marca", "completed": false, "href": "/settings/branding" }
  ],
  "completedCount": 0,
  "totalCount": 3,
  "percent": 0
}
```

Con todos los pasos completos:

```json
{
  "steps": [
    { "key": "whatsapp", "label": "Conectar WhatsApp", "completed": true, "href": "/settings/whatsapp" },
    { "key": "agent", "label": "Configurar el agente de IA", "completed": true, "href": "/agent" },
    { "key": "branding", "label": "Personalizar tu marca", "completed": true, "href": "/settings/branding" }
  ],
  "completedCount": 3,
  "totalCount": 3,
  "percent": 100
}
```

## Garantías del contrato

- Es de solo lectura: nunca modifica ninguna tabla.
- El resultado se deriva en el momento de la llamada a partir de la
  configuración vigente — dos llamadas consecutivas después de que el dueño
  cambie algo (p. ej. desconecta WhatsApp) reflejan el nuevo estado sin
  necesitar invalidar ningún caché ni endpoint adicional.
- No expone ningún dato sensible de las tablas que consulta (tokens,
  credenciales cifradas) — solo los booleanos derivados y las etiquetas de
  cada paso.
