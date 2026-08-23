import { React, ArrowRight, Check, ShieldCheck, UsersRound } from '../shared.js';
import RoomLoungeMap from './RoomLoungeMap.jsx';
import ShoppingWidgets from './ShoppingWidgets.jsx';
import { CalendarWidget } from './Calendar.jsx';
import './lounge.css';

const week = ['월', '화', '수', '목', '금', '토', '일'];
const STATUS_OPTIONS = [
  { value: 'ONLINE', label: '대화 가능', icon: '🟢', tone: 'online' },
  { value: 'AWAY', label: '외출 중', icon: '🏃', tone: 'away' },
  { value: 'SLEEPING', label: '수면 중', icon: '💤', tone: 'sleeping' },
  { value: 'DO_NOT_DISTURB', label: '방해금지', icon: '⛔', tone: 'do-not-disturb' },
];
const fallbackRoommates = [{ id: 'minji', name: '민지', status: 'ONLINE', isMe: true }, { id: 'jiyeon', name: '지연', status: 'AWAY' }];

function loadRoommates(roommates) {
  const base = Array.isArray(roommates) && roommates.length ? roommates : fallbackRoommates;
  if (typeof window === 'undefined') return base;
  try {
    const saved = JSON.parse(window.localStorage.getItem('cm-lounge-roommates-v1') || 'null');
    return Array.isArray(saved) ? base.map(person => ({ ...person, ...(saved.find(item => item.id === person.id) || {}) })) : base;
  } catch { return base; }
}

export default function HomeLounge({ context = {}, openMatching, roommates }) {
  const resident = typeof window !== 'undefined' && Boolean(sessionStorage.getItem('cm-care-start'));
  const [interaction, setInteraction] = React.useState(null);
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [roommateState, setRoommateState] = React.useState(() => loadRoommates(roommates));
  React.useEffect(() => { try { window.localStorage.setItem('cm-lounge-roommates-v1', JSON.stringify(roommateState)); } catch { /* optional */ } }, [roommateState]);

  if (!resident) return <section className="page-pad lounge-home"><div className="lounge-greeting"><div><h1>생활 프로필이<br/><em>완료되었어요</em></h1><p className="lead">이제 나와 잘 맞는 룸메이트를 찾아볼까요?</p></div></div><section className="lounge-welcome-card"><div className="lounge-welcome-icon"><Check size={21}/></div><div><strong>행동 패턴 9개 항목 저장 완료</strong><span>검증된 생활 데이터로 안전하게 매칭해요.</span></div></section><button className="lounge-action primary" onClick={openMatching}><UsersRound size={22}/><strong>룸메이트 매칭</strong><small>내 생활과 잘 맞는 사람 찾기</small><ArrowRight size={17}/></button></section>;

  const myId = roommateState.find(person => person.isMe)?.id || roommateState[0]?.id || 'minji';
  const me = roommateState.find(person => person.id === myId) || fallbackRoommates[0];
  const selectedStatus = STATUS_OPTIONS.find(option => option.value === me.status) || STATUS_OPTIONS[0];
  const updateStatus = value => { setRoommateState(current => current.map(person => person.id === myId ? { ...person, status: value } : person)); setStatusOpen(false); };
  return <section className="page-pad lounge-home resident-lounge">
    <div className="lounge-greeting"><div><h1>우리 집<br/><em>안심 라운지</em></h1><p className="lead">객실 {context.roomId || '101'} · 함께 사는 생활을 편하게 관리해요.</p></div></div>
    <CalendarWidget />
    <section className="lounge-quick-status"><div className="quick-status-heading"><strong>내 상태</strong><button type="button" onClick={() => setStatusOpen(open => !open)}>{selectedStatus.icon} {selectedStatus.label} <span>⌄</span></button></div>{statusOpen && <div className="quick-status-options">{STATUS_OPTIONS.map(option => <button type="button" key={option.value} className={`quick-status-option tone-${option.tone}${me.status === option.value ? ' active' : ''}`} onClick={() => updateStatus(option.value)}><span>{option.icon}</span><small>{option.label}</small></button>)}</div>}</section>
    <section className="lounge-widget-grid"><article className="lounge-widget chore-widget"><small>이번 주 청소 당번</small><strong>민지</strong><span>주방 · 수요일</span></article><article className="lounge-widget expense-widget"><small>미정산 공용 비용</small><strong>12,000원</strong><span>휴지·세제 1/N</span></article></section>
    <ShoppingWidgets />
    <section className="house-game-card"><RoomLoungeMap roommates={roommateState} onInteract={setInteraction}/>{interaction && <InteractionPanel data={interaction} onClose={() => setInteraction(null)}/>}</section>
  </section>;
}

function InteractionPanel({ data, onClose }) { return <div className="rpg-interaction character-status-panel"><button onClick={onClose} aria-label="닫기">×</button><strong>{data.name}</strong><p className={`roommate-status status-${data.statusKey || 'online'}`}><span>{data.statusIcon || '🟢'}</span>{data.statusLabel || data.message || '대화 가능'}</p></div>; }
