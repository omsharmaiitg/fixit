export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium tracking-wide text-blue-700">
        Vibe2Ship 2026 · Hyperlocal Problem Solver
      </span>
      <h1 className="text-4xl font-bold tracking-tight text-blue-700 sm:text-5xl">
        FixIt
      </h1>
      <p className="max-w-md text-balance text-base leading-7 text-gray-600">
        Report, verify, and track local civic issues — and watch the system that
        is supposed to fix them. Two AI agents close the loop.
      </p>
      <p className="text-xs font-medium uppercase tracking-widest text-gray-400">
        Phase 0 · deploy pipe live
      </p>
    </main>
  );
}
