import { React } from '../shared.js';
import './care-report.css';

function number(value) {
  return Number.isInteger(value) ? String(value) : Number(value || 0).toFixed(1);
}

export default function CareReport({ report }) {
  const latest = report?.latest;
  const samples = report?.samples || [];

  const savePdf = () => window.print();

  return <main className="care-report-page">
    <header className="care-report-header">
      <div>
        <span className="section-kicker">30일 안심 케어 리포트</span>
        <h1>우리 집 생활 데이터를 확인했어요.</h1>
        <p>ESP32가 기록한 청소·소음 데이터를 바탕으로 정리한 시연용 보고서입니다.</p>
      </div>
      <button className="care-report-print" type="button" onClick={savePdf}>PDF로 저장</button>
    </header>

    <section className="care-report-status">
      <span className="care-report-status-dot" />
      <div><strong>30일 케어 데이터 수집 완료</strong><small>{report?.collectedAt ? new Date(report.collectedAt).toLocaleString('ko-KR') : '방금 전'}</small></div>
    </section>

    <section className="care-report-summary-grid">
      <article><span>최근 소음 감지</span><strong>{number(latest?.noiseCount)}회</strong><small>최근 기록 기준</small></article>
      <article><span>최근 청소 감지</span><strong>{number(latest?.cleanCount)}회</strong><small>최근 기록 기준</small></article>
      <article className="care-report-score"><span>생활 케어 점수</span><strong>{number(latest?.score)}점</strong><small>ESP32 측정값</small></article>
    </section>

    <section className="care-report-card">
      <div className="care-report-card-title"><div><span className="section-kicker">DATA SUMMARY</span><h2>30일 생활 케어 요약</h2></div><span className="care-report-sample-count">총 {report?.totalSamples || 0}회 기록</span></div>
      <div className="care-report-bars">
        <div><div><span>평균 소음 감지</span><strong>{number(report?.averageNoiseCount)}회</strong></div><i style={{ width: `${Math.min(100, Number(report?.averageNoiseCount || 0) * 10)}%` }} /></div>
        <div><div><span>평균 청소 감지</span><strong>{number(report?.averageCleanCount)}회</strong></div><i className="clean" style={{ width: `${Math.min(100, Number(report?.averageCleanCount || 0) * 10)}%` }} /></div>
        <div><div><span>평균 케어 점수</span><strong>{number(report?.averageScore)}점</strong></div><i className="score" style={{ width: `${Math.min(100, Number(report?.averageScore || 0) * 10)}%` }} /></div>
      </div>
    </section>

    <section className="care-report-card">
      <div className="care-report-card-title"><div><span className="section-kicker">COLLECTION LOG</span><h2>수집 기록</h2></div><small>최근 30개</small></div>
      {samples.length ? <div className="care-report-table-wrap"><table className="care-report-table"><thead><tr><th>기록 시각</th><th>소음</th><th>청소</th><th>점수</th></tr></thead><tbody>{samples.slice().reverse().map((sample) => <tr key={sample.id}><td>{sample.savedAt || `기록 ${sample.id}`}</td><td>{number(sample.noiseCount)}회</td><td>{number(sample.cleanCount)}회</td><td><strong>{number(sample.score)}점</strong></td></tr>)}</tbody></table></div> : <div className="care-report-empty">아직 저장된 ESP32 기록이 없습니다.</div>}
    </section>

    <footer className="care-report-footer">이 보고서는 라이브 시연을 위한 생활 데이터 요약본이며, 의료·법률 판단을 위한 자료가 아닙니다.</footer>
  </main>;
}
