export class CommercialPriorityService {
  calculate(input: { leadScore?: number; rankingScore?: number; triggerStrength?: number; urgencyScore?: number }) {
    let score = 0;
    score += Math.round((input.leadScore ?? 0) * 0.4);
    score += Math.round((input.rankingScore ?? 0) * 0.25);
    score += Math.round((input.triggerStrength ?? 0) * 0.2);
    score += Math.round((input.urgencyScore ?? 0) * 0.15);
    const bounded = Math.max(0, Math.min(100, score));
    const band = bounded >= 80 ? 'immediate' : bounded >= 65 ? 'high' : bounded >= 45 ? 'medium' : 'monitor';
    return { priorityScore: bounded, priorityBand: band, rationale: 'Prioridade comercial baseada em lead, ranking, trigger e urgencia.' };
  }
}
