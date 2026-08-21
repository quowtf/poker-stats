"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewPlayerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const nickname = (formData.get("nickname") as string) || null;

    const res = await fetch("/api/poker/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, nickname }),
    });

    if (res.ok) {
      router.push("/admin/players");
    } else {
      const data = await res.json();
      setError(data.error || "Error al crear jugador");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Nuevo Jugador</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-gray-400">Nombre</label>
          <input
            name="name"
            type="text"
            required
            maxLength={50}
            placeholder="Nombre completo"
            className="w-full rounded-lg bg-gray-800 px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-400">
            Apodo (opcional)
          </label>
          <input
            name="nickname"
            type="text"
            maxLength={30}
            placeholder="Apodo en la mesa"
            className="w-full rounded-lg bg-gray-800 px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {error && (
          <p className="rounded bg-red-900/50 p-2 text-center text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "Creando..." : "Crear Jugador"}
        </button>
      </form>
    </div>
  );
}
