import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="page empty-state">
      <h1>Page not found</h1>
      <p>This page may have moved or is no longer available.</p>
      <Link className="button primary" href="/">
        Explore benches
      </Link>
    </main>
  );
}
