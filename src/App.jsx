import { React, useEffect, useState, initialAnswers, API, embed, event, responseJson, Home, UsersRound, MessageCircle, UserRound, CalendarDays } from './shared.js';
import { localizeKorean } from './i18n/korean.js';
import Login from './components/Login.jsx';
import Entry from './components/Entry.jsx';
import Survey from './components/Survey.jsx';
import Match from './components/Match.jsx';
import Chat from './components/Chat.jsx';
import AgreementDraftPage from './components/AgreementDraftPage.jsx';
import ChatInbox from './components/ChatInbox.jsx';
import Confirm from './components/Confirm.jsx';
import CarePage from './components/CarePage.jsx';
import MyPage from './components/MyPage.jsx';
import LiveBestCouple from './components/LiveBestCouple.jsx';
import CareReport from './components/CareReport.jsx';
import Dashboard from './components/Dashboard.jsx';
import RoomLoungeMap from './components/RoomLoungeMap.jsx';
import CalendarPage from './components/Calendar.jsx';
import VariantSelect from './components/VariantSelect.jsx';
import { readVariantContext, VARIANT_CONTEXT_KEY } from './variants.js';
import './components/lounge.css';

export default function App({ skipVariantSelection = false }) {
  const mapEditor = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mapEditor') === 'true';
  const [variantContext, setVariantContext] = useState(readVariantContext);
  if (mapEditor) return <StandaloneMapEditor />;
  if (skipVariantSelection) return <AuthenticatedApp variantContext={{ id: 'standard', campusId: null, latitude: null, longitude: null }} onChangeVariant={() => {}} presentationMode />;
  if (!variantContext) return <VariantSelect onSelect={setVariantContext} />;
  const changeVariant = () => { sessionStorage.removeItem(VARIANT_CONTEXT_KEY); sessionStorage.removeItem('cm-auth'); setVariantContext(null); };
  return <AuthenticatedApp variantContext={variantContext} onChangeVariant={changeVariant} />;
}

function StandaloneMapEditor() {
  return <div className="standalone-map-editor"><header><img src="/checkmate-logo.svg" alt="CheckMate" /><div><strong>CheckMate Pixel Studio</strong><span>룸 라운지 맵을 편집합니다.</span></div></header><main><RoomLoungeMap /></main></div>;
}

