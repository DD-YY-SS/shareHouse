import { React, HeartHandshake } from '../shared.js';

function PersonCard({ person }) {
  return <div className="live-best-person">
    {person.profilePhotoData ? <img src={person.profilePhotoData} alt="프로필 사진" /> : <span className="live-best-avatar">{String(person.pseudonym || '익명').slice(0, 1)}</span>}
    <strong>{person.pseudonym || '익명 참가자'}</strong>
    <small>{person.age ? `${person.age}세` : '나이 비공개'}{person.mbti ? ` · ${person.mbti}` : ''}</small>
  </div>;
}

export default function LiveBestCouple({ bestCouple }) {
  const people = bestCouple?.participants || [];
  if (people.length < 2) return null;
  return <section className="live-best-couple-screen">
    <div className="live-best-kicker">TODAY'S BEST COUPLE</div>
    <HeartHandshake className="live-best-title-icon" size={30} />
    <h1>오늘의 베스트 커플</h1>
    <p>참가자들의 생활 패턴을 비교해<br />가장 높은 궁합을 기록한 두 분이에요.</p>
    <div className="live-best-people"><PersonCard person={people[0]} /><div className="live-best-heart">♥</div><PersonCard person={people[1]} /></div>
    <div className="live-best-score"><strong>{bestCouple.score}%</strong><span>생활 궁합</span></div>
    <div className="live-best-note">대화와 설문 결과를 바탕으로 계산한 라이브 시연 결과입니다.</div>
  </section>;
}
