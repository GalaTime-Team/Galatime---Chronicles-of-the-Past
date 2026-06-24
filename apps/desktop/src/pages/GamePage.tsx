import { useEffect } from "react";
import { startGame } from "../controllers/gameController";
import { HudPanel } from "../components/game/HudPanel";
import { useGameStore } from "../stores/gameStore";

export function GamePage() {
  const { gameState, loading, setLoading } = useGameStore();

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      setLoading(true);
      try {
        await startGame("Chronicle Keeper");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void boot();

    return () => {
      mounted = false;
    };
  }, [setLoading]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-stone-900 to-amber-950 px-6 py-8 text-amber-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="rounded-2xl border border-amber-800/30 bg-black/30 p-6 shadow-2xl shadow-amber-950/40">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-300">GalaTime</p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">Chronicles of the Past</h1>
          <p className="mt-2 text-amber-200/80">Estrutura base com Tauri + Tailwind pronta para evoluir as mecanicas do jogo.</p>
        </header>

        {loading && <p className="text-sm text-amber-200">Carregando estado inicial do jogo...</p>}

        {gameState ? (
          <>
            <HudPanel gameState={gameState} />
            <section className="rounded-xl border border-amber-900/40 bg-black/35 p-5">
              <h2 className="text-xl font-semibold">Cena Atual</h2>
              <p className="mt-3 text-amber-100/90">{gameState.location}</p>
              {gameState.activeEvent && (
                <div className="mt-4 rounded-lg border border-amber-700/40 bg-amber-950/40 p-4">
                  <h3 className="font-semibold">{gameState.activeEvent.title}</h3>
                  <p className="mt-1 text-sm text-amber-100/90">{gameState.activeEvent.description}</p>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
