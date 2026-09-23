import type { Metadata } from "next";
import Link from "next/link";
import { Armchair, ArrowUpRight } from "lucide-react";
import "./globals.css";
export const metadata: Metadata = {
  title: "Bench registry · Van Cortlandt Park",
  description:
    "Explore Van Cortlandt Park's illustrative bench inventory and adopt a bench. A take-home demonstration.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="app-header">
          <Link className="brand" href="/">
            <span className="brand-icon">
              <Armchair size={22} strokeWidth={1.7} />
            </span>
            <span>
              <strong>Van Cortlandt Park</strong>
              <small>BENCH REGISTRY</small>
            </span>
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/">Explore benches</Link>
            <Link className="staff-link" href="/staff">
              Staff workspace <ArrowUpRight size={15} />
            </Link>
          </nav>
        </header>
        <div className="demo-banner">
          <span className="demo-tag">DEMO</span> Demo inventory: bench locations
          and adoption records are illustrative.{" "}
          <span className="banner-extra">
            Park boundaries use official NYC Parks data.
          </span>
        </div>
        {children}
        <footer className="app-footer">
          <span>Van Cortlandt Park · Bronx, New York</span>
          <span>
            Independent take-home demonstration · No payments collected
          </span>
        </footer>
      </body>
    </html>
  );
}
