import { React, useState, ArrowRight, API, responseJson, UserRound, Camera } from '../shared.js';

const MBTI_OPTIONS = ['ISTJ', 'ISFJ', 'INFP', 'ENFP', 'ESTJ', 'ENTP', 'unknown'];

function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) {
      reject(new Error('IMAGE_REQUIRED'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('IMAGE_READ_FAILED'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('IMAGE_READ_FAILED'));
      image.onload = () => {
        const size = 320;
        const scale = Math.min(1, size / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', 0.78);
        if (data.length > 120000) {
          reject(new Error('IMAGE_TOO_LARGE'));
          return;
        }
        resolve(data);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function ProfileSetup({ authResult, onComplete }) {
  const [pseudonym, setPseudonym] = useState(authResult.user.pseudonym || '');
  const [age, setAge] = useState(authResult.user.age || '');
  const [gender, setGender] = useState(authResult.user.gender || 'prefer_not_to_say');
  const [mbti, setMbti] = useState(authResult.user.mbti || '');
  const [profilePhotoData, setProfilePhotoData] = useState(authResult.user.profilePhotoData || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const choosePhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setError('');
      setProfilePhotoData(await resizePhoto(file));
    } catch (photoError) {
      setProfilePhotoData('');
      setError(photoError.message === 'IMAGE_TOO_LARGE' ? '사진 용량이 너무 커요. 다른 사진을 선택해 주세요.' : '사진을 읽지 못했어요. 이미지 파일을 선택해 주세요.');
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!profilePhotoData) {
      setError('프로필 사진을 선택해 주세요.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const data = await responseJson(await fetch(API + '/api/v1/users/me', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + authResult.accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pseudonym, age, gender, mbti: mbti === 'unknown' ? '' : mbti, profilePhotoData }),
      }));
      onComplete({ ...authResult, user: { ...authResult.user, ...data.user } });
    } catch {
      setError('프로필을 저장하지 못했어요. 입력 내용을 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="app-shell login-shell"><section className="profile-setup-page">
    <div className="login-brand"><img className="app-logo login-logo" src="/checkmate-logo.svg" alt="CheckMate 로고" /><strong>CheckMate</strong></div>
    <div className="profile-setup-icon"><UserRound size={25} /></div>
    <div className="profile-setup-copy"><span className="section-kicker">PROFILE SETUP</span><h1>나를 소개하는<br />프로필을 만들어 주세요.</h1><p>매칭 전에 보여줄 기본 정보예요.<br />연락처 같은 개인정보는 공개하지 않습니다.</p></div>
    <form className="login-card profile-setup-card" onSubmit={submit}>
      <label className="profile-photo-field">프로필 사진
        <input type="file" accept="image/*" onChange={choosePhoto} required={!profilePhotoData} />
        {profilePhotoData ? <img className="profile-photo-preview" src={profilePhotoData} alt="프로필 미리보기" /> : <span className="profile-photo-placeholder"><Camera size={24} /><small>사진을 선택해 주세요</small></span>}
      </label>
      <label>닉네임<input value={pseudonym} onChange={(e) => setPseudonym(e.target.value)} minLength={2} maxLength={80} required placeholder="예: 민지" /></label>
      <label>나이<input type="number" min="18" max="100" value={age} onChange={(e) => setAge(e.target.value)} required placeholder="예: 24" /></label>
      <label>성별<select value={gender} onChange={(e) => setGender(e.target.value)}><option value="prefer_not_to_say">선택하지 않음</option><option value="female">여성</option><option value="male">남성</option><option value="non_binary">논바이너리</option></select></label>
      <div className="profile-mbti-field"><span>MBTI (선택)</span><div>{MBTI_OPTIONS.map((type) => <button type="button" key={type} className={mbti === type ? 'selected' : ''} onClick={() => setMbti(type)}>{type === 'unknown' ? '모름' : type}</button>)}</div></div>
      {error && <p className="login-error">{error}</p>}
      <button className="primary-button" disabled={busy}>{busy ? '프로필 저장 중...' : '프로필 만들고 시작하기'} <ArrowRight size={18} /></button>
    </form>
    <p className="tiny-note">완료 후 참가자용 라이브 화면으로 이동합니다.</p>
  </section></div>;
}
