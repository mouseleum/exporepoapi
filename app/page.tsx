export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8 font-sans">
      <div className="max-w-xl text-center">
        <h1 className="text-3xl font-bold mb-4">Phase 0 scaffold</h1>
        <p className="text-gray-600">
          Next.js 15 + TypeScript strict + Tailwind v4 + Vitest + Zod is wired
          up. The legacy <code>index.html</code> and <code>api/*.js</code> are
          untouched and will be ported per <code>docs/migration-audit.md</code>.
        </p>
      </div>
    </main>
  );
}
