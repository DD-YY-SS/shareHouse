import crypto from 'node:crypto';

// 설문 원문과 채팅 본문을 학습 데이터에 그대로 넣지 않고,
// 행동 프로필 스냅샷과 집계 지표만 라벨 데이터로 누적합니다.
export function recordOutcomeLabel({
  store,
  createId,
  contractId,
  userId,
  checkpoint,
  satisfaction,
  conflict,
  earlyExit,
  conflictCategories = [],
  source = 'checkin',
  getChatFeatures,
}) {
  const contract = store.contracts.get(contractId);
  const profile = store.profiles.get(userId) || {};
  const matchId = contract?.matchId;
  const chatFeatures = matchId ? getChatFeatures(matchId, userId) : {};
  const label = conflict || earlyExit
    ? 'compatibility_risk'
    : satisfaction >= 4
      ? 'stable_match'
      : 'needs_mediation';
  const normalizedCategories = [...new Set(
    (Array.isArray(conflictCategories) ? conflictCategories : []).slice(0, 5),
  )];
  const patternPayload = JSON.stringify({
    profile,
    proactivityScore: chatFeatures.proactivityScore || null,
  });
  const patternKey = crypto.createHash('sha256').update(patternPayload).digest('hex');
  const feedback = {
    id: createId(),
    contractId,
    userId,
    matchId,
    checkpoint,
    satisfaction,
    conflict,
    earlyExit,
    conflictCategories: normalizedCategories,
    label,
    behaviorSnapshot: profile,
    chatFeatures,
    patternKey,
    source,
    createdAt: new Date().toISOString(),
  };

  store.feedback.set(feedback.id, feedback);
  const aggregate = store.patternAggregates.get(patternKey) || {
    patternKey,
    featureSummary: { profile, proactivityScore: chatFeatures.proactivityScore || null },
    categoryCounts: {},
    totalSamples: 0,
    conflictSamples: 0,
    stableSamples: 0,
    satisfactionSum: 0,
    updatedAt: null,
  };
  aggregate.totalSamples += 1;
  aggregate.satisfactionSum += satisfaction;
  if (label === 'compatibility_risk') aggregate.conflictSamples += 1;
  if (label === 'stable_match') aggregate.stableSamples += 1;
  normalizedCategories.forEach((category) => {
    aggregate.categoryCounts[category] = (aggregate.categoryCounts[category] || 0) + 1;
  });
  aggregate.updatedAt = new Date().toISOString();
  store.patternAggregates.set(patternKey, aggregate);

  const rule = store.rules.find((item) => item.key === 'deliveryWasteBand');
  if (rule) rule.weight = Math.max(5, Math.min(40, rule.weight + (label === 'compatibility_risk' ? 1 : -0.5)));
  return { feedback, aggregate, updatedRule: rule };
}