function AuthenticatedApp({ variantContext, onChangeVariant, presentationMode = false }) {
  const [context] = useState(embed);
  const [auth, setAuth] = useState(() => JSON.parse(sessionStorage.getItem('cm-auth') || 'null'));
  const [page, setPage] = useState('entry');
  const [consent, setConsent] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);
  const [questionPage, setQuestionPage] = useState(0);
  const [answers, setAnswers] = useState({ ...initialAnswers });
  const [match, setMatch] = useState(() => { try { const savedAuth = JSON.parse(sessionStorage.getItem('cm-auth') || 'null'); return savedAuth?.user?.id ? JSON.parse(sessionStorage.getItem('cm-match-' + savedAuth.user.id) || 'null') : null; } catch { return null; } });
  const [chat, setChat] = useState(null);
  const [chatType, setChatType] = useState('PRE_MOVE');
  const [agreementContext, setAgreementContext] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [liveDemoState, setLiveDemoState] = useState({ matchRevealed: false, chatEnabled: false, bestCoupleRevealed: false, careReportDemoStarted: false, careReportRevealed: false, careReport: null });
  const headers = { Authorization: 'Bearer ' + auth?.accessToken, 'Content-Type': 'application/json', 'X-CheckMate-Variant': variantContext.id };
  useEffect(() => { if (presentationMode && auth?.user?.role === 'tenant' && liveDemoState.bestCoupleRevealed && liveDemoState.bestCouple?.participants?.length >= 2) setPage('liveBestCouple'); }, [presentationMode, auth?.user?.id, liveDemoState.bestCoupleRevealed, liveDemoState.bestCouple?.participants?.length]);
  useEffect(() => { if (presentationMode && auth?.user?.role === 'tenant' && liveDemoState.careReportRevealed && liveDemoState.careReport) setPage('careReport'); }, [presentationMode, auth?.user?.id, liveDemoState.careReportRevealed, liveDemoState.careReport]);

  useEffect(() => { document.documentElement.classList.remove('dark'); localStorage.removeItem('cm-theme'); }, []);
  useEffect(() => { if (!presentationMode) return; let cancelled = false; const load = async () => { try { const response = await fetch(API + '/api/v1/live-demo/state', { cache: 'no-store' }); if (!cancelled && response.ok) setLiveDemoState(await response.json()); } catch {} }; load(); const timer = setInterval(load, 2000); return () => { cancelled = true; clearInterval(timer); }; }, [presentationMode]);
  useEffect(() => { if (!presentationMode || !auth?.accessToken || (!match?.waitingForReveal && !match?.analysis) || !liveDemoState.matchRevealed) return; let cancelled = false; const reveal = async () => { try { const data = await responseJson(await fetch(API + '/api/v1/matches/candidates', { headers, cache: 'no-store' })); const recommendation = data.recommended || data.candidates?.[0]; if (!recommendation) throw Error('NO_MATCH_CANDIDATE'); if (!cancelled) { setMatch({ ...recommendation, totalCandidates: data.totalCandidates || data.candidates.length, liveRevealed: true }); event(context, 'match_completed', { tenantId: auth.user.id, pseudonym: auth.user.pseudonym, variant: variantContext.id }); } } catch { if (!cancelled) setMatch((old) => old ? { ...old, waitingForReveal: false, liveRevealError: true } : old); } }; reveal(); return () => { cancelled = true; }; }, [presentationMode, auth?.accessToken, match?.waitingForReveal, match?.analysis, liveDemoState.matchRevealed]);
  useEffect(() => { event(context, 'entry'); }, [context]);
  useEffect(() => { if (auth?.user?.role !== 'tenant') return; const metadata = { tenantId: auth.user.id, pseudonym: auth.user.pseudonym, variant: variantContext.id }; event(context, 'participant_joined', metadata); const heartbeat = setInterval(() => event(context, 'participant_heartbeat', metadata), 5000); return () => clearInterval(heartbeat); }, [auth?.user?.id, variantContext.id]);
  useEffect(() => { const reset = () => { sessionStorage.removeItem('cm-auth'); setAuth(null); setMatch(null); setChat(null); setAgreementContext(null); setPage('entry'); }; window.addEventListener('cm-auth-expired', reset); return () => window.removeEventListener('cm-auth-expired', reset); }, []);
  useEffect(() => { const run = () => setTimeout(localizeKorean, 0); const observer = new MutationObserver(run); observer.observe(document.body, { childList: true, subtree: true }); run(); return () => observer.disconnect(); }, [auth]);
  useEffect(() => { if (auth?.user?.id && match) sessionStorage.setItem('cm-match-' + auth.user.id, JSON.stringify(match)); }, [auth?.user?.id, match]);
  useEffect(() => { if (!auth?.accessToken || auth.user.role !== 'tenant') return; fetch(API + '/api/v1/behavior-profiles/me', { headers }).then(responseJson).then((data) => { const savedVariant = data.profile?._meta?.variant; const currentSurvey = Number(data.profile?._meta?.surveyVersion || 1) >= 2; setProfileComplete(Boolean(data.completed && currentSurvey && (!savedVariant || savedVariant === variantContext.id))); if (data.profile) setAnswers((old) => ({ ...old, ...data.profile, _meta: undefined })); }).catch(() => setProfileComplete(false)); }, [auth?.accessToken, auth?.user?.role, variantContext.id]);
  useEffect(() => { if (!auth?.accessToken || presentationMode) return; let cancelled = false; const sync = async () => { try { const data = await responseJson(await fetch(API + '/api/v1/matches/candidates', { headers, cache: 'no-store' })); if (cancelled) return; const state = data.activeMatch || data.pendingMatch; if (!state) { setMatch(null); setChat(null); return; } const source = data.candidates?.find((candidate) => state.memberIds.includes(candidate.candidateId)) || {}; const status = String(state.status || '').toLowerCase(); setMatch({ ...source, ...state, candidateId: source.candidateId || state.memberIds.find((id) => id !== auth.user.id), matchId: state.id, status, accepted: ['accepted', 'confirmed'].includes(status), totalCandidates: data.totalCandidates || 0 }); } catch {} }; sync(); const timer = setInterval(sync, 4000); return () => { cancelled = true; clearInterval(timer); }; }, [auth?.accessToken, variantContext.id, presentationMode]);
  useEffect(() => { if (presentationMode || !auth?.accessToken || !match?.matchId || !['accepted', 'confirmed'].includes(String(match.status).toLowerCase()) || chat) return; fetch(API + '/api/v1/matches/' + match.matchId + '/chat-sessions', { method: 'POST', headers, body: JSON.stringify({ type: 'PRE_MOVE' }) }).then(responseJson).then((data) => setChat({ ...data.chat, matchId: match.matchId })).catch(() => {}); }, [presentationMode, auth?.accessToken, match?.matchId, match?.status, chat]);

  const go = (next) => { setPage(next); event(context, next, auth?.user?.role === 'tenant' ? { tenantId: auth.user.id, pseudonym: auth.user.pseudonym, variant: variantContext.id } : {}); };
  const login = (result) => { sessionStorage.setItem('cm-auth', JSON.stringify({ ...result, variant: variantContext.id })); setMatch(null); setChat(null); setAuth({ ...result, variant: variantContext.id }); setPage(result.user.role === 'operator' ? 'dashboard' : (presentationMode && liveDemoState.careReportRevealed ? 'careReport' : presentationMode && liveDemoState.bestCoupleRevealed && liveDemoState.bestCouple?.participants?.length >= 2 ? 'liveBestCouple' : 'entry')); };
  const logout = () => { if (auth?.user?.id) sessionStorage.removeItem('cm-match-' + auth.user.id); sessionStorage.removeItem('cm-auth'); setAuth(null); setMatch(null); setChat(null); setAgreementContext(null); setPage('entry'); };
  const completeSurvey = async () => { setLoading(true); try { const profilePayload = { ...answers, _meta: { variant: variantContext.id, campusId: variantContext.campusId || null, latitude: variantContext.latitude ?? null, longitude: variantContext.longitude ?? null } }; await responseJson(await fetch(API + '/api/v1/behavior-profiles/me', { method: 'PUT', headers, body: JSON.stringify(profilePayload) })); setAnswers(profilePayload); setProfileComplete(true); event(context, 'survey_completed', { tenantId: auth.user.id, pseudonym: auth.user.pseudonym, variant: variantContext.id, mbti: answers.mbti || null, age: answers.age || null }); if (presentationMode) { setMatch({ waitingForReveal: true }); go('match'); return; } setMatch({ analysis: true }); go('match'); await new Promise((resolve) => setTimeout(resolve, 700)); const data = await responseJson(await fetch(API + '/api/v1/matches/candidates', { headers, cache: 'no-store' })); const recommendation = data.recommended || data.candidates?.[0]; if (!recommendation) throw Error('NO_MATCH_CANDIDATE'); setMatch({ ...recommendation, totalCandidates: data.totalCandidates || data.candidates.length }); event(context, 'match_completed', { tenantId: auth.user.id, pseudonym: auth.user.pseudonym, variant: variantContext.id }); } catch { setMatch(null); go('survey'); alert('현재 조건에 맞는 후보를 찾는 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.'); } finally { setLoading(false); } };
  const startChat = async () => { if (!match?.candidateId) return; setBusy(true); try { if (presentationMode) { const liveResult = await responseJson(await fetch(API + '/api/v1/live-demo/match', { method: 'POST', headers, body: JSON.stringify({ candidateId: match.candidateId }) })); const nextMatch = liveResult.match; const room = await responseJson(await fetch(API + '/api/v1/matches/' + nextMatch.id + '/chat-sessions', { method: 'POST', headers, body: JSON.stringify({ type: 'PRE_MOVE' }) })); setMatch((old) => old ? { ...old, ...nextMatch, status: 'accepted', accepted: true, matchId: nextMatch.id } : old); setChat({ ...room.chat, matchId: nextMatch.id }); go('chat'); return; } const matchResult = await responseJson(await fetch(API + '/api/v1/matches', { method: 'POST', headers, body: JSON.stringify({ candidateId: match.candidateId }) })); const nextMatch = matchResult.match; const nextStatus = String(nextMatch.status || '').toLowerCase(); setMatch((old) => old ? { ...old, ...nextMatch, status: nextStatus, accepted: ['accepted', 'confirmed'].includes(nextStatus), matchId: nextMatch.id } : old); if (nextStatus === 'requested') { go('match'); return; } const hold = await responseJson(await fetch(API + '/api/v1/matches/' + nextMatch.id + '/preauthorize', { method: 'POST', headers, body: JSON.stringify({ amountKrw: 30000 }) })); const room = await responseJson(await fetch(API + '/api/v1/matches/' + nextMatch.id + '/chat-sessions', { method: 'POST', headers, body: JSON.stringify({ type: 'PRE_MOVE' }) })); setChat({ ...room.chat, matchId: nextMatch.id, paymentId: hold.payment?.id }); go('chat'); } catch { alert('채팅방을 준비하지 못했어요. API 서버 상태를 확인해 주세요.'); } finally { setBusy(false); } };
  const openChat = async () => { if (chat) { go('chat'); return; } if (!match?.matchId) return; setBusy(true); try { const room = await responseJson(await fetch(API + '/api/v1/matches/' + match.matchId + '/chat-sessions', { method: 'POST', headers })); setChat({ ...room.chat, matchId: match.matchId }); go('chat'); } catch { alert('채팅방을 열지 못했어요.'); } finally { setBusy(false); } };
  const openMatching = async () => { if (!auth?.accessToken) { go('survey'); return; } setLoading(true); try { const data = await responseJson(await fetch(API + '/api/v1/matches/candidates', { headers, cache: 'no-store' })); const state = data.activeMatch || data.pendingMatch; if (!state) { setMatch(null); go('survey'); return; } const current = data.candidates?.find((candidate) => state.memberIds.includes(candidate.candidateId)); const status = String(state.status || '').toLowerCase(); setMatch({ ...(current || {}), ...state, candidateId: current?.candidateId || state.memberIds.find((id) => id !== auth.user.id), matchId: state.id, status, accepted: ['accepted', 'confirmed'].includes(status), totalCandidates: data.totalCandidates || 0 }); if (status === 'confirmed') go('care'); else go('match'); } catch { go('survey'); } finally { setLoading(false); } };

  if (!auth) return <Login onLogin={login} variantContext={variantContext} onChangeVariant={onChangeVariant} presentationMode={presentationMode} />;
  if (auth.user.role === 'operator' || page === 'dashboard') return <Dashboard auth={auth} context={context} logout={logout} />;
  return <div className={`app-shell ${presentationMode ? 'presentation-mode' : ''}`}><header className="topbar"><button className="brand" onClick={() => go('entry')}><img className="app-logo top-logo" src="/checkmate-logo.svg" alt="CheckMate 로고" /><span>CheckMate</span></button></header><main>
    {page === 'entry' && <Entry context={context} consent={consent} setConsent={setConsent} next={() => go('survey')} profileComplete={profileComplete} openMatching={openMatching} resident={match?.status === 'confirmed'} auth={auth} matchId={match?.matchId} candidateId={match?.candidateId} />}
    {page === 'survey' && <Survey page={questionPage} setPage={setQuestionPage} answers={answers} setAnswers={setAnswers} next={() => questionPage < 4 ? setQuestionPage(questionPage + 1) : completeSurvey()} loading={loading} />}
    {page === 'match' && <Match match={match} back={() => go('survey')} start={startChat} busy={busy} presentationMode={presentationMode} liveRevealed={liveDemoState.matchRevealed} chatEnabled={liveDemoState.chatEnabled} />}
    {page === 'chatInbox' && <ChatInbox auth={auth} back={() => go('entry')} onOpen={(room) => { setChat(room); setChatType(room.type || 'PRE_MOVE'); go('chat'); }} />}
    {page === 'chat' && <Chat auth={auth} chat={chat} type={chatType} back={() => go('chatInbox')} confirm={() => go('confirm')} presentationMode={presentationMode} onAgreementDraft={(draft) => { setAgreementContext(draft); go('agreement'); }} />}
    {page === 'agreement' && <AgreementDraftPage auth={auth} draftContext={agreementContext} back={() => go('chat')} />}
    {page === 'liveBestCouple' && <LiveBestCouple bestCouple={liveDemoState.bestCouple} />}
    {page === 'careReport' && <CareReport report={liveDemoState.careReport} />}
    {page === 'confirm' && <Confirm roomId={context.roomId} matchId={match?.matchId || chat?.matchId} paymentId={chat?.paymentId} back={() => go('match')} done={() => event(context, 'contract_confirmed')} care={() => go('care')} />}
    {page === 'care' && <CarePage roomId={context.roomId} matchId={match?.matchId || chat?.matchId} auth={auth} back={() => go('confirm')} />}
    {page === 'calendar' && <CalendarPage back={() => go('entry')} />}
    {page === 'my' && <MyPage auth={auth} back={() => go('entry')} logout={logout} onAuthUpdated={setAuth} />}
  </main><nav className="bottom-nav"><button className={page === 'entry' ? 'active' : ''} onClick={() => go('entry')}><Home size={19} />입주 안내</button><button className={page === 'calendar' ? 'active' : ''} onClick={() => go('calendar')}><CalendarDays size={19} />일정</button><button className={['survey', 'match', 'confirm', 'care'].includes(page) ? 'active' : ''} onClick={openMatching}><UsersRound size={19} />매칭</button><button className={['chat', 'chatInbox'].includes(page) ? 'active' : ''} onClick={() => go('chatInbox')}><MessageCircle size={19} />채팅</button><button className={page === 'my' ? 'active' : ''} onClick={() => go('my')}><UserRound size={19} />마이</button></nav></div>;
}
