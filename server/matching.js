// Explainable, non-ML matching. Operators can tune these weights at runtime.
// The total is intentionally close to 100 so the score is easy to explain in the UI.
export const DEFAULT_RULES = [
  { key: 'lateReturnBand', label: '심야 귀가 빈도', weight: 20, maxDistance: 3, enabled: true },
  { key: 'sleepTimeBand', label: '잠드는 시간대', weight: 15, maxDistance: 3, enabled: true },
  { key: 'wakeTimeBand', label: '기상 시간대', weight: 10, maxDistance: 3, enabled: true },
  { key: 'cleaningBand', label: '공용 공간 청소', weight: 15, maxDistance: 3, enabled: true },
  { key: 'noiseBand', label: '소음·통화 시간', weight: 15, maxDistance: 3, enabled: true },
  { key: 'deliveryWasteBand', label: '배달 쓰레기 배출', weight: 10, maxDistance: 3, enabled: true },
  { key: 'guestFrequencyBand', label: '방문객 빈도', weight: 10, maxDistance: 3, enabled: true },
  { key: 'cookingBand', label: '취사 빈도', weight: 3, maxDistance: 3, enabled: true },
  { key: 'commonSpaceBand', label: '공용 공간 사용', weight: 2, maxDistance: 3, enabled: true },
];

function fitMessage(distance) {
  if (distance === 0) return '생활 기준이 거의 같아요';
  if (distance === 1) return '생활 리듬 차이가 작아요';
  if (distance === 2) return '입주 전 조율이 필요한 항목이에요';
  return '생활 패턴 차이가 큰 항목이에요';
}

export function scoreCompatibility(left = {}, right = {}, rules = DEFAULT_RULES) {
  const activeRules = rules.filter((rule) => rule.enabled);
  const totalWeight = activeRules.reduce((sum, rule) => sum + rule.weight, 0);
  const breakdown = activeRules.map((rule) => {
    const leftValue = Number.isInteger(left[rule.key]) ? left[rule.key] : 1;
    const rightValue = Number.isInteger(right[rule.key]) ? right[rule.key] : 1;
    const distance = Math.abs(leftValue - rightValue);
    const fit = Math.max(0, 1 - distance / Math.max(1, rule.maxDistance));
    return {
      key: rule.key,
      label: rule.label,
      weight: rule.weight,
      distance,
      matched: distance <= 1,
      fitPercent: Math.round(fit * 100),
      contribution: Math.round(fit * rule.weight),
      message: fitMessage(distance),
    };
  });
  const score = totalWeight ? Math.round((breakdown.reduce((sum, item) => sum + item.contribution, 0) / totalWeight) * 100) : 0;
  const bestReasons = [...breakdown].sort((a, b) => b.contribution - a.contribution || a.distance - b.distance).slice(0, 3);
  const watchouts = breakdown.filter((item) => item.distance >= 2).sort((a, b) => b.weight - a.weight).slice(0, 2);
  return { score, breakdown, bestReasons, watchouts, matchedCount: breakdown.filter((item) => item.matched).length, totalRules: breakdown.length };
}

export function rankCandidates(ownProfile, users, profiles, rules) {
  return users
    .map((user) => ({
      candidateId: user.id,
      pseudonym: '익명 입주 예정자',
      verification: { identity: 'passed', affiliation: 'passed' },
      ...scoreCompatibility(ownProfile, profiles.get(user.id), rules),
    }))
    .sort((left, right) => right.score - left.score || right.matchedCount - left.matchedCount || left.candidateId.localeCompare(right.candidateId))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
