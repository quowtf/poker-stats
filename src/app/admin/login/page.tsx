"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/admin/sessions";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Email o password incorrectos");
      setLoading(false);
    } else {
      // Full page navigation so the freshly-set session cookie is sent
      // with the request (router.push uses client-side nav and can race
      // the cookie write, causing the "login twice" bug).
      window.location.href = callbackUrl;
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm space-y-4 rounded-xl bg-gray-900 p-6"
    >
      <h1 className="text-center text-2xl font-bold">Poker Admin</h1>

      {error && (
        <p className="rounded bg-red-900/50 p-2 text-center text-sm text-red-300">
          {error}
        </p>
      )}

      <input
        name="email"
        type="email"
        placeholder="Email"
        required
        className="w-full rounded-lg bg-gray-800 px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />

      <input
        name="password"
        type="password"
        placeholder="Password"
        required
        className="w-full rounded-lg bg-gray-800 px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
      >
        {loading ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={<div className="text-gray-500">Cargando...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
