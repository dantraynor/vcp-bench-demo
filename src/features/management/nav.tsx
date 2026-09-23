"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Armchair,
  HeartHandshake,
  Users,
  Upload,
} from "lucide-react";
export function StaffNav({ name }: { name: string }) {
  const path = usePathname();
  const links = [
    ["/staff", "Overview", LayoutDashboard],
    ["/staff/benches", "Benches", Armchair],
    ["/staff/adoptions", "Adoptions", HeartHandshake],
    ["/staff/donors", "Donors", Users],
    ["/staff/imports", "Import records", Upload],
  ] as const;
  return (
    <aside className="staff-sidebar">
      <p className="eyebrow">STAFF WORKSPACE</p>
      <nav aria-label="Staff navigation">
        {links.map(([href, title, Icon]) => (
          <Link
            href={href}
            key={href}
            aria-current={path === href ? "page" : undefined}
            className={path === href ? "active" : ""}
          >
            <Icon size={18} />
            {title}
          </Link>
        ))}
      </nav>
      <div className="staff-identity">
        <span className="avatar">{name.charAt(0).toUpperCase()}</span>
        <span>
          <strong>{name}</strong>
          <small>Open demo workspace</small>
        </span>
      </div>
    </aside>
  );
}
