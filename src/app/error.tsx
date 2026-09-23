"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="page empty-state">
      <h1>We couldn’t load this page.</h1>
      <p>Please try again. Your saved records are still in the database.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
