import { demoStaffName } from "@/features/management/actor";
import { StaffNav } from "@/features/management/nav";
export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="staff-layout">
      <StaffNav name={demoStaffName} />
      <main id="main" className="staff-main">
        {children}
      </main>
    </div>
  );
}
