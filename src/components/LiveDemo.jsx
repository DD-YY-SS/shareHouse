import { React, useEffect, useState, API, BarChart3, Check, Clock3, HeartHandshake, UsersRound } from '../shared.js';
import QRCode from 'qrcode';
import './live-demo.css';

const initialState = { target: 30, participants: 0, surveyCompleted: 0, matched: 0, recentParticipants: [], bestCouple: null, bestCoupleRevealed: false, lastActivityAt: null, matchRevealed: false, chatEnabled: false, careReportDemoStarted: false, careReportRevealed: false, careReport: null, careReportReceiver: 'idle' };

export default function LiveDemo() {
  const [state, setState] = useState(initialState);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [controlBusy, setControlBusy] = useState('');
  const [controlError, setControlError] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [liveSessionId] = useState(() => {
    const storageKey = 'checkmate-live-session-id';
    const saved = window.sessionStorage.getItem(storageKey);
    if (saved) return saved;
    const created = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(storageKey, created);
    return created;
  });
  const participantUrl = `${window.location.origin}/?demo=live&session=${encodeURIComponent(liveSessionId)}`;

  const load = async () => {
    try {
      const response = await fetch(`${API}/api/v1/live-demo/state`, { cache: 'no-store' });
      if (response.ok) { setState({ ...initialState, ...(await response.json()) }); setUpdatedAt(new Date()); }
    } catch { /* 발표자 화면은 API가 잠시 지연되어도 유지합니다. */ }
  };

  useEffect(() => { QRCode.toDataURL(participantUrl, { width: 720, margin: 2, errorCorrectionLevel: 'H', color: { dark: '#14213d', light: '#ffffff' } }).then(setQrDataUrl).catch(() => setQrDataUrl('')); }, [participantUrl]);
  useEffect(() => { load(); const timer = setInterval(load, 2000); return () => clearInterval(timer); }, []);

  const control = async (action) => {
    setControlBusy(action); setControlError('');
    const paths = { reveal: 'matching/reveal', chat: 'chat/activate', bestCouple: 'best-couple/reveal', careStart: 'care-report/start', careReveal: 'care-report/reveal', reset: 'reset' };
    try {
      const response = await fetch(`${API}/api/v1/live-demo/${paths[action]}`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || '라이브 상태를 변경하지 못했어요.');
      setState({ ...initialState, ...data });
    } catch (error) { setControlError(error.message || '라이브 상태를 변경하지 못했어요.'); }
    finally { setControlBusy(''); }
  };

  const uploadCareReport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setControlBusy('careUpload'); setControlError('');
    try {
      const parsed = JSON.parse(await file.text());
      const samples = Array.isArray(parsed) ? parsed : parsed.samples;
      if (!Array.isArray(samples)) throw new Error('CARE_REPORT_SAMPLES_REQUIRED');
      const response = await fetch(`${API}/api/v1/live-demo/care-report/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ samples }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || 'CARE_REPORT_UPLOAD_FAILED');
      setState({ ...initialState, ...data });
    } catch (error) {
      setControlError(error.message === 'CARE_REPORT_JSON_INVALID' ? 'JSON 형식을 읽지 못했어요.' : `리포트 업로드 실패: ${error.message}`);
    } finally { setControlBusy(''); }
  };

  const participantProgress = Math.min(100, Math.round((state.participants / Math.max(1, state.target)) * 100));
  const surveyProgress = state.participants ? Math.round((state.surveyCompleted / state.participants) * 100) : 0;
  const matchProgress = state.surveyCompleted ? Math.round((state.matched / state.surveyCompleted) * 100) : 0;

  return <main className="live-presenter-shell">
    {controlError && <div className="live-control-error" role="alert">{controlError}</div>}
    <header className="live-presenter-header">
      <div className="live-brand"><img src="/checkmate-logo.svg" alt="CheckMate 로고" /><div><strong>CheckMate</strong><span>안심 매칭 라이브 시연</span></div></div>
      <div className="live-url-box"><small>참가자 접속 주소</small><strong>{window.location.origin}/?demo=live</strong></div>
      <span className="live-status"><i /> LIVE</span>
    </header>

    <section className="live-hero"><div><span className="section-kicker">OFFLINE LIVE DEMO</span><h1>오늘 우리 공간에서<br /><em>가장 잘 맞는 룸메이트</em>를 찾아요.</h1><p>참가자가 접속하고 설문을 완료하는 과정을<br />발표자 화면에서 실시간으로 확인해 보세요.</p></div><button type="button" className={`live-qr-placeholder ${qrDataUrl ? 'has-qr' : ''}`} onClick={() => setQrOpen(true)} aria-label="참가자 접속 QR 크게 보기"><span>QR</span><small>참가자 접속</small></button></section>

    <section className="live-control-bar"><div><strong>발표자 컨트롤</strong><small>버튼을 누르면 모든 참가자 화면에 즉시 반영됩니다.</small></div><div><button className={state.matchRevealed ? 'control-done' : ''} disabled={Boolean(controlBusy) || state.matchRevealed} onClick={() => control('reveal')}>{controlBusy === 'reveal' ? '생성 중...' : state.matchRevealed ? '매칭 결과 공개됨' : '매칭 결과 공개'}</button><button className={state.chatEnabled ? 'control-done' : ''} disabled={Boolean(controlBusy) || !state.matchRevealed || state.chatEnabled} onClick={() => control('chat')}>{controlBusy === 'chat' ? '활성화 중...' : state.chatEnabled ? '채팅방 활성화됨' : '채팅방 활성화'}</button><button className={state.bestCoupleRevealed ? 'control-done' : ''} disabled={Boolean(controlBusy) || !state.chatEnabled || state.bestCoupleRevealed} onClick={() => control('bestCouple')}>{controlBusy === 'bestCouple' ? '베스트 커플 계산 중...' : state.bestCoupleRevealed ? '베스트 커플 공개됨' : '베스트 커플 확인하기'}</button><button className={state.careReportDemoStarted ? 'control-done' : ''} disabled={Boolean(controlBusy) || !state.bestCoupleRevealed || state.careReportDemoStarted} onClick={() => control('careStart')}>{controlBusy === 'careStart' ? '모델 시작 중...' : state.careReportDemoStarted ? '모델 시연 진행 중' : '모델 시연 시작'}</button>{state.careReportDemoStarted && <button className={state.careReportRevealed ? 'control-done' : 'care-report-control'} disabled={Boolean(controlBusy) || state.careReportRevealed || !state.careReport} onClick={() => control('careReveal')}>{controlBusy === 'careReveal' ? '보고서 준비 중...' : state.careReportRevealed ? '30일 보고서 공개됨' : state.careReport ? '시연 종료 · 보고서 공개' : 'JSON 업로드 후 공개'}</button>}<button className="control-reset" disabled={Boolean(controlBusy)} onClick={() => control('reset')}>초기화</button></div></section>

    {state.careReportDemoStarted && <section className="live-care-demo-status"><strong>30일 케어 모델 시연</strong><span>{state.careReportReceiver === 'starting' ? 'ESP32 수신기를 시작하고 있어요.' : state.careReportReceiver === 'file_only' ? '저장된 JSON 파일을 기준으로 시연합니다.' : state.careReportReceiver === 'uploaded' ? '최신 JSON 기록을 업로드했어요. 이제 보고서를 공개하세요.' : state.careReportRevealed ? '보고서가 참가자 화면에 공개됐어요.' : '청소·소음 데이터를 수집한 뒤 보고서를 공개하세요.'}</span></section>}
    {state.careReportDemoStarted && !state.careReportRevealed && <section className="live-care-upload-card"><div><strong>배포 시연용 최신 데이터 반영</strong><small>ESP32가 로컬 PC에 저장한 sharehouse_results.json을 선택해 주세요.</small></div><label className="live-upload-button"><input type="file" accept="application/json,.json" onChange={uploadCareReport} disabled={Boolean(controlBusy)} />{controlBusy === 'careUpload' ? '업로드 중...' : 'JSON 업로드'}</label></section>}

    <section className="live-stage-grid"><div className="live-live-card"><div className="live-card-title"><div><UsersRound size={20} /><strong>실시간 참여 현황</strong></div><small>2초마다 갱신</small></div><div className="live-big-count"><strong>{state.participants}</strong><span>/ {state.target}명</span></div><div className="live-progress"><i style={{ width: `${participantProgress}%` }} /></div><p>현재 접속 중인 참가자</p><div className="live-stats-row"><div><strong>{state.surveyCompleted}</strong><span>설문 완료</span><small>{surveyProgress}%</small></div><div><strong>{state.matched}</strong><span>매칭 분석</span><small>{matchProgress}%</small></div><div><strong>{updatedAt ? updatedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</strong><span>마지막 갱신</span><small>LIVE</small></div></div></div><div className="live-funnel-card"><div className="live-card-title"><div><BarChart3 size={20} /><strong>시연 진행 단계</strong></div><small>순서대로 진행</small></div><div className="live-step done"><span>1</span><div><strong>접속 및 프로필</strong><small>참가자 기본 정보 입력</small></div><Check size={17} /></div><div className={`live-step ${state.surveyCompleted ? 'done' : 'active'}`}><span>2</span><div><strong>생활 패턴 설문</strong><small>{state.surveyCompleted}명 완료</small></div>{state.surveyCompleted ? <Check size={17} /> : <i />}</div><div className={`live-step ${state.matchRevealed ? 'done' : 'active'}`}><span>3</span><div><strong>룰베이스 매칭</strong><small>{state.matchRevealed ? '결과 공개 완료' : '발표자의 공개를 기다리는 중'}</small></div>{state.matchRevealed ? <Check size={17} /> : <i />}</div><div className={`live-step ${state.chatEnabled ? 'done' : ''}`}><span>4</span><div><strong>30분 안심 채팅</strong><small>{state.chatEnabled ? '참가자 입장 가능' : '발표자의 활성화를 기다리는 중'}</small></div>{state.chatEnabled ? <Check size={17} /> : <Clock3 size={17} />}</div><div className={`live-step ${state.careReportRevealed ? 'done' : ''}`}><span>5</span><div><strong>30일 케어 보고서</strong><small>{state.careReportRevealed ? '참가자 화면에 공개 완료' : 'ESP32 데이터 시연 예정'}</small></div>{state.careReportRevealed ? <Check size={17} /> : <Clock3 size={17} />}</div></div></section>

    {state.bestCoupleRevealed && <section className="live-best-couple"><div className="live-card-title"><div><HeartHandshake size={20} /><strong>오늘의 베스트 커플</strong></div><small>전체 참가자 중 최고 궁합</small></div>{state.bestCouple ? <><div className="best-couple-people">{state.bestCouple.participants.map((person) => <div className="best-couple-person" key={person.id}>{person.profilePhotoData ? <img src={person.profilePhotoData} alt="" /> : <span className="live-avatar">{String(person.pseudonym || '?').slice(0, 1)}</span>}<strong>{person.pseudonym || '익명 참가자'}</strong><small>{person.age ? `${person.age}세` : '나이 비공개'}{person.mbti ? ` · ${person.mbti}` : ''}</small></div>)}</div><div className="best-couple-score"><strong>{state.bestCouple.score}%</strong><span>생활 궁합</span></div></> : <p className="live-empty">설문을 완료한 참가자가 두 명 이상이면 베스트 커플이 표시됩니다.</p>}</section>}
    <section className="live-participants-wide"><div className="live-card-title"><div><UsersRound size={20} /><strong>최근 참가자</strong></div><small>참가자 화면과 동기화</small></div>{state.recentParticipants?.length ? <div className="live-participant-grid">{state.recentParticipants.map((participant) => <div className="live-person-card" key={`${participant.id}-${participant.createdAt}`}><span className="live-avatar">{String(participant.pseudonym || '?').slice(0, 1)}</span><div><strong>{participant.pseudonym}</strong><small>{participant.variant === 'dorm' ? '대학교 기숙사' : participant.variant === 'nearby' ? '1km 거리 기반' : '현재 버전'} · 참여 중</small></div></div>)}</div> : <div className="live-empty">참가자에게 QR 코드를 안내하면 접속 현황이 여기에 표시됩니다.</div>}</section>
    <footer className="live-presenter-footer"><span><Check size={15} /> 개인정보는 익명 상태로만 표시됩니다.</span><span>API {API}</span></footer>
    {qrOpen && <div className="qr-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setQrOpen(false)}><div className="qr-modal" onClick={(event) => event.stopPropagation()}><button type="button" className="qr-modal-close" onClick={() => setQrOpen(false)} aria-label="QR 닫기">×</button><span className="section-kicker">PARTICIPANT ACCESS</span><h2>참가자 접속 QR</h2><p>청중이 카메라로 QR을 스캔하면 참가자 화면으로 이동합니다.</p>{qrDataUrl ? <img className="qr-modal-code" src={qrDataUrl} alt="참가자 접속 QR 코드" /> : <div className="qr-loading">QR 생성 중...</div>}<strong>{participantUrl}</strong></div></div>}
  </main>;
}
