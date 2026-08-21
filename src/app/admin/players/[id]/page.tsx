"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function EditPlayerPage() {
  const params = useParams();
  const router = useRouter();
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/poker/players`)
      .then((r) => r.json())
      .then((players) => {
        const player = players.find((p: { id: string }) => p.id === params.id);
        if (player) {
          setName(player.name);
          setNickname(player.nickname || "");
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const res = await fetch(`/api/poker/players/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, nickname: nickname || null }),
    });

    if (res.ok) {
      router.push("/admin/players");
    } else {
      const data = await res.json();
      setError(data.error || "Error al guardar");
      setSaving(false);
    }
  }

  if (loading) return <p className="text-center text-gray-500">Cargando...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Editar Jugador</h1>
        <Link href="/admin/players" className="text-sm text-gray-400 hover:text-white">← Volver</Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-gray-400">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={50}
            className="w-full rounded-lg bg-gray-800 px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-400">Apodo</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={30}
            className="w-full rounded-lg bg-gray-800 px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {error && <p className="rounded bg-red-900/50 p-2 text-center text-sm text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </form>
    </div>
  );
}
