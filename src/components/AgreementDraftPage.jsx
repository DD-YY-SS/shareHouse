import { React, useEffect, useState, API, responseJson, ChevronLeft, FileCheck2, ShieldCheck } from '../shared.js';

const categoryNames = {
  quiet_hours: '소음·수면 시간',
  cleaning: '청소',
  guests: '방문객',
  shared_space: '공용 공간',
  communication: '소통 방식',
  other: '기타',
};

export default function AgreementDraftPage({ auth, draftContext, back }) {
  const [agreement, setAgreement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const createDraft = async () => {
    if (!draftContext?.matchId || !draftContext.messages?.length) {
      setError('협약서로 정리할 채팅 내역이 없습니다.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await responseJson(await fetch(`${API}/api/v1/agreements/draft-from-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.accessToken}` },
        body: JSON.stringify({ matchId: draftContext.matchId, messages: draftContext.messages }),
      }));
      setAgreement(result.agreement);
    } catch (requestError) {
      setError('협약서 초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { createDraft(); }, [draftContext?.matchId]);

  const rules = agreement?.rules?.rules || [];

  return <section className="page-pad inner-page agreement-page">
    <button className="back-button" onClick={back}><ChevronLeft size={19} />뒤로</button>
    <div className="agreement-page-head">
      <div className="agreement-page-icon"><FileCheck2 size={22} /></div>
      <div><span className="section-kicker">AI 생활 협약서</span><h2>우리의 생활 협약서 초안</h2><p>채팅에서 명시적으로 합의한 내용만 정리했어요.</p></div>
    </div>
    <div className="agreement-privacy-note"><ShieldCheck size={16} /><span>채팅 원문은 저장하지 않고, 협의된 규칙만 초안으로 보관합니다.</span></div>
    {loading && <div className="agreement-loading">대화 내용을 협약서 형식으로 정리하고 있어요...</div>}
    {error && <div className="agreement-error"><p>{error}</p><button className="secondary-button" onClick={createDraft}>다시 시도</button></div>}
    {!loading && agreement && <>
      <div className="agreement-source">{agreement.rules?.source === 'llm' ? 'Gemini가 대화에서 추출한 초안' : '기본 초안 · AI 연결을 확인해 주세요'}</div>
      <div className="agreement-rule-list">
        {rules.map((rule, index) => <article className="agreement-rule-card" key={`${rule.category}-${index}`}>
          <span>{categoryNames[rule.category] || '기타'}</span>
          <p>{rule.content}</p>
          <small>{rule.needsConfirmation ? '양측 최종 확인 필요' : '대화에서 양측 합의 확인'}</small>
        </article>)}
      </div>
      <div className="agreement-review-note">이 문서는 법률 자문이나 법적 효력을 대신하지 않는 생활 규칙 초안입니다. 입주 전 양측이 내용을 직접 확인하고 서명해야 합니다.</div>
    </>}
  </section>;
}
