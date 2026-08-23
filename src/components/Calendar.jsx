import { React, useEffect, useMemo, useState, CalendarDays, Check, Trash2, ChevronLeft, ChevronRight, Plus } from '../shared.js';

const STORAGE_KEY = 'cm-shared-calendar-v1';
const pad = value => String(value).padStart(2, '0');
const keyOf = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const formatDate = key => { const [, month, day] = key.split('-').map(Number); return `${month}월 ${day}일`; };
const readEvents = () => { try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; } };
const makeId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

function monthCells(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
}

function EventList({ selected, events, manage, removeEvent }) {
  const selectedEvents = events[selected] || [];
  return <div className="calendar-selected"><div className="calendar-selected-title"><strong>{formatDate(selected)} 일정</strong><span>{selectedEvents.length}개</span></div>{selectedEvents.length ? selectedEvents.map(item => <div className="calendar-event" key={item.id}><span><Check size={13}/></span><div><strong>{item.title}</strong><small>{[item.time, item.place].filter(Boolean).join(' · ') || '시간·장소 미정'}</small></div>{manage && <button type="button" onClick={() => removeEvent(item.id)} aria-label="일정 삭제"><Trash2 size={14}/></button>}</div>) : <p className="calendar-empty">등록된 일정이 없습니다.</p>}</div>;
}

export function CalendarWidget({ manage = false }) {
  const [today, setToday] = useState(() => new Date());
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState(() => readEvents());
  const [selected, setSelected] = useState(() => keyOf(new Date()));
  const [title, setTitle] = useState(''); const [time, setTime] = useState(''); const [place, setPlace] = useState('');
  const weekDays = useMemo(() => { const start = new Date(today); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); return Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; }); }, [today]);
  const cells = useMemo(() => monthCells(cursor), [cursor]);
  useEffect(() => { const timer = setInterval(() => setToday(new Date()), 60_000); const sync = () => setEvents(readEvents()); window.addEventListener('storage', sync); return () => { clearInterval(timer); window.removeEventListener('storage', sync); }; }, []);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); }, [events]);
  const addEvent = event => { event.preventDefault(); if (!title.trim()) return; const item = { id: makeId(), title: title.trim().slice(0, 60), time: time.trim().slice(0, 20), place: place.trim().slice(0, 60) }; setEvents(current => ({ ...current, [selected]: [...(current[selected] || []), item] })); setTitle(''); setTime(''); setPlace(''); };
  const removeEvent = id => setEvents(current => ({ ...current, [selected]: (current[selected] || []).filter(item => item.id !== id) }));
  const selectToday = () => { const now = new Date(); setToday(now); setCursor(now); setSelected(keyOf(now)); };
  const shiftMonth = amount => { const next = new Date(cursor.getFullYear(), cursor.getMonth() + amount, 1); setCursor(next); setSelected(keyOf(next)); };
  if (!manage) return <section className="calendar-panel calendar-compact"><div className="calendar-panel-head"><div><span className="section-kicker">공용 일정</span><strong>이번 주 일정</strong></div><small>{formatDate(selected)}</small></div><div className="calendar-days">{weekDays.map((date, index) => { const key = keyOf(date); return <button type="button" key={key} className={`${key === selected ? 'selected ' : ''}${key === keyOf(today) ? 'today' : ''}`} onClick={() => setSelected(key)}><small>{['월','화','수','목','금','토','일'][index]}</small><b>{date.getDate()}</b>{events[key]?.length ? <i>{events[key].length}</i> : null}</button>; })}</div><EventList selected={selected} events={events} manage={false} removeEvent={removeEvent}/></section>;
  return <section className="calendar-panel calendar-manage"><div className="calendar-month-toolbar"><button type="button" onClick={() => shiftMonth(-1)} aria-label="이전 달"><ChevronLeft size={19}/></button><strong>{cursor.getFullYear()}년 {cursor.getMonth() + 1}월</strong><button type="button" onClick={() => shiftMonth(1)} aria-label="다음 달"><ChevronRight size={19}/></button></div><button className="calendar-today-button" type="button" onClick={selectToday}>오늘</button><div className="calendar-month-weekdays">{['일','월','화','수','목','금','토'].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-month-grid">{cells.map(date => { const key = keyOf(date); const outside = date.getMonth() !== cursor.getMonth(); return <button type="button" key={key} className={`${outside ? 'outside ' : ''}${key === selected ? 'selected ' : ''}${key === keyOf(today) ? 'today' : ''}`} onClick={() => setSelected(key)}><b>{date.getDate()}</b>{events[key]?.length ? <i>{events[key].length}</i> : null}</button>; })}</div><EventList selected={selected} events={events} manage removeEvent={removeEvent}/><form className="calendar-form" onSubmit={addEvent}><input value={title} onChange={event => setTitle(event.target.value)} placeholder="일정 이름 (예: 장보기)" maxLength={60}/><div><input value={time} onChange={event => setTime(event.target.value)} placeholder="시간" maxLength={20}/><input value={place} onChange={event => setPlace(event.target.value)} placeholder="장소" maxLength={60}/></div><button className="primary-button" type="submit" disabled={!title.trim()}><Plus size={16}/>일정 등록</button></form></section>;
}

export default function CalendarPage({ back }) { return <section className="page-pad inner-page calendar-page"><button className="back-button" onClick={back || (() => window.history.back())}>‹ 홈</button><CalendarWidget manage/></section>; }
