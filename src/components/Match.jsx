import { React, BadgeCheck, Check, ChevronLeft, LockKeyhole, MessageCircle, Sparkles, UserRound, ArrowRight, Home, UsersRound } from '../shared.js';

function Reason({ reason, index }) {
  return <div key={reason?.key || index}>
    <span><Sparkles size={17} /></span>
    <p><strong>{reason?.label || '생활 패턴'}</strong>{reason?.message || '생활 기준이 잘 맞아요.'}</p>
    <Check size={16} />
  </div>;
}

export default function Match({ match, back, start, busy, presentationMode = false, liveRevealed = true, chatEnabled = false }) {
  if (presentationMode && !liveRevealed) {
    return <section className="page-pad inner-page match-live-waiting">
      <div className="match-live-waiting-icon"><UsersRound size={26} /></div>
      <span className="section-kicker">LIVE MATCHING</span>
      <h2>설문이 저장되었어요.</h2>
      <p className="muted">발표자가 매칭 결과를 공개하면<br />익명의 룸메이트와 궁합도를 확인할 수 있어요.</p>
      <div className="match-live-waiting-card"><span>1</span><div><strong>참여자 데이터 분석 완료</strong><small>주거 형태와 생활 패턴을 함께 비교하고 있어요.</small></div><Check size={17} /></div>
      <p className="tiny-note"><LockKeyhole size={12} /> 개인정보는 공개되지 않고 익명 궁합도만 표시됩니다.</p>
    </section>;
  }

  if (match?.analysis) {
    return <section className="page-pad inner-page match-analysis">
      <div className="match-analysis-orbit"><div><Sparkles size={26} /></div></div>
      <span className="section-kicker">EXPLAINABLE MATCH</span>
      <h2>생활 패턴을 비교하고 있어요.</h2>
      <p className="muted">주거 형태와 실제 생활 행동을 기준으로<br />가장 잘 맞는 룸메이트를 찾고 있어요.</p>
    </section>;
  }

  const status = String(match?.status || '').toLowerCase();
  const pending = status === 'requested';
  const accepted = Boolean(match?.accepted || ['accepted', 'confirmed'].includes(status));
  const reasons = match?.bestReasons?.length ? match.bestReasons : match?.breakdown?.slice(0, 5) || [];
  const housingReasons = reasons.filter((reason) => ['roomType', 'shareCount'].includes(reason?.key));
  const displayReasons = housingReasons.length ? reasons : [...reasons, ...(match?.breakdown || []).filter((reason) => ['roomType', 'shareCount'].includes(reason?.key))].slice(0, 5);

  return <section className={`page-pad inner-page ${presentationMode ? 'match-presentation-result' : ''}`}>
    {!presentationMode && <button className="back-button" onClick={back}><ChevronLeft size={19} /> 설문 다시 보기</button>}
    {presentationMode && <div className="match-live-label"><span className="section-kicker">EXPLAINABLE MATCH · TOP RECOMMENDATION</span><span><Home size={14} /> 라이브 매칭 결과</span></div>}
    <h2>나와 가장 잘 맞는<br />룸메이트를 찾았어요.</h2>
    <p className="muted">입력한 생활 행동과 주거 형태, 운영사 가중치로 전체 후보를 비교했어요.</p>

    <div className="match-score">
      <div className="score-ring"><strong>{match?.score ?? match?.compatibility ?? '--'}<small>%</small></strong><span>생활 궁합</span></div>
      <div><strong>가장 잘 맞는 1순위 룸메이트</strong><p>{match ? `${match.totalCandidates || 0}명 중 1순위` : '설문을 완료하면 비교할 수 있어요.'}</p></div>
    </div>

    <div className="profile-card"><div className="profile-top"><div className="profile-avatar"><UserRound size={30} /></div><div><h3>익명 입주 예정자 <BadgeCheck size={16} /></h3><p>개인정보 비공개 · 본인·소속 확인 완료</p></div><span className="verified-pill"><Check size={13} /> 확인 완료</span></div></div>
    <div className="reason-list">{displayReasons.map((reason, index) => <Reason reason={reason} index={index} />)}</div>

    {presentationMode ? (chatEnabled ? <button className="primary-button" disabled={busy || !match} onClick={start}><MessageCircle size={18} />{busy ? '채팅방 준비 중...' : '30분 익명 채팅방 입장'}<ArrowRight size={18} /></button> : <div className="match-live-chat-locked"><MessageCircle size={18} /><span>발표자가 채팅방을 활성화하면<br />이곳에 입장 버튼이 나타납니다.</span></div>) : pending ? <div className="match-pending-state"><span className="match-pending-icon">⌛</span><div><strong>매칭 요청을 보냈어요.</strong><span>상대방이 수락하면 30분 안심 채팅방이 열려요.</span></div></div> : accepted ? <div className="match-accepted-state"><span className="match-accepted-icon"><Check size={18} /></span><div><strong>매칭이 수락되었어요.</strong><span>채팅 탭에서 30분 익명 대화를 이어갈 수 있어요.</span></div></div> : <button className="primary-button" disabled={busy || !match} onClick={start}><MessageCircle size={18} />{busy ? '채팅방 준비 중...' : '이 룸메이트에게 매칭 요청'}<ArrowRight size={18} /></button>}
    <p className="tiny-note"><LockKeyhole size={12} /> 안전한 매칭을 위해 한 번에 한 명의 룸메이트와만 대화할 수 있어요.</p>
  </section>;
}
