export { default as React, useEffect, useRef, useState, useMemo } from 'react';
export { io } from 'socket.io-client';
export { ArrowRight, BadgeCheck, BarChart3, CalendarDays, Camera, HeartHandshake, Check, ChevronLeft, ChevronRight, Clock3, CreditCard, FileCheck2, Home, LockKeyhole, LogOut, MessageCircle, Moon, Plus, Send, ShieldCheck, Sparkles, Sun, Trash2, UserRound, UsersRound } from 'lucide-react';

export const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
export const survey = [
  ['lateReturnBand', '자정 이후 귀가 빈도', ['0회', '1~2회', '3~5회', '6회 이상']],
  ['sleepTimeBand', '보통 잠드는 시간', ['22시 이전', '22~24시', '00~02시', '02시 이후']],
  ['wakeTimeBand', '보통 일어나는 시간', ['06시 이전', '06~08시', '08~10시', '10시 이후']],
  ['deliveryWasteBand', '주간 배달 음식 이용 횟수', ['0회', '1~2회', '3~4회', '5회 이상']],
  ['cleaningBand', '공용 공간 청소 빈도', ['주 1회 이상', '월 1회', '거의 안 함', '상황에 따라']],
  ['noiseBand', '늦은 시간 소음 빈도', ['거의 없음', '가끔 있음', '주 1~2회', '자주 있음']],
  ['guestFrequencyBand', '주간 지인 초대 횟수', ['0회', '1회', '2~3회', '4회 이상']],
  ['cookingBand', '주간 직접 요리 횟수', ['0회', '1~2회', '3~5회', '6회 이상']],
  ['commonSpaceBand', '공용 공간 사용 후 정리', ['항상 정리', '대부분 정리', '가끔 미룸', '자주 미룸']],
];
export const initialAnswers = { lateReturnBand: 1, sleepTimeBand: 1, wakeTimeBand: 1, deliveryWasteBand: 1, cleaningBand: 1, noiseBand: 1, guestFrequencyBand: 1, cookingBand: 1, commonSpaceBand: 1, roomType: 'private_room', shareCount: 2, preferredGender: 'any', ageBand: 'any' };
export function embed() { const p = new URLSearchParams(location.search), saved = JSON.parse(sessionStorage.getItem('cm-context') || 'null'), context = { operatorId: p.get('operator_id') || saved?.operatorId || 'operator-a', roomId: p.get('room_id') || saved?.roomId || '101', funnelId: saved?.funnelId || crypto.randomUUID() }; sessionStorage.setItem('cm-context', JSON.stringify(context)); return context; }
export function event(context, step, metadata = {}) { return fetch(API + '/api/v1/funnel/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...context, step, metadata }) }).catch(() => {}); }
export async function responseJson(response) { if (response.status === 401) { sessionStorage.removeItem('cm-auth'); window.dispatchEvent(new Event('cm-auth-expired')); } const data = await response.json().catch(() => ({})); if (!response.ok) throw Error(data.error || 'API_REQUEST_FAILED'); return data; }
