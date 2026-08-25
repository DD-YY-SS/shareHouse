import { React, ArrowRight, ChevronLeft, Sparkles, survey } from '../shared.js';
import MatchingPreferences from './MatchingPreferences.jsx';

const sectionTitles = ['수면·생활 시간', '소음', '청소·공용공간', '방문객·공동생활', '생활 편의'];

export default function Survey({ page, setPage, answers, setAnswers, next, loading }) {
  const group = survey.slice(page * 3, page * 3 + 3);
  const update = (key, value) => setAnswers({ ...answers, [key]: value });
  const isLastPage = page === 4;
  return <section className="page-pad inner-page">
    <button className="back-button" onClick={() => page ? setPage(page - 1) : history.back()}><ChevronLeft size={19} />뒤로</button>
    <div className="survey-head"><div><div className="section-kicker">행동 빈도 설문</div><span className="survey-caption">최근 실제 행동을 기준으로 답해 주세요.</span></div><span>{page + 1} / 5</span></div>
    <div className="question-progress"><i style={{ width: `${((page + 1) / 5) * 100}%` }} /></div>
    <h2>{sectionTitles[page]}</h2>
    <p className="muted">성격이 아니라 지난 한 달간의 행동 빈도로 답합니다.</p>
    <div className="grouped-survey">{group.map(([key, title, options]) => <div className="survey-block" key={key}><h3>{title}</h3><div className="frequency-list">{options.map((option, index) => { const score = index + 1; return <button type="button" className={Number(answers[key]) === score ? 'selected' : ''} key={option} onClick={() => update(key, score)}><span>{option}</span><span className="radio" /></button>; })}</div></div>)}</div>
    {isLastPage && <MatchingPreferences answers={answers} setAnswers={setAnswers} />}
    <div className="behavior-note"><Sparkles size={17} />15개 행동 점수와 주거 형태를 함께 반영해 매칭합니다.</div>
    <button className="primary-button form-next" disabled={loading} onClick={next}>{loading ? '매칭 점수 계산 중...' : isLastPage ? '매칭 결과 보기' : '다음'} <ArrowRight size={18} /></button>
  </section>;
}
