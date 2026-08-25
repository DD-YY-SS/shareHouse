import { React, useEffect, useState, API, responseJson, ChevronLeft, MessageCircle, Check, Clock3 } from '../shared.js';
import './chat-inbox.css';

export default function ChatInbox({ auth, back, onOpen }) {
  const [requests, setRequests] = useState([]);
  const [sent, setSent] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [roomType, setRoomType] = useState('PRE_MOVE');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'Content-Type': 'application/json' };
  const getOptions = { headers, cache: 'no-store' };

  // 세션 저장값이 없어도 DB에 확정된 룸메이트 채팅방이 있으면 자동 복원합니다.
  const load = async () => {
    try {
      const [incoming, outgoing, preMove, roommate] = await Promise.all([
        responseJson(await fetch(`${API}/api/v1/chat/requests`, getOptions)),
        responseJson(await fetch(`${API}/api/v1/chat/requests/sent`, getOptions)),
        responseJson(await fetch(`${API}/api/v1/chat/rooms?type=PRE_MOVE`, getOptions)),
        responseJson(await fetch(`${API}/api/v1/chat/rooms?type=ROOMMATE`, getOptions)),
      ]);

      const roommateRooms = roommate.rooms || [];
      const restoredType = roommateRooms.length ? 'ROOMMATE' : 'PRE_MOVE';
      setRequests(incoming.requests || []);
      setSent(outgoing.requests || []);
      setRoomType(restoredType);
      setRooms(restoredType === 'ROOMMATE' ? roommateRooms : (preMove.rooms || []));
    } catch (e) {
      setError(e.message || '채팅 목록을 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [auth.accessToken]);

  const accept = async (id) => {
    setBusy(id);
    try {
      await responseJson(await fetch(`${API}/api/v1/chat/requests/${id}/accept`, { method: 'POST', headers }));
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const open = async (room) => {
    setBusy(room.matchId);
    try {
      const data = await responseJson(await fetch(`${API}/api/v1/matches/${room.matchId}/chat-sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: roomType }),
      }));
      onOpen({ ...data.chat, matchId: room.matchId, type: roomType });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const score = (item) => item.compatibility ?? item.score ?? 0;

  return <section className="page-pad inner-page chat-inbox">
    <button className="back-button" onClick={back}><ChevronLeft size={19} />뒤로</button>
    <div className="section-kicker">채팅 센터</div>
    <h2>채팅 요청과<br />내 채팅방</h2>
    {error && <p className="login-error">{error}</p>}

    <div className="inbox-section">
      <h3>받은 채팅 요청 <span>{requests.length}</span></h3>
      {requests.length ? requests.map((item) => <div className="inbox-card" key={item.id}>
        <div className="inbox-avatar"><MessageCircle size={18} /></div>
        <div><strong>생활 패턴 일치도 {score(item)}%</strong><small>안심 채팅을 요청했습니다</small></div>
        <button className="primary-button inbox-action" onClick={() => accept(item.id)} disabled={busy === item.id}>
          {busy === item.id ? '처리 중' : <><Check size={15} />수락</>}
        </button>
      </div>) : <p className="inbox-empty">받은 채팅 요청이 없습니다.</p>}
    </div>

    <div className="inbox-section">
      <h3>보낸 채팅 요청 <span>{sent.length}</span></h3>
      {sent.length ? sent.map((item) => <div className="inbox-card" key={item.id}>
        <div className="inbox-avatar pending"><Clock3 size={18} /></div>
        <div><strong>생활 패턴 일치도 {score(item)}%</strong><small>상대방의 수락을 기다리는 중입니다</small></div>
        <span className="inbox-status">대기 중</span>
      </div>) : <p className="inbox-empty">보낸 채팅 요청이 없습니다.</p>}
    </div>

    <div className="inbox-section">
      <h3>{roomType === 'ROOMMATE' ? '룸메이트 라운지 채팅' : '내 채팅방'} <span>{rooms.length}</span></h3>
      {rooms.length ? rooms.map((room) => <button className="inbox-card inbox-room" key={room.matchId} onClick={() => open(room)} disabled={busy === room.matchId}>
        <div className="inbox-avatar"><MessageCircle size={18} /></div>
        <div><strong>생활 패턴 일치도 {score(room)}%</strong><small>{roomType === 'ROOMMATE' ? '무제한 룸메이트 대화' : '30분 안심 채팅 이어가기'}</small></div>
        <span>›</span>
      </button>) : <p className="inbox-empty">{roomType === 'ROOMMATE' ? '입주 확정 후 라운지 채팅이 열립니다.' : '서로 수락하면 이곳에 채팅방이 생성됩니다.'}</p>}
    </div>
  </section>;
}
