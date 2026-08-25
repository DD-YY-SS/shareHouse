// Explainable rule-based matching.
// Every survey answer is a 1-5 behavior score. A smaller difference means a
// closer lifestyle fit; noise and age tolerance use their cross-comparison rules.

const QUESTION_RULES = [
  ['sleepTimeBand', '평소 잠드는 시간', 'sleep'],
  ['lateReturnBand', '자정 이후 귀가 빈도', 'sleep'],
  ['wakeTimeBand', '평소 기상 시간', 'sleep'],
  ['speakerNoiseBand', '스피커 사용 빈도', 'noise'],
  ['lateCallBand', '밤 11시 이후 통화 빈도', 'noise'],
  ['noiseToleranceBand', '허용 가능한 소음 수준', 'noise'],
  ['commonCleaningBand', '공용공간 청소 횟수', 'cleaning'],
  ['bathroomCleaningBand', '화장실 청소 횟수', 'cleaning'],
  ['dishwashingBand', '설거지 처리 속도', 'cleaning'],
  ['guestFrequencyBand', '손님 초대 빈도', 'community'],
  ['ageGapToleranceBand', '허용 가능한 나이 차이', 'community'],
  ['interactionBand', '룸메이트 교류 정도', 'community'],
  ['cookingBand', '직접 요리 횟수', 'convenience'],
  ['deliveryBand', '배달 음식 이용 횟수', 'convenience'],
  ['climateBand', '냉난방 사용 성향', 'convenience'],
];

export const DEFAULT_RULES = QUESTION_RULES.map(([key, label]) => ({
  key, label, weight: 6, maxDistance: 4, enabled: true,
})).concat([
  { key: 'roomType', label: '주거 형태', weight: 6, maxDistance: 1, enabled: true },
  { key: 'shareCount', label: '쉐어 인원', weight: 4, maxDistance: 2, enabled: true },
]);

const DOMAIN_LABELS = {
  sleep: '수면·생활 시간',
  noise: '소음',
  cleaning: '청소·공용공간',
  community: '방문객·공동생활',
  convenience: '생활 편의',
  housing: '주거 형태',
};

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const average = (values) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

function bandValue(profile, key) {
  const raw = Number(profile?.[key]);
  if (!Number.isFinite(raw)) return 3;
  // Profiles saved by the previous UI used zero-based indexes. Keep them
  // readable while all newly saved profiles use the explicit 1-5 scale.
  const version = Number(profile?._meta?.surveyVersion || 1);
  if (version < 2 && raw >= 0 && raw <= 3) return raw + 1;
  return clamp(Math.round(raw), 1, 5);
}

function directFit(left, right) {
  const distance = Math.abs(left - right);
  return { distance, fitPercent: Math.round(100 - (distance / 4) * 100) };
}

function noiseFit(generated, tolerated) {
  const gap = Math.max(0, generated - tolerated);
  return { distance: gap, fitPercent: clamp(Math.round(100 - gap * 25)) };
}

function allowedAgeGap(value) {
  return [0, 2, 4, 6, 100][clamp(value, 1, 5) - 1];
}

function ageFit(left = {}, right = {}, leftTolerance, rightTolerance) {
  if (!Number.isInteger(Number(left.age)) || !Number.isInteger(Number(right.age))) return { distance: 0, fitPercent: 80 };
  const ageGap = Math.abs(Number(left.age) - Number(right.age));
  const allowed = Math.min(allowedAgeGap(leftTolerance), allowedAgeGap(rightTolerance));
  return { distance: Math.max(0, ageGap - allowed), fitPercent: clamp(100 - Math.max(0, ageGap - allowed) * 20) };
}

function fitMessage(fitPercent) {
  if (fitPercent >= 90) return '생활 기준이 거의 같아요.';
  if (fitPercent >= 70) return '생활 패턴 차이가 작아요.';
  if (fitPercent >= 50) return '서로 조율하면 잘 맞을 수 있어요.';
  return '입주 전에 이 기준을 꼭 대화해 보세요.';
}

