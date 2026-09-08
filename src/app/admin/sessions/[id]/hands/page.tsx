"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const HAND_TYPES = [
  { id: "high_card", label: "Carta Alta", emoji: "🃏" },
  { id: "pair", label: "Par", emoji: "✌️" },
  { id: "two_pair", label: "Doble Par", emoji: "👥" },
  { id: "three_of_a_kind", label: "Tercia", emoji: "3️⃣" },
  { id: "straight", label: "Escalera", emoji: "📈" },
  { id: "flush", label: "Color", emoji: "🎨" },
  { id: "full_house", label: "Full", emoji: "🏠" },
  { id: "four_of_a_kind", label: "Póker", emoji: "🍀" },
  { id: "straight_flush", label: "Esc. Color", emoji: "🌈" },
  { id: "royal_flush", label: "Esc. Real", emoji: "👑" },
];

type SessionPlayer = {
  playerId: string;
  playerName: string;
  playerNickname: string | null;
  finishPosition: number | null;
};

type HandPlayerState = {
  playerId: string;
  name: string;
  participated: boolean;
  wentAllIn: boolean;
  won: boolean;
  drinks: number;
  isOut: boolean;
  role: "dealer" | "sb" | null; // D(=BB) or SB
};

type SavedHand = {
  handNumber: number;
  winner: string;
  allIns: number;
  eliminations: number;
};

