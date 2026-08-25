export { default as React, useEffect, useRef, useState, useMemo } from 'react';
export { io } from 'socket.io-client';
export { ArrowRight, BadgeCheck, BarChart3, CalendarDays, Camera, HeartHandshake, Check, ChevronLeft, ChevronRight, Clock3, CreditCard, FileCheck2, Home, LockKeyhole, LogOut, MessageCircle, Moon, Plus, Send, ShieldCheck, Sparkles, Sun, Trash2, UserRound, UsersRound } from 'lucide-react';

export const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const frequency = (options) => options.map((label, index) => `${label} (${index + 1})`);
export const survey = [
  ['sleepTimeBand', '평소 잠드는 시간은 주로 언제였나요?', frequency(['밤 10시 이전', '10~12시', '12~2시', '새벽 2~4시', '새벽 4시 이후']), 'sleep'],
  ['lateReturnBand', '자정 이후에 귀가한 날은 며칠이었나요?', frequency(['거의 없음', '주 1~2일', '주 3~4일', '주 5~6일', '거의 매일']), 'sleep'],
  ['wakeTimeBand', '평소 기상 시간은 주로 언제였나요?', frequency(['오전 6시 이전', '6~8시', '8~10시', '10~12시', '정오 이후']), 'sleep'],
  ['speakerNoiseBand', '방에서 스피커로 영상·음악을 튼 날은 며칠이었나요?', frequency(['거의 없음', '주 1~2일', '주 3~4일', '주 5~6일', '거의 매일']), 'noise'],
  ['lateCallBand', '밤 11시 이후 통화·영상통화를 한 날은 며칠이었나요?', frequency(['거의 없음', '주 1~2일', '주 3~4일', '주 5~6일', '거의 매일']), 'noise'],
  ['noiseToleranceBand', '나에게 허용 가능한 생활 소음 수준은 어느 정도인가요?', frequency(['아주 조용해야 함', '조용한 편 선호', '보통', '어느 정도 괜찮음', '소음에 관대함']), 'noise'],
  ['commonCleaningBand', '집의 공용공간을 청소한 횟수는?', frequency(['거의 안 함', '월 1~2회', '주 1회', '주 2~3회', '매일']), 'cleaning'],
  ['bathroomCleaningBand', '화장실·욕실을 청소한 횟수는?', frequency(['거의 안 함', '월 1회', '2주에 1회', '주 1회', '주 2회 이상']), 'cleaning'],
  ['dishwashingBand', '설거지를 식사 후 얼마 만에 처리했나요?', frequency(['며칠씩 쌓아둠', '다음 날', '그날 안에', '몇 시간 내', '바로']), 'cleaning'],
  ['guestFrequencyBand', '집에 손님을 초대한 횟수는?', frequency(['없음', '1~2회', '3~4회', '5~6회', '7회 이상']), 'community'],
  ['ageGapToleranceBand', '룸메이트와의 나이 차이를 어느 정도까지 허용할 수 있나요?', frequency(['동갑만', '1~2살', '3~4살', '5~6살', '나이 상관없음']), 'community'],
  ['interactionBand', '룸메이트와의 교류를 어느 정도 원하나요?', frequency(['함께 시간 보내고 싶음', '가끔 대화', '필요할 때만', '최소한만', '완전히 독립적으로']), 'community'],
  ['cookingBand', '집에서 직접 요리한 횟수는?', frequency(['거의 안 함', '주 1~2회', '주 3~4회', '주 5~6회', '거의 매일']), 'convenience'],
  ['deliveryBand', '배달 음식을 시킨 횟수는?', frequency(['거의 없음', '주 1~2회', '주 3~4회', '주 5~6회', '거의 매일']), 'convenience'],
  ['climateBand', '냉난방 사용에 대한 나의 성향은?', frequency(['최대한 아낌', '아끼는 편', '보통', '자주 사용', '쾌적함 우선']), 'convenience'],
];

export const initialAnswers = {
  sleepTimeBand: 3, lateReturnBand: 3, wakeTimeBand: 3,
  speakerNoiseBand: 3, lateCallBand: 3, noiseToleranceBand: 3,
  commonCleaningBand: 3, bathroomCleaningBand: 3, dishwashingBand: 3,
  guestFrequencyBand: 3, ageGapToleranceBand: 3, interactionBand: 3,
  cookingBand: 3, deliveryBand: 3, climateBand: 3,
  roomType: 'private_room', shareCount: 2, preferredGender: 'any', ageBand: 'any',
};

export function embed() {
  const p = new URLSearchParams(location.search);
  const saved = JSON.parse(sessionStorage.getItem('cm-context') || 'null');
  const context = { operatorId: p.get('operator_id') || saved?.operatorId || 'operator-a', roomId: p.get('room_id') || saved?.roomId || '101', funnelId: saved?.funnelId || crypto.randomUUID() };
  sessionStorage.setItem('cm-context', JSON.stringify(context));
  return context;
}

export function event(context, step, metadata = {}) {
  return fetch(API + '/api/v1/funnel/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...context, step, metadata }) }).catch(() => {});
}

export async function responseJson(response) {
  if (response.status === 401) { sessionStorage.removeItem('cm-auth'); window.dispatchEvent(new Event('cm-auth-expired')); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || 'API_REQUEST_FAILED');
  return data;
}