export function scoreCompatibility(left = {}, right = {}, rules = DEFAULT_RULES) {
  const enabled = new Map(rules.filter((rule) => rule.enabled !== false).map((rule) => [rule.key, rule]));
  const items = [];
  const addItem = (key, label, domain, fit, weight = enabled.get(key)?.weight ?? 6) => {
    items.push({ key, label, domain, weight, distance: fit.distance, fitPercent: fit.fitPercent, matched: fit.fitPercent >= 75, contribution: Math.round(fit.fitPercent * weight / 100), message: fitMessage(fit.fitPercent) });
  };

  for (const [key, label, domain] of QUESTION_RULES) {
    if (domain === 'noise' || (domain === 'community' && key === 'ageGapToleranceBand')) continue;
    addItem(key, label, domain, directFit(bandValue(left, key), bandValue(right, key)));
  }

  const leftNoiseTolerance = bandValue(left, 'noiseToleranceBand');
  const rightNoiseTolerance = bandValue(right, 'noiseToleranceBand');
  const speakerFit = noiseFit(bandValue(left, 'speakerNoiseBand'), rightNoiseTolerance);
  const reverseSpeakerFit = noiseFit(bandValue(right, 'speakerNoiseBand'), leftNoiseTolerance);
  const callFit = noiseFit(bandValue(left, 'lateCallBand'), rightNoiseTolerance);
  const reverseCallFit = noiseFit(bandValue(right, 'lateCallBand'), leftNoiseTolerance);
  addItem('speakerNoiseBand', '스피커 소음 교차 적합도', 'noise', { distance: average([speakerFit.distance, reverseSpeakerFit.distance]), fitPercent: average([speakerFit.fitPercent, reverseSpeakerFit.fitPercent]) });
  addItem('lateCallBand', '늦은 시간 통화 교차 적합도', 'noise', { distance: average([callFit.distance, reverseCallFit.distance]), fitPercent: average([callFit.fitPercent, reverseCallFit.fitPercent]) });
  addItem('noiseToleranceBand', '소음 허용 기준 교차 적합도', 'noise', { distance: average([speakerFit.distance, reverseSpeakerFit.distance, callFit.distance, reverseCallFit.distance]), fitPercent: average([speakerFit.fitPercent, reverseSpeakerFit.fitPercent, callFit.fitPercent, reverseCallFit.fitPercent]) });

  const ageCompatibility = ageFit(left, right, bandValue(left, 'ageGapToleranceBand'), bandValue(right, 'ageGapToleranceBand'));
  addItem('ageGapToleranceBand', '나이 차이 허용 범위', 'community', ageCompatibility);

  const roomTypeFit = left.roomType && right.roomType && left.roomType !== right.roomType ? { distance: 1, fitPercent: 0 } : { distance: 0, fitPercent: 100 };
  const shareCountFit = directFit(Number(left.shareCount) || 2, Number(right.shareCount) || 2);
  addItem('roomType', '주거 형태', 'housing', roomTypeFit, enabled.get('roomType')?.weight ?? 6);
  addItem('shareCount', '쉐어 인원', 'housing', shareCountFit, enabled.get('shareCount')?.weight ?? 4);

  const domainWeights = { sleep: 18, noise: 18, cleaning: 18, community: 18, convenience: 18, housing: 10 };
  const domainBreakdown = Object.entries(domainWeights).map(([key, weight]) => {
    const domainItems = items.filter((item) => item.domain === key);
    const score = average(domainItems.map((item) => item.fitPercent));
    return { key, label: DOMAIN_LABELS[key], score, weight, matched: score >= 75, message: fitMessage(score), itemCount: domainItems.length };
  });
  const totalWeight = domainBreakdown.reduce((sum, domain) => sum + domain.weight, 0);
  const score = Math.round(domainBreakdown.reduce((sum, domain) => sum + domain.score * domain.weight, 0) / totalWeight);
  const bestReasons = [...items].sort((a, b) => b.fitPercent - a.fitPercent || b.weight - a.weight).slice(0, 3);
  const watchouts = [...items].filter((item) => item.fitPercent < 60).sort((a, b) => b.weight - a.weight).slice(0, 3);
  const totalDistance = 100 - score;
  return { score, totalDistance, distance: totalDistance, breakdown: items, domainBreakdown, bestReasons, watchouts, matchedCount: items.filter((item) => item.matched).length, totalRules: items.length };
}

export function rankCandidates(ownProfile, users, profiles, rules) {
  return users
    .map((user) => ({ candidateId: user.id, pseudonym: '익명 입주 예정자', verification: { identity: 'passed', affiliation: 'passed' }, ...scoreCompatibility(ownProfile, profiles.get(user.id), rules) }))
    .sort((left, right) => left.totalDistance - right.totalDistance || right.score - left.score || left.candidateId.localeCompare(right.candidateId))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
