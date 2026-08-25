import { React, BadgeCheck, Check, ChevronLeft, LockKeyhole, MessageCircle, Sparkles, UserRound, ArrowRight } from '../shared.js';

export default function Match({ match, back, start, busy }) {
  const status = String(match?.status || '').toLowerCase();
  const pending = status === 'requested';
  const accepted = Boolean(match?.accepted || ['accepted', 'confirmed'].includes(status));
  const reasons = match?.bestReasons?.length ? match.bestReasons : match?.breakdown?.slice(0, 3) || [];

  return <section className="page-pad inner-page">
    <button className="back-button" onClick={back}><ChevronLeft size={19} /> 설문 다시 보기</button>
    <h2>나와 가장 잘 맞는<br />룸메이트를 찾았어요.</h2>
    <p className="muted">입력한 생활 행동과 운영사 가중치로 전체 후보를 비교했어요.</p>

    <div className="match-score">
      <div className="score-ring"><strong>{match?.score ?? '--'}<small>%</small></strong><span>생활 궁합</span></div>
      <div><strong>가장 잘 맞는 1순위 룸메이트</strong><p>{match ? `${match.totalCandidates || 0}명 중 1순위` : '설문을 완료하면 비교할 수 있어요.'}</p></div>
    </div>

    <div className="profile-card"><div className="profile-top"><div className="profile-avatar"><UserRound size={30} /></div><div><h3>익명 입주 예정자 <BadgeCheck size={16} /></h3><p>개인정보 비공개 · 본인·소속 확인 완료</p></div><span className="verified-pill"><Check size={13} /> 확인 완료</span></div></div>
    <div className="reason-list">{reasons.map((reason, index) => <div key={reason.key || index}><span><Sparkles size={17} /></span><p><strong>{reason.label || '생활 패턴'}</strong>{reason.message || '생활 기준이 거의 같아요.'}</p><Check size={16} /></div>)}</div>

    {pending ? <div className="match-pending-state"><span className="match-pending-icon">⌛</span><div><strong>매칭 요청을 보냈어요.</strong><span>상대방이 수락하면 30분 안심 채팅방이 열려요.</span></div></div> : accepted ? <div className="match-accepted-state"><span className="match-accepted-icon"><Check size={18} /></span><div><strong>매칭이 수락되었어요.</strong><span>채팅 탭에서 30분 익명 대화를 이어갈 수 있어요.</span></div></div> : <button className="primary-button" disabled={busy || !match} onClick={start}><MessageCircle size={18} />{busy ? '채팅방 준비 중...' : '이 룸메이트에게 매칭 요청'}<ArrowRight size={18} /></button>}
    <p className="tiny-note"><LockKeyhole size={12} /> 안전한 매칭을 위해 한 번에 한 명의 룸메이트와만 대화할 수 있어요.</p>
  </section>;
}
