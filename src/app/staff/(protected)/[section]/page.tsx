import { notFound } from "next/navigation";
import { StaffWorkspace } from "@/features/management/workspace";
import { ImportWorkspace } from "@/features/imports/workspace";
export default async function StaffSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section === "imports") return <ImportWorkspace />;
  if (section !== "benches" && section !== "adoptions" && section !== "donors")
    notFound();
  return <StaffWorkspace section={section} />;
}
