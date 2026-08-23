import { React, ArrowRight } from '../shared.js';
import './lounge.css';

const items = [
  ['롤휴지', '대용량 1팩', '🧻', '대용량 롤휴지'],
  ['주방 세제', '공용 주방용', '🧴', '주방 세제 대용량'],
  ['각티슈', '공용 거실용', '📦', '각티슈 대용량'],
  ['종량제 봉투', '자주 쓰는 사이즈', '🛍️', '종량제 봉투'],
];
const search = query => `https://www.coupang.com/np/search?q=${encodeURIComponent(query)}`;

export default function ShoppingWidgets() {
  return <section className="lounge-shopping"><div className="lounge-shopping-head"><div><span className="section-kicker">공용 생활 편의</span><strong>우리 집 장보기</strong></div><small>쿠팡에서 바로 보기</small></div><div className="shopping-items">{items.map(([name, detail, emoji, query]) => <a className="shopping-item" key={name} href={search(query)} target="_blank" rel="noreferrer"><span className="shopping-emoji">{emoji}</span><strong>{name}</strong><small>{detail}</small><ArrowRight size={14}/></a>)}</div><div className="shared-purchase"><div><strong>공동 구매 링크</strong><small>구매한 영수증·링크를 공유하고 1/N로 정산해요.</small></div><button type="button" onClick={() => window.alert('채팅방에서 구매 링크를 공유할 수 있어요.')}>정산 안내</button></div><a className="shopping-banner" href={search('자취생 생활 필수템')} target="_blank" rel="noreferrer"><span>✨</span><div><strong>룸메이트 필수 꿀템 모음</strong><small>자취 생활에 유용한 아이템을 둘러보세요.</small></div><ArrowRight size={16}/></a></section>;
}
