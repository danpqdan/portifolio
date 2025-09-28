import perfil from '../assets/img/img_perfil.png';
import { FiGithub, FiMail, FiPhone } from 'react-icons/fi';
import { FaJava } from 'react-icons/fa';
import { SiSpring, SiPython, SiDjango, SiReact } from 'react-icons/si';
import '../styles/cards.css';
import '../styles/about.css';
import analytics from '../lib/analyticsCache';
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
            <button onClick={() => { analytics.increment('clicks_info'); analytics.increment('clicks_geral'); window.location.reload(); }} className="primary-btn">Visualizar estatistica</button>
            <button onClick={() => { analytics.recordEvent('reiniciar_projeto'); window.location.reload(); }} className="primary-btn">reiniciar projeto</button>
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
