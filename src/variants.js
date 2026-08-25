export const VARIANT_CONTEXT_KEY = 'cm-variant-context';

export const VARIANTS = [
  {
    id: 'standard',
    label: '현재 버전',
    title: '셰어하우스 안심 매칭',
    description: '행동 패턴과 생활 선호를 기준으로 가장 잘 맞는 룸메이트를 찾아요.',
    detail: '운영사 연계형 기본 매칭',
  },
  {
    id: 'dorm',
    label: '대학교 기숙사',
    title: '기숙사 룸메이트 매칭',
    description: '같은 학교·캠퍼스 안에서 생활 리듬이 잘 맞는 룸메이트를 찾아요.',
    detail: '학교/캠퍼스 단위로 후보 제한',
  },
  {
    id: 'nearby',
    label: '거리 기반',
    title: '1km 안심 매칭',
    description: '내 위치에서 1km 이내에 있는 후보만 비교해요.',
    detail: '거리 조건을 통과한 후보만 노출',
  },
];

const defaultLocation = { latitude: 37.5665, longitude: 126.978 };

export function readVariantContext() {
  if (typeof window === 'undefined') return null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(VARIANT_CONTEXT_KEY) || 'null');
    return saved?.id && VARIANTS.some((variant) => variant.id === saved.id) ? saved : null;
  } catch {
    return null;
  }
}

export function saveVariantContext(context) {
  const value = {
    id: context.id,
    campusId: context.id === 'dorm' ? String(context.campusId || 'demo-campus').trim().slice(0, 80) : null,
    latitude: context.id === 'nearby' ? Number(context.latitude) : null,
    longitude: context.id === 'nearby' ? Number(context.longitude) : null,
  };
  if (value.id === 'nearby' && (!Number.isFinite(value.latitude) || !Number.isFinite(value.longitude))) {
    value.latitude = defaultLocation.latitude;
    value.longitude = defaultLocation.longitude;
  }
  sessionStorage.setItem(VARIANT_CONTEXT_KEY, JSON.stringify(value));
  return value;
}

