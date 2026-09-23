import { BenchDetail } from "@/features/benches/detail";
export default async function BenchPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return (
    <main id="main" className="page">
      <BenchDetail code={code} />
    </main>
  );
}
