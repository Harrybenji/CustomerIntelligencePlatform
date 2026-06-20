import { Utensils } from "lucide-react";
import { CustomerIntelligencePlatform } from "./components/CustomerIntelligencePlatformV10";
import { AuthGate } from "./components/AuthGate";

function TopNavigation() {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-yellow-300 text-zinc-950 shadow-lg shadow-yellow-300/20">
            <Utensils className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-yellow-200">Night Market</p>
            <h1 className="truncate text-xl font-semibold text-zinc-50 sm:text-2xl">Customer Intelligence Platform</h1>
          </div>
        </div>
        <div className="rounded-xl border border-yellow-300/30 bg-yellow-300/10 px-4 py-2 text-sm font-semibold text-yellow-100">
          Month-to-date frequency growth
        </div>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <AuthGate>
      <div className="min-h-screen">
        <TopNavigation />
        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
          <CustomerIntelligencePlatform />
        </main>
      </div>
    </AuthGate>
  );
}
