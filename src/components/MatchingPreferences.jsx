import { React, ShieldCheck, UsersRound } from '../shared.js';

export default function MatchingPreferences({ answers, setAnswers }) {
  const update = (key, value) => setAnswers({ ...answers, [key]: value });
  return <div className="matching-preferences">
    <div className="matching-preferences-head"><div><span className="section-kicker">매칭 조건</span><h3>원하는 주거 형태도 선택해 주세요</h3></div><UsersRound size={21} /></div>
    <label>룸 형태<select value={answers.roomType} onChange={(event) => update('roomType', event.target.value)}><option value="private_room">개인실 + 공용 공간</option><option value="shared_room">2인실</option><option value="multi_room">다인실</option></select></label>
    <div className="preference-label">몇 명과 함께 살고 싶나요?</div><div className="preference-options">{[2, 3, 4].map((value) => <button type="button" className={Number(answers.shareCount) === value ? 'selected' : ''} key={value} onClick={() => update('shareCount', value)}>{value}명 쉐어</button>)}</div>
    <label>선호하는 룸메이트 성별<select value={answers.preferredGender} onChange={(event) => update('preferredGender', event.target.value)}><option value="any">선호 없음</option><option value="female">여성</option><option value="male">남성</option><option value="non_binary">논바이너리</option></select></label>
    <label>선호 연령대<select value={answers.ageBand} onChange={(event) => update('ageBand', event.target.value)}><option value="any">선호 없음</option><option value="20s">20대</option><option value="30s">30대</option><option value="40_plus">40대 이상</option></select></label>
    <p className="preference-note"><ShieldCheck size={14} />선택 조건을 먼저 적용한 뒤 점수 차이가 작은 순서로 추천합니다.</p>
  </div>;
}
