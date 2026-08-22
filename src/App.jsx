import { React, useEffect, useState, initialAnswers, API, embed, event, responseJson } from './shared.js';
import { localizeKorean } from './i18n/korean.js';
import Login from './components/Login.jsx';
import Entry from './components/Entry.jsx';
import Survey from './components/Survey.jsx';
import Match from './components/Match.jsx';
import Chat from './components/Chat.jsx';
import Confirm from './components/Confirm.jsx';
import CarePage from './components/CarePage.jsx';
import MyPage from './components/MyPage.jsx';
import Dashboard from './components/Dashboard.jsx';

export default function App(){
 const[context]=useState(embed),[auth,setAuth]=useState(()=>JSON.parse(sessionStorage.getItem('cm-auth')||'null')),[page,setPage]=useState('entry'),[consent,setConsent]=useState(false),[questionPage,setQuestionPage]=useState(0),[answers,setAnswers]=useState({...initialAnswers}),[match,setMatch]=useState(()=>{try{const a=JSON.parse(sessionStorage.getItem('cm-auth')||'null');return a?.user?.id?JSON.parse(sessionStorage.getItem('cm-match-'+a.user.id)||'null'):null}catch{return null}}),[chat,setChat]=useState(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false);
 useEffect(()=>{event(context,'entry')},[context]); useEffect(()=>{const reset=()=>{sessionStorage.removeItem('cm-auth');sessionStorage.removeItem('cm-care-start');setAuth(null);setMatch(null);setChat(null);setPage('entry')};window.addEventListener('cm-auth-expired',reset);return()=>window.removeEventListener('cm-auth-expired',reset)},[]); useEffect(()=>{const run=()=>setTimeout(localizeKorean,0);const observer=new MutationObserver(run);observer.observe(document.body,{childList:true,subtree:true});run();return()=>observer.disconnect()},[auth]);
 useEffect(()=>{if(auth?.user?.id&&match)sessionStorage.setItem('cm-match-'+auth.user.id,JSON.stringify(match))},[auth?.user?.id,match]);
 useEffect(()=>{if(!auth?.accessToken||match)return;fetch(API+'/api/v1/matches/candidates',{headers:{Authorization:'Bearer '+auth.accessToken}}).then(responseJson).then(data=>{const active=data.activeMatch&&data.candidates?.find(c=>data.activeMatch.memberIds.includes(c.candidateId));if(active)setMatch({...active,totalCandidates:data.totalCandidates||data.candidates.length})}).catch(()=>{})},[auth?.accessToken,match]);
 const go=next=>{setPage(next);event(context,next)};
 const login=result=>{sessionStorage.setItem('cm-auth',JSON.stringify(result));setAuth(result);setPage(result.user.role==='operator'?'dashboard':'entry')};
 const logout=()=>{if(auth?.user?.id)sessionStorage.removeItem('cm-match-'+auth.user.id);sessionStorage.removeItem('cm-care-start');sessionStorage.removeItem('cm-auth');setAuth(null)};
 const headers={Authorization:'Bearer '+auth?.accessToken,'Content-Type':'application/json'};
 const completeSurvey=async()=>{setLoading(true);try{await responseJson(await fetch(API+'/api/v1/behavior-profiles/me',{method:'PUT',headers,body:JSON.stringify(answers)}));const data=await responseJson(await fetch(API+'/api/v1/matches/candidates',{headers:{Authorization:'Bearer '+auth.accessToken}}));const recommendation=data.recommended||data.candidates?.[0];if(!recommendation)throw Error('NO_MATCH_CANDIDATE');setMatch({...recommendation,totalCandidates:data.totalCandidates||data.candidates.length});go('match')}catch{alert('Matching is unavailable. Check the API server.')}finally{setLoading(false)}};
 const startChat=async()=>{if(!match?.candidateId)return;setBusy(true);try{const matchResult=await responseJson(await fetch(API+'/api/v1/matches',{method:'POST',headers,body:JSON.stringify({candidateId:match.candidateId})}));const hold=await responseJson(await fetch(API+'/api/v1/matches/'+matchResult.match.id+'/preauthorize',{method:'POST',headers,body:JSON.stringify({amountKrw:30000})}));const room=await responseJson(await fetch(API+'/api/v1/matches/'+matchResult.match.id+'/chat-sessions',{method:'POST',headers}));setMatch(old=>old?{...old,status:matchResult.match.status,accepted:true,matchId:matchResult.match.id}:old);setChat({...room.chat,matchId:matchResult.match.id,paymentId:hold.payment?.id});go('chat')}catch{alert('Chat room could not be prepared. Check the API server.')}finally{setBusy(false)}};
 const openMatching=async()=>{if(sessionStorage.getItem('cm-care-start')){go('care');return}if(match){go('match');return}if(!auth?.accessToken){go('survey');return}setLoading(true);try{const data=await responseJson(await fetch(API+'/api/v1/matches/candidates',{headers:{Authorization:'Bearer '+auth.accessToken}}));const active=data.activeMatch?{candidateId:data.activeMatch.memberIds.find(id=>id!==auth.user.id),pseudonym:'Anonymous tenant',score:data.activeMatch.compatibility,breakdown:data.activeMatch.breakdown,bestReasons:data.activeMatch.bestReasons,watchouts:data.activeMatch.watchouts,status:data.activeMatch.status,accepted:true,matchId:data.activeMatch.id,preferences:data.activeMatch.preferences,totalCandidates:data.totalCandidates}:null;const current=data.candidates?.find(c=>data.activeMatch?.memberIds?.includes(c.candidateId));if(current||active){setMatch(current||active);go('match')}else go('survey')}catch{go('survey')}finally{setLoading(false)}};
 if(!auth)return <Login onLogin={login}/>;
 if(auth.user.role==='operator'||page==='dashboard')return <Dashboard auth={auth} context={context} logout={logout}/>;
 return <div className="app-shell"><header className="topbar"><button className="brand" onClick={()=>go('entry')}><img className="app-logo top-logo" src="/checkmate-logo.svg" alt="CheckMate logo"/><span>CheckMate</span></button></header><main>
  {page==='entry'&&<Entry context={context} consent={consent} setConsent={setConsent} next={()=>go('survey')}/>}
  {page==='survey'&&<Survey page={questionPage} setPage={setQuestionPage} answers={answers} setAnswers={setAnswers} next={()=>questionPage<2?setQuestionPage(questionPage+1):completeSurvey()} loading={loading}/>}
  {page==='match'&&<Match match={match} back={()=>go('survey')} start={startChat} busy={busy}/>}
  {page==='chat'&&<Chat auth={auth} chat={chat} back={()=>go('match')} confirm={()=>go('confirm')}/>}
  {page==='confirm'&&<Confirm roomId={context.roomId} paymentId={chat?.paymentId} back={()=>go('match')} done={()=>event(context,'contract_confirmed')} care={()=>go('care')}/>}
  {page==='care'&&<CarePage roomId={context.roomId} back={()=>go('confirm')}/>}
  {page==='my'&&<MyPage auth={auth} back={()=>go('entry')} logout={logout}/>}
 </main><nav className="bottom-nav"><button className={page==='entry'?'active':''} onClick={()=>go('entry')}><Home size={19}/>Home</button><button className={['survey','match','confirm','care'].includes(page)?'active':''} onClick={openMatching}><UsersRound size={19}/>Matching</button><button className={page==='chat'?'active':''} onClick={()=>chat&&go('chat')} disabled={!chat}><MessageCircle size={19}/>Chat</button><button className={page==='my'?'active':''} onClick={()=>go('my')}><UserRound size={19}/>My</button></nav></div>
}
