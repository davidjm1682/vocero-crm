# Data Model: Checklist de onboarding guiado

Esta feature **no agrega columnas ni tablas nuevas**. Lee en vivo de tres
tablas ya existentes.

## Fuentes de lectura (existentes, sin cambio)

| Tabla | Campo(s) usados | Paso que informa |
|---|---|---|
| `metaCredentials` | `status` (existe fila con `status = "connected"`) | Conectar WhatsApp |
| `agentProfile` | `enabled`, `tone`, `instructions` | Configurar agente de IA |
| `organization` | `name`, `logo` | Personalizar marca |

## Entidades transitorias (no persistidas)

### `OnboardingStep`

```ts
type OnboardingStepKey = "whatsapp" | "agent" | "branding";

type OnboardingStep = {
  key: OnboardingStepKey;
  label: string;
  completed: boolean;
  href: string; // pantalla de Settings correspondiente
};
```

### `OnboardingStatus` (respuesta del endpoint, no persistida)

```ts
type OnboardingStatus = {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  percent: number; // 0-100, redondeado
};
```

No hay tabla ni fila detrás de estos tipos — se calculan en cada llamada a
`getOnboardingStatus(organizationId)` (ver `research.md`, Decisión 1).

## Relación con el aislamiento multi-tenant

Sin cambios: todas las lecturas usan `organizationId` de la sesión activa,
igual que el resto de endpoints de Settings. No se introduce ningún nuevo
vector de acceso cross-tenant.
