import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b px-4 py-3 sm:px-6 sm:py-4">
        <h2 className="font-semibold">Configuración inicial</h2>
      </header>
      <div className="max-w-lg p-4 sm:p-6">
        <OnboardingChecklist alwaysShow />
      </div>
    </div>
  );
}