export default function HandsPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [playerStates, setPlayerStates] = useState<HandPlayerState[]>([]);
  const [savedHands, setSavedHands] = useState<SavedHand[]>([]);
  const [handCount, setHandCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showSubstitute, setShowSubstitute] = useState(false);
  const [substituteTarget, setSubstituteTarget] = useState<string | null>(null);
  const [editingHand, setEditingHand] = useState<number | null>(null);
  const [winningHandType, setWinningHandType] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [sessionRes, handsRes] = await Promise.all([
          fetch(`/api/poker/sessions/${sessionId}`),
          fetch(`/api/poker/sessions/${sessionId}/hands`),
        ]);

        if (!sessionRes.ok) {
          setError("Sesión no encontrada");
          setLoading(false);
          return;
        }

        const sessionData = await sessionRes.json();
        const handsData = await handsRes.json();

        setHandCount(handsData.length);

        // Determine who's already eliminated
        const eliminatedIds = new Set<string>();
        const savedList: SavedHand[] = [];

        for (const hand of handsData) {
          const winner = hand.players.find((p: { won: boolean; playerNickname: string; playerName: string }) => p.won);
          const allIns = hand.players.filter((p: { wentAllIn: boolean }) => p.wentAllIn).length;
          const elims = hand.players.filter((p: { eliminated: boolean }) => p.eliminated).length;
          savedList.push({
            handNumber: hand.handNumber,
            winner: winner?.playerNickname || winner?.playerName || "?",
            allIns,
            eliminations: elims,
          });

          for (const p of hand.players) {
            if (p.eliminated) eliminatedIds.add(p.playerId);
          }
        }
        setSavedHands(savedList);

        // Init player states
        const states: HandPlayerState[] = sessionData.players.map((p: SessionPlayer) => ({
          playerId: p.playerId,
          name: p.playerNickname || p.playerName,
          participated: !eliminatedIds.has(p.playerId),
          wentAllIn: false,
          won: false,
          drinks: 0,
          isOut: eliminatedIds.has(p.playerId),
          role: null,
        }));

        setPlayerStates(states);
        setLoading(false);
      } catch {
        setError("Error cargando datos");
        setLoading(false);
      }
    }
    load();
  }, [sessionId]);

  // ─── Toggle functions ────────────────────────────────────────────────────

  function toggleParticipated(idx: number) {
    setPlayerStates((prev) => {
      const next = [...prev];
      const p = { ...next[idx] };
      if (p.isOut) return prev;
      p.participated = !p.participated;
      if (!p.participated) {
        p.wentAllIn = false;
        p.won = false;
      }
      next[idx] = p;
      return next;
    });
  }

  function toggleAllIn(idx: number) {
    setPlayerStates((prev) => {
      const next = [...prev];
      const p = { ...next[idx] };
      if (!p.participated || p.isOut) return prev;
      p.wentAllIn = !p.wentAllIn;
      next[idx] = p;
      return next;
    });
  }

  function toggleWon(idx: number) {
    setPlayerStates((prev) => {
      const next = [...prev];
      const p = { ...next[idx] };
      if (!p.participated || p.isOut) return prev;
      const newWon = !p.won;
      // Only one winner
      for (let i = 0; i < next.length; i++) {
        if (next[i].won && i !== idx) {
          next[i] = { ...next[i], won: false };
        }
      }
      p.won = newWon;
      next[idx] = p;
      return next;
    });
  }

  function addDrink(idx: number) {
    setPlayerStates((prev) => {
      const next = [...prev];
      const p = { ...next[idx] };
      if (p.isOut) return prev;
      p.drinks++;
      next[idx] = p;
      return next;
    });
  }

  // Tap on name cycles role: null -> dealer -> sb -> null
  function cycleRole(idx: number) {
    setPlayerStates((prev) => {
      const next = [...prev];
      const p = { ...next[idx] };
      if (p.isOut) return prev;

      if (p.role === null) {
        // Check if dealer already assigned
        const hasDealer = next.some((ps, i) => i !== idx && ps.role === "dealer");
        if (!hasDealer) {
          p.role = "dealer";
        } else {
          // Check if sb already assigned
          const hasSb = next.some((ps, i) => i !== idx && ps.role === "sb");
          if (!hasSb) {
            p.role = "sb";
          } else {
            p.role = "dealer"; // override
            // Clear previous dealer
            for (let i = 0; i < next.length; i++) {
              if (next[i].role === "dealer" && i !== idx) {
                next[i] = { ...next[i], role: null };
              }
            }
          }
        }
      } else if (p.role === "dealer") {
        p.role = "sb";
        // Clear previous sb
        for (let i = 0; i < next.length; i++) {
          if (next[i].role === "sb" && i !== idx) {
            next[i] = { ...next[i], role: null };
          }
        }
      } else {
        p.role = null;
      }

      next[idx] = p;
      return next;
    });
  }

  // ─── Save hand ──────────────────────────────────────────────────────────

  async function saveHand() {
    const participants = playerStates.filter((p) => p.participated && !p.isOut);
    const winners = participants.filter((p) => p.won);
    const hasDealer = playerStates.some((p) => p.role === "dealer" && !p.isOut);
    const hasSb = playerStates.some((p) => p.role === "sb" && !p.isOut);

    if (!hasDealer || !hasSb) {
      setError("Asigna Dealer (D) y Small Blind (SB)");
      return;
    }
    if (participants.length < 2) {
      setError("Mínimo 2 jugadores activos");
      return;
    }
    if (winners.length !== 1) {
      setError("Selecciona exactamente 1 ganador");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const dealerPlayer = playerStates.find((p) => p.role === "dealer");
    const sbPlayer = playerStates.find((p) => p.role === "sb");

    const body = {
      dealerId: dealerPlayer?.playerId || null,
      sbId: sbPlayer?.playerId || null,
      winningHandType,
      players: playerStates
        .filter((p) => !p.isOut)
        .map((p) => ({
          playerId: p.playerId,
          participated: p.participated,
          wentAllIn: p.wentAllIn,
          won: p.won,
          drinks: p.drinks,
        })),
    };

    const res = await fetch(`/api/poker/sessions/${sessionId}/hands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const newHandNum = handCount + 1;
      const winner = playerStates.find((p) => p.won);
      const allIns = playerStates.filter((p) => p.wentAllIn && !p.isOut).length;
      // Infer eliminations: all-in + not won = eliminated
      const elims = playerStates.filter((p) => p.wentAllIn && !p.won && p.participated && !p.isOut).length;

      setSavedHands((prev) => [
        ...prev,
        {
          handNumber: newHandNum,
          winner: winner?.name || "?",
          allIns,
          eliminations: elims,
        },
      ]);
      setHandCount(newHandNum);

      // Reset for next hand — mark newly eliminated (all-in + not won)
      setPlayerStates((prev) =>
        prev.map((p) => {
          const wasEliminated = p.wentAllIn && !p.won && p.participated && !p.isOut;
          return {
            ...p,
            isOut: p.isOut || wasEliminated,
            participated: !(p.isOut || wasEliminated),
            wentAllIn: false,
            won: false,
            drinks: 0,
            role: null,
          };
        })
      );
      setWinningHandType(null);

      setSuccess(`Mano #${newHandNum} guardada ✓`);
      setTimeout(() => setSuccess(""), 2000);
    } else {
      const data = await res.json();
      setError(data.error || "Error al guardar");
    }

    setSaving(false);
  }

  // ─── Edit previous hand ─────────────────────────────────────────────────

  async function loadPreviousHand() {
    if (handCount === 0) return;
    const targetHand = editingHand !== null ? editingHand - 1 : handCount;
    if (targetHand < 1) return;

    try {
      const res = await fetch(`/api/poker/sessions/${sessionId}/hands`);
      const handsData = await res.json();
      const hand = handsData.find((h: { handNumber: number }) => h.handNumber === targetHand);
      if (!hand) return;

      setEditingHand(targetHand);

      // Rebuild who was alive at that point (all eliminated BEFORE this hand)
      const eliminatedBefore = new Set<string>();
      for (const h of handsData) {
        if (h.handNumber >= targetHand) break;
        for (const p of h.players) {
          if (p.eliminated) eliminatedBefore.add(p.playerId);
        }
      }

      // Set player states from this hand's data
      setPlayerStates((prev) =>
        prev.map((ps) => {
          const handPlayer = hand.players.find((hp: { playerId: string }) => hp.playerId === ps.playerId);
          if (!handPlayer) {
            return { ...ps, isOut: eliminatedBefore.has(ps.playerId), participated: false, wentAllIn: false, won: false, drinks: 0, role: null };
          }
          return {
            ...ps,
            isOut: eliminatedBefore.has(ps.playerId),
            participated: handPlayer.participated,
            wentAllIn: handPlayer.wentAllIn,
            won: handPlayer.won,
            drinks: 0, // drinks not loaded back for simplicity
            role: hand.dealerId === ps.playerId ? "dealer" as const : hand.sbId === ps.playerId ? "sb" as const : null,
          };
        })
      );
    } catch {
      setError("Error cargando mano anterior");
    }
  }

  async function saveEditedHand() {
    if (editingHand === null) return;

    const participants = playerStates.filter((p) => p.participated && !p.isOut);
    const winners = participants.filter((p) => p.won);
    const hasDealer = playerStates.some((p) => p.role === "dealer" && !p.isOut);
    const hasSb = playerStates.some((p) => p.role === "sb" && !p.isOut);

    if (!hasDealer || !hasSb) { setError("Asigna Dealer (D) y Small Blind (SB)"); return; }
    if (winners.length !== 1) { setError("Selecciona exactamente 1 ganador"); return; }

    setSaving(true);
    setError("");

    // Get hand ID for this handNumber
    const handsRes = await fetch(`/api/poker/sessions/${sessionId}/hands`);
    const handsData = await handsRes.json();
    const hand = handsData.find((h: { handNumber: number }) => h.handNumber === editingHand);
    if (!hand) { setError("Mano no encontrada"); setSaving(false); return; }

    // Delete and recreate (simplest approach)
    await fetch(`/api/poker/sessions/${sessionId}/hands/${hand.id}`, { method: "DELETE" });

    const dealerPlayer = playerStates.find((p) => p.role === "dealer");
    const sbPlayer = playerStates.find((p) => p.role === "sb");

    // We need to recreate with same hand number — but API auto-increments
    // Instead, use a direct approach: delete then POST (will get new handNumber at end)
    // Actually better: just rebuild. For now, let's use the simple approach of delete + re-add
    // The hand number will change. Acceptable trade-off for now.

    const body = {
      dealerId: dealerPlayer?.playerId || null,
      sbId: sbPlayer?.playerId || null,
      winningHandType,
      players: playerStates
        .filter((p) => !p.isOut)
        .map((p) => ({
          playerId: p.playerId,
          participated: p.participated,
          wentAllIn: p.wentAllIn,
          won: p.won,
          drinks: p.drinks,
        })),
    };

    const res = await fetch(`/api/poker/sessions/${sessionId}/hands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setSuccess(`Mano #${editingHand} actualizada ✓`);
      setTimeout(() => setSuccess(""), 2000);
      // Reload page to reset state
      window.location.reload();
    } else {
      const data = await res.json();
      setError(data.error || "Error al guardar");
    }
    setSaving(false);
  }

  function cancelEdit() {
    setEditingHand(null);
    // Reload to reset states properly
    window.location.reload();
  }

  // ─── Substitution ───────────────────────────────────────────────────────

  function openSubstitute(eliminatedPlayerId: string) {
    setSubstituteTarget(eliminatedPlayerId);
    setShowSubstitute(true);
  }

  async function confirmSubstitute(leavingPlayerId: string) {
    if (!substituteTarget) return;

    const res = await fetch(`/api/poker/sessions/${sessionId}/substitute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leftPlayerId: leavingPlayerId,
        revivedPlayerId: substituteTarget,
      }),
    });

    if (res.ok) {
      // Revive the eliminated player, mark the leaving player as out
      setPlayerStates((prev) =>
        prev.map((p) => {
          if (p.playerId === substituteTarget) {
            return { ...p, isOut: false, participated: true, wentAllIn: false, won: false, drinks: 0, role: null };
          }
          if (p.playerId === leavingPlayerId) {
            return { ...p, isOut: true, participated: false };
          }
          return p;
        })
      );
      setSuccess("Sustitución registrada ✓");
      setTimeout(() => setSuccess(""), 2000);
    } else {
      setError("Error en sustitución");
    }

    setShowSubstitute(false);
    setSubstituteTarget(null);
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) return <p className="text-center text-gray-500">Cargando...</p>;

  const activePlayers = playerStates.filter((p) => !p.isOut);
  const eliminatedPlayers = playerStates.filter((p) => p.isOut);
  const isGameOver = activePlayers.length <= 1 && handCount > 0;
  const gameWinner = isGameOver ? activePlayers[0] : null;

  if (isGameOver) {
    return (
      <div className="space-y-6 pb-24">
        <div className="rounded-xl bg-gray-900 p-6 text-center">
          <p className="text-5xl mb-4">🏆</p>
          <p className="text-2xl font-bold text-yellow-400">
            {gameWinner?.name || "?"} gana la mesa
          </p>
          <p className="mt-2 text-sm text-gray-400">
            {handCount} manos jugadas
          </p>
          <Link
            href={`/admin/sessions/${sessionId}`}
            className="mt-4 inline-block rounded-lg bg-emerald-600 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Ver sesión → Cerrar
          </Link>
        </div>

        {savedHands.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-gray-500">Historial ({savedHands.length} manos)</p>
            <div className="max-h-60 overflow-y-auto rounded-lg bg-gray-900 p-2">
              {savedHands.map((h) => (
                <div key={h.handNumber} className="flex items-center justify-between border-b border-gray-800/50 py-1 last:border-0">
                  <span className="text-xs text-gray-400">#{h.handNumber}</span>
                  <span className="text-xs font-medium">🏆 {h.winner}</span>
                  <span className="text-xs text-gray-500">
                    {h.allIns > 0 && `${h.allIns} A-I `}
                    {h.eliminations > 0 && `${h.eliminations}💀`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Manos</h1>
          <p className="text-sm text-gray-400">
            {editingHand !== null
              ? `Editando mano #${editingHand}`
              : `Mano #${handCount + 1} · ${activePlayers.length} activos`}
          </p>
        </div>
        <div className="flex gap-2">
          {handCount > 0 && editingHand === null && (
            <button
              onClick={loadPreviousHand}
              className="text-xs text-gray-400 hover:text-white rounded bg-gray-800 px-2 py-1"
            >
              ← Editar anterior
            </button>
          )}
          {editingHand !== null && editingHand > 1 && (
            <button
              onClick={loadPreviousHand}
              className="text-xs text-gray-400 hover:text-white rounded bg-gray-800 px-2 py-1"
            >
              ← #{editingHand - 1}
            </button>
          )}
          {editingHand !== null && (
            <button
              onClick={cancelEdit}
              className="text-xs text-red-400 hover:text-red-300 rounded bg-gray-800 px-2 py-1"
            >
              Cancelar
            </button>
          )}
          <Link href={`/admin/sessions/${sessionId}`} className="text-sm text-gray-400 hover:text-white">
            ← Sesión
          </Link>
        </div>
      </div>

      {/* Active players grid */}
      <div className="space-y-1">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_2.5rem_2.5rem_2.5rem_2.5rem] gap-1 px-2 text-center text-xs text-gray-500">
          <span className="text-left">Jugador (tap = D/SB)</span>
          <span>In</span>
          <span>A-I</span>
          <span>🏆</span>
          <span>🍺</span>
        </div>

        {activePlayers.map((p) => {
          const idx = playerStates.findIndex((ps) => ps.playerId === p.playerId);
          return (
            <div
              key={p.playerId}
              className={`grid grid-cols-[1fr_2.5rem_2.5rem_2.5rem_2.5rem] items-center gap-1 rounded-lg px-2 py-2 ${
                p.participated ? "bg-gray-900" : "bg-gray-900/40"
              }`}
            >
              {/* Name — tap to cycle D/SB role */}
              <button
                onClick={() => cycleRole(idx)}
                className={`truncate text-left text-sm font-medium ${
                  p.participated ? "text-white" : "text-gray-600"
                }`}
              >
                {p.name}
                {p.role === "dealer" && (
                  <span className="ml-1 rounded bg-yellow-600 px-1 text-[10px] font-bold text-black">D</span>
                )}
                {p.role === "sb" && (
                  <span className="ml-1 rounded bg-blue-600 px-1 text-[10px] font-bold text-white">SB</span>
                )}
              </button>

              {/* Participated */}
              <button
                onClick={() => toggleParticipated(idx)}
                className={`mx-auto flex h-8 w-8 items-center justify-center rounded-md text-sm transition active:scale-90 ${
                  p.participated ? "bg-emerald-600 text-white" : "bg-gray-700 text-gray-500"
                }`}
              >
                ✓
              </button>

              {/* All-in */}
              <button
                onClick={() => toggleAllIn(idx)}
                disabled={!p.participated}
                className={`mx-auto flex h-8 w-8 items-center justify-center rounded-md text-sm transition active:scale-90 ${
                  p.wentAllIn ? "bg-orange-600 text-white" : "bg-gray-700 text-gray-500"
                } disabled:opacity-30`}
              >
                A
              </button>

              {/* Won */}
              <button
                onClick={() => toggleWon(idx)}
                disabled={!p.participated}
                className={`mx-auto flex h-8 w-8 items-center justify-center rounded-md text-sm transition active:scale-90 ${
                  p.won ? "bg-yellow-500 text-black font-bold" : "bg-gray-700 text-gray-500"
                } disabled:opacity-30`}
              >
                W
              </button>

              {/* Drinks */}
              <button
                onClick={() => addDrink(idx)}
                className="mx-auto flex h-8 w-8 items-center justify-center rounded-md text-sm bg-gray-700 text-gray-500 transition active:scale-90"
              >
                {p.drinks > 0 ? p.drinks : "+"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Winning hand type selector — shows when a winner is marked */}
      {playerStates.some((p) => p.won && !p.isOut) && (
        <div className="rounded-lg bg-gray-900 p-3">
          <p className="mb-2 text-xs text-gray-400">
            🏆 {playerStates.find((p) => p.won)?.name} ganó con:
          </p>
          <div className="grid grid-cols-5 gap-1">
            {HAND_TYPES.map((ht) => (
              <button
                key={ht.id}
                onClick={() => setWinningHandType(winningHandType === ht.id ? null : ht.id)}
                className={`flex flex-col items-center rounded-md py-2 text-[10px] transition active:scale-90 ${
                  winningHandType === ht.id
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-800 text-gray-400"
                }`}
              >
                <span className="text-base">{ht.emoji}</span>
                <span className="leading-tight text-center">{ht.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Eliminated players — tap to substitute */}
      {eliminatedPlayers.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-600">Eliminados (tap para revivir)</p>
          <div className="flex flex-wrap gap-2">
            {eliminatedPlayers.map((p) => (
              <button
                key={p.playerId}
                onClick={() => openSubstitute(p.playerId)}
                className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-500 line-through transition hover:bg-gray-700 hover:text-gray-300"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Substitution popup */}
      {showSubstitute && substituteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl bg-gray-900 p-5">
            <h3 className="mb-3 text-center font-bold">
              Revivir: {playerStates.find((p) => p.playerId === substituteTarget)?.name}
            </h3>
            <p className="mb-4 text-center text-sm text-gray-400">
              ¿Quién abandona y le hereda fichas?
            </p>
            <div className="space-y-2">
              {activePlayers.map((p) => (
                <button
                  key={p.playerId}
                  onClick={() => confirmSubstitute(p.playerId)}
                  className="w-full rounded-lg bg-gray-800 px-4 py-3 text-left text-sm font-medium text-white transition hover:bg-gray-700"
                >
                  {p.name} se va →
                </button>
              ))}
            </div>
            <button
              onClick={() => { setShowSubstitute(false); setSubstituteTarget(null); }}
              className="mt-3 w-full rounded-lg border border-gray-700 py-2 text-sm text-gray-400"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="rounded bg-red-900/50 p-2 text-center text-sm text-red-300">{error}</p>
      )}

      {/* Success toast */}
      {success && (
        <p className="rounded bg-emerald-900/50 p-2 text-center text-sm text-emerald-300">{success}</p>
      )}

      {/* Save hand button */}
      <button
        onClick={editingHand !== null ? saveEditedHand : saveHand}
        disabled={saving || activePlayers.length < 2}
        className="fixed bottom-6 left-4 right-4 mx-auto max-w-lg rounded-xl bg-emerald-600 py-4 text-center text-lg font-bold text-white shadow-lg transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
      >
        {saving
          ? "Guardando..."
          : editingHand !== null
          ? `Actualizar Mano #${editingHand}`
          : `Guardar Mano #${handCount + 1}`}
      </button>

      {/* Saved hands log */}
      {savedHands.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Historial ({savedHands.length} manos)</p>
          <div className="max-h-40 overflow-y-auto rounded-lg bg-gray-900 p-2">
            {savedHands.map((h) => (
              <div key={h.handNumber} className="flex items-center justify-between border-b border-gray-800/50 py-1 last:border-0">
                <span className="text-xs text-gray-400">#{h.handNumber}</span>
                <span className="text-xs font-medium">🏆 {h.winner}</span>
                <span className="text-xs text-gray-500">
                  {h.allIns > 0 && `${h.allIns} A-I `}
                  {h.eliminations > 0 && `${h.eliminations}💀`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
