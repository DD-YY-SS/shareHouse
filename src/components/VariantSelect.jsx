import { React, useState, ArrowRight, Check, Home, ShieldCheck, UsersRound } from '../shared.js';
import { VARIANTS, saveVariantContext } from '../variants.js';

const icons = { standard: ShieldCheck, dorm: Home, nearby: UsersRound };

export default function VariantSelect({ onSelect }) {
  const [selected, setSelected] = useState('standard');
  const [campusId, setCampusId] = useState('');
  const [locationState, setLocationState] = useState('idle');
  const [location, setLocation] = useState(null);

  const useLocation = () => {
    if (!navigator.geolocation) {
      setLocationState('fallback');
      return;
    }
    setLocationState('loading');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setLocationState('ready');
      },
      () => setLocationState('fallback'),
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 },
    );
  };

  const continueToLogin = () => {
    const context = saveVariantContext({
      id: selected,
      campusId: campusId || 'demo-campus',
      ...(location || {}),
    });
    onSelect(context);
  };

  return (
    <div className="app-shell variant-shell">
      <section className="variant-page">
        <div className="login-brand variant-brand">
          <img className="app-logo login-logo" src="/checkmate-logo.svg" alt="CheckMate 로고" />
          <strong>CheckMate</strong>
        </div>
        <div className="variant-heading">
          <span className="eyebrow"><span className="live-dot" />MATCHING MODE</span>
          <h1>어떤 방식으로<br />룸메이트를 찾을까요?</h1>
          <p>사용할 매칭 버전을 먼저 선택해 주세요.<br />선택한 조건은 로그인 후 후보 비교에 적용됩니다.</p>
        </div>
        <div className="variant-list">
          {VARIANTS.map((variant) => {
            const Icon = icons[variant.id];
            const active = selected === variant.id;
            return (
              <button type="button" className={`variant-card ${active ? 'selected' : ''}`} key={variant.id} onClick={() => setSelected(variant.id)}>
                <span className="variant-icon"><Icon size={22} /></span>
                <span className="variant-card-copy"><small>{variant.label}</small><strong>{variant.title}</strong><span>{variant.description}</span><em>{variant.detail}</em></span>
                <span className="variant-check">{active && <Check size={17} />}</span>
              </button>
            );
          })}
        </div>
        {selected === 'dorm' && <label className="variant-extra">학교 또는 캠퍼스 이름<input value={campusId} onChange={(event) => setCampusId(event.target.value)} placeholder="예: 체크메이트대학교" /></label>}
        {selected === 'nearby' && <div className="variant-extra location-extra"><strong>1km 기준 위치</strong><p>{locationState === 'ready' ? '현재 위치를 기준으로 매칭해요.' : locationState === 'fallback' ? '위치 권한을 사용할 수 없어 데모 기준 위치로 진행해요.' : '현재 위치는 서버에 저장하지 않고 거리 계산에만 사용해요.'}</p><button type="button" className="secondary-button" onClick={useLocation} disabled={locationState === 'loading'}>{locationState === 'loading' ? '위치 확인 중...' : '현재 위치 사용'}</button></div>}
        <button type="button" className="primary-button variant-continue" onClick={continueToLogin}>이 버전으로 로그인하기 <ArrowRight size={18} /></button>
        <p className="variant-footnote"><ShieldCheck size={15} /> 개인정보는 버전 조건 확인에 필요한 정보만 사용해요.</p>
      </section>
    </div>
  );
}

