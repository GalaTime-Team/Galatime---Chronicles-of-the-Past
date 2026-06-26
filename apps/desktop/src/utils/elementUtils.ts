/**
 * Utilitários para consolidar e processar fraquezas de elementos.
 */

export interface ElementWeakness {
  [elementId: string]: number;
}

/**
 * Consolida fraquezas de múltiplos elementos somando os valores.
 * 
 * Exemplo: se Ignis tem weak_to Aqua (valor 1) e Caeli (valor 1),
 * e Naturalea também tem weak_to Aqua (valor 1), o resultado será:
 * { aqua: 2, caeli: 1 }
 * 
 * @param elementWeaknesses Array de objetos de fraquezas
 * @returns Objeto consolidado com fraquezas combinadas
 */
export function consolidateWeaknesses(
  elementWeaknesses: ElementWeakness[]
): ElementWeakness {
  const consolidated: ElementWeakness = {};

  for (const weaknesses of elementWeaknesses) {
    for (const [elementId, score] of Object.entries(weaknesses)) {
      consolidated[elementId] = (consolidated[elementId] || 0) + score;
    }
  }

  return consolidated;
}

/**
 * Converte scores de fraqueza para a escala de multiplicador de dano final.
 * 
 * Mapeamento:
 * - imune (-3) -> 0
 * - super_strong (-2) -> 0.25
 * - strong (-1) -> 0.5
 * - normal (0) -> 1
 * - weak (1) -> 2
 * - super_weak (2) -> 4
 * 
 * @param score Score bruto da fraqueza
 * @returns Multiplicador de dano final
 */
export function scoreToMultiplier(score: number): number {
  switch (score) {
    case -3:
      return 0; // imune
    case -2:
      return 0.25; // super_strong
    case -1:
      return 0.5; // strong
    case 0:
      return 1; // normal
    case 1:
      return 2; // weak
    case 2:
      return 4; // super_weak
    default:
      // Interpolação linear para valores fora do intervalo
      if (score < -3) return 0;
      if (score > 2) return 4;
      return 1; // fallback
  }
}

/**
 * Converte um objeto de fraquezas consolidadas para multiplicadores de dano.
 * @param weaknesses Objeto de fraquezas com scores
 * @returns Objeto com os mesmos elementIds e multiplicadores de dano
 */
export function weaknessesToMultipliers(
  weaknesses: ElementWeakness
): Record<string, number> {
  const multipliers: Record<string, number> = {};

  for (const [elementId, score] of Object.entries(weaknesses)) {
    multipliers[elementId] = scoreToMultiplier(score);
  }

  return multipliers;
}
