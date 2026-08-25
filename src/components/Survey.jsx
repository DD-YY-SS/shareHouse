import { React, Sparkles, ArrowRight, ChevronLeft, survey } from '../shared.js';
import MatchingPreferences from './MatchingPreferences.jsx';

export default function Survey({ page, setPage, answers, setAnswers, next, loading }) {
  const group = survey.slice(page * 3, page * 3 + 3);
  return <section className="page-pad inner-page">
    <button className="back-button" onClick={() => page ? setPage(page - 1) : history.back()}><ChevronLeft size={19} /> 뒤로</button>
    <div className="survey-head"><div><div className="section-kicker">행동 빈도 설문</div><span className="survey-caption">최근 실제 행동을 기준으로 답해 주세요.</span></div><span>{page + 1} / 3</span></div>
    <div className="question-progress"><i style={{ width: `${(page + 1) * 33.33}%` }} /></div>
    <h2>{page === 0 ? '수면과 일상 리듬' : page === 1 ? '공용 공간 생활' : '방문객과 개인 생활'}</h2>
    <p className="muted">성격이 아니라 지난 한 달간 행동 빈도로 답합니다.</p>
    <div className="grouped-survey">{group.map(([key, title, options]) => <div className="survey-block" key={key}><h3>{title}</h3><div className="frequency-list">{options.map((option, index) => <button type="button" className={answers[key] === index ? 'selected' : ''} key={option} onClick={() => setAnswers({ ...answers, [key]: index })}><span>{option}</span><span className="radio" /></button>)}</div></div>)}</div>
    {page === 2 && <MatchingPreferences answers={answers} setAnswers={setAnswers} />}
    <div className="behavior-note"><Sparkles size={17} />구체적인 생활 행동과 주거 형태를 함께 반영해 매칭합니다.</div>
    <button className="primary-button form-next" disabled={loading} onClick={next}>{loading ? '매칭을 계산하는 중...' : page === 2 ? '매칭 결과 보기' : '다음'} <ArrowRight size={18} /></button>
  </section>;
}
