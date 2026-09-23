import { BenchExplorer } from "@/features/benches/explorer";
import { Suspense } from "react";
import { Loading } from "@/features/shared/ui";
export default function HomePage() {
  return (
    <main id="main" className="page">
      <Suspense fallback={<Loading />}>
        <BenchExplorer />
      </Suspense>
    </main>
  );
}
