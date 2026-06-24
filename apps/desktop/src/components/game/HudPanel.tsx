import type { GameState } from "../../types/game.types";

interface HudPanelProps {
  gameState: GameState;
}

export function HudPanel({ gameState }: HudPanelProps) {
  return (
    <section className="rounded-xl border border-amber-900/40 bg-black/35 p-4 text-amber-100">
      <h2 className="text-lg font-semibold tracking-wide">Status do Heroi</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <p>Nome: {gameState.player.name}</p>
        <p>Nivel: {gameState.player.level}</p>
        <p>Vida: {gameState.player.health}/{gameState.player.maxHealth}</p>
        <p>Capitulo: {gameState.chapter}</p>
      </div>
    </section>
  );
}
