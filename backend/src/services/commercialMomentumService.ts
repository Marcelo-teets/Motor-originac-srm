export class CommercialMomentumService {
  calculate(input: {
    daysSinceLastTouchpoint?: number;
    hasOverdueNextStep?: boolean;
    hasChampion?: boolean;
    hasBlocker?: boolean;
    openObjections?: number;
    recentSignalStrength?: number;
  }) {
    let score = 50;

    if ((input.daysSinceLastTouchpoint ?? 999) <= 7) score += 15;
    if ((input.daysSinceLastTouchpoint ?? 999) > 21) score -= 20;
    if (input.hasOverdueNextStep) score -= 15;
    if (input.hasChampion) score += 15;
    if (input.hasBlocker) score -= 10;
    if ((input.openObjections ?? 0) >= 2) score -= 10;
    if ((input.recentSignalStrength ?? 0) >= 75) score += 10;

    const bounded = Math.max(0, Math.min(100, score));
    const status = bounded >= 70 ? 'accelerating' : bounded >= 45 ? 'stable' : 'cooling';

    return {
      momentumScore: bounded,
      momentumStatus: status,
      rationale: `Momentum ${status} calculado a partir de cobertura comercial, champion/blocker, next step e sinais recentes.`,
    };
  }
}
