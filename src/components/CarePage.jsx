import { React, useEffect, useState, API, responseJson, BadgeCheck, ArrowRight, Check, Clock3, FileCheck2, MessageCircle, ShieldCheck } from '../shared.js';
import MediationSheet from './MediationSheet.jsx';
import './presence.css';

const presenceOptions = [
  { value: 'available', icon: '☀️', label: '일반 상태', description: '평소처럼 지내고 있어요.' },
  { value: 'sleeping', icon: '🌙', label: '수면 중', description: '조용한 배려가 필요해요.' },
  { value: 'focus', icon: '🎧', label: '집중 모드', description: '소음에 조금만 주의해 주세요.' },
];

export default function CarePage({ roomId, matchId, auth, back }) {
  const [start] = useState(() => sessionStorage.getItem('cm-care-start') || new Date().toISOString());
  const [now, setNow] = useState(Date.now());
  const [rules, setRules] = useState(false);
  const [sos, setSos] = useState(false);
  const [notice, setNotice] = useState('');
  const [presence, setPresence] = useState([]);
  const [presenceOpen, setPresenceOpen] = useState(false);
  const [presenceSaving, setPresenceSaving] = useState(false);
  const headers = { Authorization: `Bearer ${auth?.accessToken}`, 'Content-Type': 'application/json' };

  const loadPresence = async () => {
    if (!matchId || !auth?.accessToken) return;
    try {
      const data = await responseJson(await fetch(`${API}/api/v1/matches/${matchId}/presence`, { headers }));
      setPresence(data.statuses || []);
    } catch { setPresence([]); }
  };
  useEffect(() => { sessionStorage.setItem('cm-care-start', start); const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, [start]);
  useEffect(() => { loadPresence(); const timer = setInterval(loadPresence, 30000); return () => clearInterval(timer); }, [matchId, auth?.accessToken]);

  const setPresenceStatus = async (status) => {
    if (!matchId || presenceSaving) return;
    setPresenceSaving(true);
    try {
      await responseJson(await fetch(`${API}/api/v1/matches/${matchId}/presence/me`, { method: 'PUT', headers, body: JSON.stringify({ status }) }));
      await loadPresence();
      setPresenceOpen(false);
    } catch { setNotice('상태를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
    finally { setPresenceSaving(false); }
  };

  const elapsed = Math.min(30, Math.max(0, Math.floor((now - Date.parse(start)) / 86400000)));
  const left = Math.max(0, 30 - elapsed);
  const progress = Math.round(elapsed / 30 * 100);
  const mine = presence.find((item) => item.isSelf)?.status || 'available';
  const roommate = presence.find((item) => !item.isSelf)?.status || 'available';
  const ownOption = presenceOptions.find((item) => item.value === mine);
  const roommateOption = presenceOptions.find((item) => item.value === roommate);

  return <section className="page-pad inner-page care-page">
    <div className="care-header"><div><div className="care-page-badge"><ShieldCheck size={17}/>30-DAY CARE</div><h2>Reservation confirmed.<br/>Care has started.</h2><p className="muted">Room {roomId || '101'} - safer adaptation together.</p></div><div className="care-celebrate"><Check size={24}/></div></div>
    <div className="care-dday-card"><div className="care-dday-row"><div><span>Care progress</span><strong>Day {Math.min(30, elapsed + 1)}</strong></div><b>{left ? `D-${left}` : 'Complete'}</b></div><div className="care-progress"><i style={{ width: `${progress}%` }}/></div><p>We support living adaptation and conflict mediation for 30 days.</p></div>
    <div className="care-timeline"><div className="care-timeline-item active"><span>1</span><div><strong>Move-in and agreement complete</strong><p>Rules and match conditions are saved.</p></div><Check size={17}/></div><div className="care-timeline-item active"><span>2</span><div><strong>30-day care period</strong><p>{left ? 'Care is currently active.' : 'Care period complete.'}</p></div><Clock3 size={17}/></div><div className="care-timeline-item"><span>3</span><div><strong>Final satisfaction check-in</strong><p>We will ask about satisfaction and conflicts.</p></div><BadgeCheck size={17}/></div></div>
    <div className="care-section-title"><span>QUICK ACTIONS</span><small>Open help when you need it</small></div><div className="care-action-grid"><button className="care-action-card" onClick={() => setRules(true)}><span className="care-action-icon purple"><FileCheck2 size={21}/></span><strong>View living agreement</strong><small>Three shared rules</small><ArrowRight size={16}/></button><button className="care-action-card" onClick={() => setSos(true)}><span className="care-action-icon red"><ShieldCheck size={21}/></span><strong>Request mediation</strong><small>You do not have to solve it alone</small><ArrowRight size={16}/></button></div>
    {notice && <p className="care-notice"><ShieldCheck size={14}/>{notice}</p>}<div className="care-support-card"><MessageCircle size={21}/><div><strong>You do not have to solve it alone.</strong><p>Choose an objective reason and the operator will contact you privately.</p></div></div>
    {presenceOpen && <div className="care-overlay" onClick={() => setPresenceOpen(false)}><div className="care-modal presence-modal" onClick={(event) => event.stopPropagation()}><div className="care-modal-head"><div><span className="section-kicker">ROOMMATE STATUS</span><h3>지금의 상태를 알려주세요</h3></div><button onClick={() => setPresenceOpen(false)}>Close</button></div><p className="sheet-copy">상태는 매칭된 룸메이트에게만 보이며, 8시간 뒤 자동으로 해제됩니다.</p><div className="presence-options">{presenceOptions.map((option) => <button key={option.value} type="button" disabled={presenceSaving} className={mine === option.value ? 'selected' : ''} onClick={() => setPresenceStatus(option.value)}><b>{option.icon}</b><span><strong>{option.label}</strong><small>{option.description}</small></span>{mine === option.value && <Check size={17}/>}</button>)}</div></div></div>}
    {rules && <div className="care-overlay" onClick={() => setRules(false)}><div className="care-modal" onClick={(event) => event.stopPropagation()}><div className="care-modal-head"><div><span className="section-kicker">QUICK RULEBOOK</span><h3>Our living agreement</h3></div><button onClick={() => setRules(false)}>Close</button></div><div className="care-rule"><Check size={17}/><div><strong>Quiet hours</strong><span>Keep shared areas quiet after 23:00.</span></div></div><div className="care-rule"><Check size={17}/><div><strong>Cleaning</strong><span>Clean shared areas at least weekly.</span></div></div><div className="care-rule"><Check size={17}/><div><strong>Guests</strong><span>Notify each other before visits.</span></div></div></div></div>}
    {sos && <MediationSheet roomId={roomId} close={() => setSos(false)} onDone={(message) => { setNotice(message); setSos(false); }}/>}</section>;
}
