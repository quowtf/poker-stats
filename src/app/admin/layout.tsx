import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/95 backdrop-blur">
        <nav className="flex items-center justify-between px-4 py-3">
          <Link href="/admin/sessions" className="text-lg font-bold">
            🃏 Poker
          </Link>
          <div className="flex gap-4 text-sm">
            <Link
              href="/admin/sessions"
              className="text-gray-400 transition hover:text-white"
            >
              Sesiones
            </Link>
            <Link
              href="/admin/players"
              className="text-gray-400 transition hover:text-white"
            >
              Jugadores
            </Link>
          </div>
        </nav>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-lg px-4 py-6">{children}</main>

      {/* FAB - New Session */}
      <Link
        href="/admin/sessions/new"
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-2xl shadow-lg transition hover:bg-emerald-500 active:scale-95"
        aria-label="Nueva sesión"
      >
        +
      </Link>
    </div>
  );
}
