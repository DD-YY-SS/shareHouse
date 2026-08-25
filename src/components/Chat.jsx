import { React, useEffect, useRef, useState, API, io, ChevronLeft, CreditCard, FileCheck2, LockKeyhole, Send, ShieldCheck, ArrowRight } from '../shared.js';

export default function Chat({ auth, chat, type = 'PRE_MOVE', back, confirm, onAgreementDraft, presentationMode = false }) {
  const roommateChat = type === 'ROOMMATE';
  const careStarted = Boolean(sessionStorage.getItem(`cm-care-start-${auth?.user?.id || ''}`));
  const [remaining, setRemaining] = useState(() => roommateChat ? null : (chat ? Math.max(0, Math.floor((Date.parse(chat.expiresAt) - Date.now()) / 1000)) : 1800));
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [online, setOnline] = useState(false);
  const [policyNotice, setPolicyNotice] = useState('');
  const socketRef = useRef(null);

  useEffect(() => {
    if (!chat || !auth?.accessToken) return undefined;
    const socket = io(API, { auth: { token: auth.accessToken } });
    socketRef.current = socket;
    const join = () => socket.emit('chat:join:typed', { matchId: chat.matchId, type }, (result) => {
      if (result?.ok) {
        setOnline(true);
        if (result.messages?.length) setMessages(result.messages);
      } else setOnline(false);
    });
    socket.on('connect', join);
    socket.on('disconnect', () => setOnline(false));
    socket.on('chat:message:typed', (message) => setMessages((items) => items.some((item) => item.id === message.id) ? items : [...items, message]));
    socket.on('chat:policy-warning', (result) => setPolicyNotice(result?.message || '안전한 매칭을 위해 연락처 교환을 제한하고 있습니다.'));
    return () => socket.close();
  }, [auth?.accessToken, chat?.matchId, type]);

  useEffect(() => {
    if (roommateChat) return undefined;
    const timer = setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [roommateChat]);

  if (!chat) return <section className="page-pad inner-page"><h2>활성 채팅방이 없습니다.</h2><button className="primary-button" onClick={back}>채팅 목록으로</button></section>;

  const send = () => {
    if (!text.trim() || !online || (!roommateChat && !remaining)) return;
    socketRef.current?.emit('chat:message:typed', { matchId: chat.matchId, type, text: text.trim() }, (result) => {
      if (!result?.ok) setPolicyNotice('메시지를 보낼 수 없습니다.');
    });
    setText('');
  };

  return <section className={`chat-page ${roommateChat ? 'roommate-chat-page' : 'pre-move-chat-page'}`}>
    <header className="chat-top">
      <button className="back-button" onClick={back}><ChevronLeft size={19} />뒤로</button>
      <div><strong>{roommateChat ? '우리 집 라운지 채팅' : '익명 입주 예정자'}</strong><span>{online ? '실시간 연결' : '연결 중...'}</span></div>
      {roommateChat ? <b>라운지</b> : <b>{String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</b>}
    </header>
    {!roommateChat && <>
      <div className="chat-policy"><LockKeyhole size={13} />이 채팅은 한 명의 매칭 상대와만 연결되며 30분 후 종료됩니다.</div>
      {policyNotice && <div className="chat-guard-notice"><ShieldCheck size={14} />{policyNotice}</div>}
      <div className="chat-benefit-warning"><ShieldCheck size={14} />채팅과 결제를 CheckMate 안에서 완료하면 30일 케어가 적용됩니다.</div>
      <div className="preauth-note"><CreditCard size={13} />채팅 전 안심 수수료 30,000원이 가결제됩니다.</div>
    </>}
    {roommateChat && <div className="chat-policy"><ShieldCheck size={13} />입주가 확정된 룸메이트 전용 영구 채팅입니다.</div>}
    <div className="messages">{messages.map((message) => <div className={`bubble ${message.from === auth.user.id ? 'mine' : 'other'}`} key={message.id}>{message.text || message.body}</div>)}</div>
    {!roommateChat && <button type="button" className="agreement-mini-button agreement-floating-button" onClick={() => onAgreementDraft?.({ matchId: chat.matchId, messages })} disabled={!messages.length} aria-label="생활 협약서 초안 만들기" title="생활 협약서 초안 만들기"><FileCheck2 size={16} /></button>}
    <div className="chat-input"><input disabled={!online || (!roommateChat && !remaining)} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && send()} placeholder={online ? '메시지를 입력하세요' : '연결 중...'} /><button onClick={send} disabled={!online || (!roommateChat && !remaining)}><Send size={18} /></button></div>
    {!roommateChat && remaining > 0 && !careStarted && <button className="primary-button chat-confirm" onClick={confirm}>채팅을 마치고 입주 확정하기 <ArrowRight size={18} /></button>}
  </section>;
}
