import { React, useEffect, useState, initialAnswers, API, embed, event, responseJson, Home, UsersRound, MessageCircle, UserRound, CalendarDays } from './shared.js';
import { localizeKorean } from './i18n/korean.js';
import Login from './components/Login.jsx';
import Entry from './components/Entry.jsx';
import Survey from './components/Survey.jsx';
import Match from './components/Match.jsx';
import Chat from './components/Chat.jsx';
import ChatInbox from './components/ChatInbox.jsx';
import Confirm from './components/Confirm.jsx';
import CarePage from './components/CarePage.jsx';
import MyPage from './components/MyPage.jsx';
import Dashboard from './components/Dashboard.jsx';
import RoomLoungeMap from './components/RoomLoungeMap.jsx';
import CalendarPage from './components/Calendar.jsx';
import './components/lounge.css';

export default function App(){
 const mapEditor=typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('mapEditor')==='true';
 if(mapEditor)return <StandaloneMapEditor/>;
 return <AuthenticatedApp/>;
}

function StandaloneMapEditor(){
 return <div className="standalone-map-editor"><header><img src="/checkmate-logo.svg" alt="CheckMate"/><div><strong>CheckMate Pixel Studio</strong><span>로그인 없이 라운지 맵을 편집합니다.</span></div></header><main><RoomLoungeMap/></main></div>;
}

