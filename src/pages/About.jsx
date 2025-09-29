import perfil from '../assets/img/img_perfil.png';
import { FiGithub, FiMail, FiPhone } from 'react-icons/fi';
import { FaJava } from 'react-icons/fa';
import { SiSpring, SiPython, SiDjango, SiReact } from 'react-icons/si';
import '../styles/cards.css';
import '../styles/about.css';
import analytics from '../lib/analyticsCache';
import { querySums } from '../lib/useAnalyticsQuery';
import { useEffect, useRef } from 'react';

export default function About() {
  const rootRef = useRef(null);

  useEffect(() => {
    // start page timer
    analytics.startPageTimer('about');
    // increment general view counter
    analytics.increment('view_about');
    // increment exibicao_estatistica
    analytics.increment('exibicao_estatistica');

    // observe for complete view (when right column reaches bottom of viewport)
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          analytics.increment('exibicao_completa');
        }
      });
    }, { threshold: 1.0 });

    const node = rootRef.current;
    if (node) {
      observer.observe(node);
    }

    return () => {
      analytics.stopPageTimer('about');
      if (node) observer.unobserve(node);
    };
  }, []);

  return (
    <div className="page-root">
  <div className="card-carousel about-card" ref={rootRef}>
        {/* left column: avatar + contact */}
        <div className="about-left">
          <img src={perfil} alt="perfil" className="avatar" />
          <div className="about-text-center">
            <h3 className="about-h3-large">Desenvolvedor / Tech Lead</h3>
            <p className="about-meta">5 anos — Java (4y) • Python/Django (1y)</p>
          </div>

          <div className="contact-list">
            <a href="https://github.com/" target="_blank" rel="noreferrer" onClick={() => { analytics.increment('clicks_github'); analytics.increment('clicks_geral'); }}><FiGithub /> Github</a>
            <a href="mailto:seu.email@exemplo.com" onClick={() => { analytics.increment('clicks_email'); analytics.increment('clicks_geral'); }}><FiMail /> seu.email@exemplo.com</a>
            <a href="tel:+5511999999999" onClick={() => { analytics.increment('clicks_telefone'); analytics.increment('clicks_geral'); }}><FiPhone /> +55 11 99999-9999</a>
          </div>

          <div className="info-block">
            <div className="info-box">
              <strong className="about-info-strong">Interesses:</strong>
              <div className="about-info-text">Leitura · Viagens · Convivência</div>
            </div>
          </div>

          <div className="info-block">
            <div className="info-box">
              <strong className="about-info-strong">Atuação</strong>
              <div className="about-info-text">Tech Lead em ERP — coordenação técnica, definição de arquitetura, code reviews e mentoring.</div>
            </div>
          </div>
        </div>

        {/* right column: about + skills */}
    <div className="card-content about-right">
          <h3 className="about-h3-large">Sobre mim</h3>
          <p className="about-paragraph">
            Sou desenvolvedor com 5 anos de experiência, com foco em soluções back-end escaláveis. Tenho 4 anos de experiência com Java e Spring Boot, implementando APIs com foco em performance, observabilidade e confiabilidade. Trabalhei em integrações complexas com bancos relacionais, projetos orientados a microsserviços e desenho de contratos HTTP/REST.
          </p>
          <p className="about-paragraph">
            No último ano, ampliei minha atuação para Python e Django, criando ferramentas internas, automações e integrações. Como Tech Lead em um ERP, lidero decisões arquiteturais, incentivando TDD, pipelines de CI/CD e automação de testes. Também contribuo com mentorias, definição de padrões e melhoria contínua do time.
          </p>
          <p className="about-paragraph">
            Interesses: leitura técnica e ficção, viagens para novos lugares, participação em comunidades técnicas e apresentações em meetups. Fluente em inglês, com facilidade para comunicação e liderança de pessoas.
          </p>

          <div className="skills-row">
            <div className="skills-list">
              <h4 className="about-h4-small">Skills</h4>
              <div className="skill-badges">
                <button className="skill-badge"><span className="skill-icon"><FaJava /></span><span className="skill-label">Java</span></button>
                <button className="skill-badge"><span className="skill-icon"><SiSpring /></span><span className="skill-label">Spring</span></button>
                <button className="skill-badge"><span className="skill-icon"><SiPython /></span><span className="skill-label">Python</span></button>
                <button className="skill-badge"><span className="skill-icon"><SiDjango /></span><span className="skill-label">Django</span></button>
                <button className="skill-badge"><span className="skill-icon"><SiReact /></span><span className="skill-label">React</span></button>
                <button className="skill-badge"><span className="skill-icon"><FiGithub /></span><span className="skill-label">DevOps / Git</span></button>
                <button className="skill-badge"><span className="skill-icon"><FiMail /></span><span className="skill-label">APIs / REST</span></button>
              </div>
            </div>
          </div>

          <div className="card-actions">
            <button
              onClick={async () => {
                // increment counters
                analytics.increment('clicks_info');
                analytics.increment('clicks_geral');

                  // build summary from snapshot without clearing cache
                  const snap = analytics.snapshot();

                  // start with timers (snapshot.lastTimers is computed dynamically)
                  const totals = {};
                  for (const [page, secs] of Object.entries(snap.lastTimers || {})) {
                    totals[page] = (totals[page] || 0) + Number(secs || 0);
                  }

                  // add counters: treat keys as page identifiers when possible
                  for (const [k, v] of Object.entries(snap.counters || {})) {
                    // if counter key contains a page-like token (e.g., 'view_about' or 'about_views'), try to map
                    const parts = k.split(/[_.-]/).filter(Boolean);
                    const maybePage = parts.length ? parts[parts.length - 1] : k;
                    const pageKey = maybePage === 'view' ? parts[parts.length - 2] || maybePage : maybePage;
                    const normalized = pageKey || k;
                    totals[normalized] = (totals[normalized] || 0) + Number(v || 0);
                  }

                  // add events: each event counts as 1 unless payload.count provided
                  for (const e of snap.events || []) {
                    const name = e.name || 'event';
                    const cnt = e.payload && typeof e.payload.count === 'number' ? e.payload.count : 1;
                    // try to map event name to a page token if it contains one (fallback to event name)
                    const parts = name.split(/[_.-]/).filter(Boolean);
                    const maybePage = parts.length ? parts[parts.length - 1] : name;
                    const pageKey = maybePage || name;
                    totals[pageKey] = (totals[pageKey] || 0) + Number(cnt);
                  }

                  // print structured table to console for inspection
                  console.log('Analytics aggregated totals (client snapshot):');
                  console.table(Object.entries(totals).map(([page, count]) => ({ page, count })));

                  // fetch sums from Influx (server-side aggregation)
                  try {
                    const influxMap = await querySums('24h');
                    const influxArr = Object.entries(influxMap).map(([page, count]) => ({ page, count }));
                    console.log('Influx summary (SUM(count) GROUP BY page) — last 24h:');
                    console.table(influxArr);
                  } catch (err) {
                    console.warn('Erro ao consultar InfluxDB:', err);
                  }

                  // return the totals object so it can be inspected by automated tests or devtools
                  return totals;

              }}
              className="primary-btn"
            >
              Visualizar estatistica
            </button>
            <button onClick={() => { analytics.recordEvent('reiniciar_projeto');window.location.reload(); }} className="primary-btn">reiniciar projeto</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkillBadge({ icon, label }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'white', border: '1px solid rgba(15,23,42,0.04)', borderRadius: 999, boxShadow: 'rgb(0 0 0 / 33%) 0px 8px 24px', color: '#0f172a', fontWeight: 600 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 13 }}>{label}</span>
    </div>
  );
}