function AuthenticatedApp(){
 const[context]=useState(embed),[auth,setAuth]=useState(()=>JSON.parse(sessionStorage.getItem('cm-auth')||'null')),[page,setPage]=useState('entry'),[consent,setConsent]=useState(false),[profileComplete,setProfileComplete]=useState(false),[questionPage,setQuestionPage]=useState(0),[answers,setAnswers]=useState({...initialAnswers}),[match,setMatch]=useState(()=>{try{const a=JSON.parse(sessionStorage.getItem('cm-auth')||'null');return a?.user?.id?JSON.parse(sessionStorage.getItem('cm-match-'+a.user.id)||'null'):null}catch{return null}}),[chat,setChat]=useState(null),[chatType,setChatType]=useState('PRE_MOVE'),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false);
 useEffect(()=>{document.documentElement.classList.remove('dark');localStorage.removeItem('cm-theme')},[]);
 useEffect(()=>{event(context,'entry')},[context]); useEffect(()=>{const reset=()=>{sessionStorage.removeItem('cm-auth');sessionStorage.removeItem('cm-care-start');setAuth(null);setMatch(null);setChat(null);setPage('entry')};window.addEventListener('cm-auth-expired',reset);return()=>window.removeEventListener('cm-auth-expired',reset)},[]); useEffect(()=>{const run=()=>setTimeout(localizeKorean,0);const observer=new MutationObserver(run);observer.observe(document.body,{childList:true,subtree:true});run();return()=>observer.disconnect()},[auth]);
 useEffect(()=>{if(auth?.user?.id&&match)sessionStorage.setItem('cm-match-'+auth.user.id,JSON.stringify(match))},[auth?.user?.id,match]);
 useEffect(()=>{if(!auth?.accessToken||auth.user.role!=='tenant')return;fetch(API+'/api/v1/behavior-profiles/me',{headers:{Authorization:'Bearer '+auth.accessToken}}).then(responseJson).then(data=>setProfileComplete(Boolean(data.completed))).catch(()=>setProfileComplete(false))},[auth?.accessToken,auth?.user?.role]);
 useEffect(()=>{if(!auth?.accessToken)return;fetch(API+'/api/v1/matches/candidates',{headers:{Authorization:'Bearer '+auth.accessToken}}).then(responseJson).then(data=>{const active=data.activeMatch&&data.candidates?.find(c=>data.activeMatch.memberIds.includes(c.candidateId));if(active){if(active.status!=='confirmed')sessionStorage.removeItem('cm-care-start');setMatch({...active,totalCandidates:data.totalCandidates||data.candidates.length})}else if(match?.matchId)setMatch(null)}).catch(()=>{})},[auth?.accessToken]);
 useEffect(()=>{if(!auth?.accessToken||!match?.matchId||chat)return;fetch(`${API}/api/v1/matches/${match.matchId}/chat-sessions`,{method:'POST',headers}).then(responseJson).then(data=>setChat({...data.chat,matchId:match.matchId})).catch(()=>{})},[auth?.accessToken,match?.matchId,chat]);
 const go=next=>{setPage(next);event(context,next)};
 const login=result=>{sessionStorage.setItem('cm-auth',JSON.stringify(result));setAuth(result);setPage(result.user.role==='operator'?'dashboard':'entry')};
 const logout=()=>{if(auth?.user?.id)sessionStorage.removeItem('cm-match-'+auth.user.id);sessionStorage.removeItem('cm-care-start');sessionStorage.removeItem('cm-auth');setAuth(null)};
 const headers={Authorization:'Bearer '+auth?.accessToken,'Content-Type':'application/json'};
 const completeSurvey=async()=>{setLoading(true);try{await responseJson(await fetch(API+'/api/v1/behavior-profiles/me',{method:'PUT',headers,body:JSON.stringify(answers)}));setProfileComplete(true);const data=await responseJson(await fetch(API+'/api/v1/matches/candidates',{headers:{Authorization:'Bearer '+auth.accessToken}}));const recommendation=data.recommended||data.candidates?.[0];if(!recommendation)throw Error('NO_MATCH_CANDIDATE');setMatch({...recommendation,totalCandidates:data.totalCandidates||data.candidates.length});go('match')}catch{alert('Matching is unavailable. Check the API server.')}finally{setLoading(false)}};
 const startChat=async()=>{if(!match?.candidateId)return;setBusy(true);try{const matchResult=await responseJson(await fetch(API+'/api/v1/matches',{method:'POST',headers,body:JSON.stringify({candidateId:match.candidateId})}));const hold=await responseJson(await fetch(API+'/api/v1/matches/'+matchResult.match.id+'/preauthorize',{method:'POST',headers,body:JSON.stringify({amountKrw:30000})}));const room=await responseJson(await fetch(API+'/api/v1/matches/'+matchResult.match.id+'/chat-sessions',{method:'POST',headers}));setMatch(old=>old?{...old,status:matchResult.match.status,accepted:true,matchId:matchResult.match.id}:old);setChat({...room.chat,matchId:matchResult.match.id,paymentId:hold.payment?.id});go('chat')}catch{alert('Chat room could not be prepared. Check the API server.')}finally{setBusy(false)}};
 const openChat=async()=>{if(chat){go('chat');return}if(!match?.matchId)return;setBusy(true);try{const room=await responseJson(await fetch(`${API}/api/v1/matches/${match.matchId}/chat-sessions`,{method:'POST',headers}));setChat({...room.chat,matchId:match.matchId});go('chat')}catch{alert('Chat room could not be opened. Check the API server.')}finally{setBusy(false)}};
 const openMatching=async()=>{if(sessionStorage.getItem('cm-care-start')){go('care');return}if(match){go('match');return}if(!auth?.accessToken){go('survey');return}setLoading(true);try{const data=await responseJson(await fetch(API+'/api/v1/matches/candidates',{headers:{Authorization:'Bearer '+auth.accessToken}}));const active=data.activeMatch?{candidateId:data.activeMatch.memberIds.find(id=>id!==auth.user.id),pseudonym:'Anonymous tenant',score:data.activeMatch.compatibility,breakdown:data.activeMatch.breakdown,bestReasons:data.activeMatch.bestReasons,watchouts:data.activeMatch.watchouts,status:data.activeMatch.status,accepted:true,matchId:data.activeMatch.id,preferences:data.activeMatch.preferences,totalCandidates:data.totalCandidates}:null;const current=data.candidates?.find(c=>data.activeMatch?.memberIds?.includes(c.candidateId));if(current||active){setMatch(current||active);go('match')}else go('survey')}catch{go('survey')}finally{setLoading(false)}};
 if(!auth)return <Login onLogin={login}/>;
 if(auth.user.role==='operator'||page==='dashboard')return <Dashboard auth={auth} context={context} logout={logout}/>;
 return <div className="app-shell"><header className="topbar"><button className="brand" onClick={()=>go('entry')}><img className="app-logo top-logo" src="/checkmate-logo.svg" alt="CheckMate logo"/><span>CheckMate</span></button></header><main>
  {page==='entry'&&<Entry context={context} consent={consent} setConsent={setConsent} next={()=>go('survey')} profileComplete={profileComplete} openMatching={openMatching}/>}
  {page==='survey'&&<Survey page={questionPage} setPage={setQuestionPage} answers={answers} setAnswers={setAnswers} next={()=>questionPage<2?setQuestionPage(questionPage+1):completeSurvey()} loading={loading}/>}
  {page==='match'&&<Match match={match} back={()=>go('survey')} start={startChat} busy={busy}/>}
  {page==='chatInbox'&&<ChatInbox auth={auth} back={()=>go('entry')} onOpen={(room)=>{setChat(room);setChatType(room.type||'PRE_MOVE');go('chat')}}/>}
  {page==='chat'&&<Chat auth={auth} chat={chat} type={chatType} back={()=>go('chatInbox')} confirm={()=>go('confirm')}/>}
  {page==='confirm'&&<Confirm roomId={context.roomId} matchId={match?.matchId||chat?.matchId} paymentId={chat?.paymentId} back={()=>go('match')} done={()=>event(context,'contract_confirmed')} care={()=>go('care')}/>}
  {page==='care'&&<CarePage roomId={context.roomId} matchId={match?.matchId||chat?.matchId} auth={auth} back={()=>go('confirm')}/>}
  {page==='calendar'&&<CalendarPage back={()=>go('entry')}/>} 
  {page==='my'&&<MyPage auth={auth} back={()=>go('entry')} logout={logout} onAuthUpdated={setAuth}/>}
 </main><nav className="bottom-nav"><button className={page==='entry'?'active':''} onClick={()=>go('entry')}><Home size={19}/>홈</button><button className={page==='calendar'?'active':''} onClick={()=>go('calendar')}><CalendarDays size={19}/>일정</button><button className={['survey','match','confirm','care'].includes(page)?'active':''} onClick={openMatching}><UsersRound size={19}/>매칭</button><button className={['chat','chatInbox'].includes(page)?'active':''} onClick={()=>go('chatInbox')}><MessageCircle size={19}/>채팅</button><button className={page==='my'?'active':''} onClick={()=>go('my')}><UserRound size={19}/>마이</button></nav></div>
}
