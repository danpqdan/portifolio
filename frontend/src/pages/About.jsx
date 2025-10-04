import React, { useRef } from 'react';
import perfil from '../assets/img/img_perfil.png';
import { FaJava } from 'react-icons/fa';
import { SiSpring, SiPython, SiDjango, SiReact, SiGrafana, SiRedux } from 'react-icons/si';
import { FiGithub, FiMail, FiPhone } from 'react-icons/fi';
export default function About() {
  const rootRef = useRef(null);

  return (
    <div className="page-root">
      <div id="about_card" ref={rootRef} className="card-carousel about-card">
        <div id="about_left" className="about-left">
          <img id="about_avatar" src={perfil} alt="perfil" className="avatar" />
          <div id="about_text_center" className="about-text-center">
            <h3 id="about_role_title" className="about-h3-large">Desenvolvedor / Tech Lead</h3>
            <p id="about_meta" className="about-meta">5 anos — Java (4y) • Python/Django (1y)</p>
          </div>

          <div id="about_contact_list" className="contact-list">
            <a id="about_link_github" href="https://github.com/" target="_blank" rel="noreferrer" ><FiGithub /> Github</a>
            <a id="about_link_email" href="mailto:seu.email@exemplo.com"><FiMail /> seu.email@exemplo.com</a>
            <a id="about_link_phone" href="tel:+5511999999999"><FiPhone /> +55 11 99999-9999</a>
          </div>

          <div id="about_interests_block" className="info-block">
            <div id="about_interests_box" className="info-box">
              <strong id="about_interests_title" className="about-info-strong">Interesses:</strong>
              <div id="about_interests_text" className="about-info-text">Leitura · Viagens · Convivência</div>
            </div>
          </div>

          <div id="about_role_block" className="info-block">
            <div id="about_role_box" className="info-box">
              <strong id="about_role_title_strong" className="about-info-strong">Atuação</strong>
              <div id="about_role_text" className="about-info-text">Tech Lead em ERP — coordenação técnica, definição de arquitetura, code reviews e mentoring.</div>
            </div>
          </div>
        </div>

        {/* right column: about + skills */}
        <div id="about_right" className="card-content about-right">
          <h3 id="about_title" className="about-h3-large">Sobre mim</h3>
          <p id="about_paragraph1" className="about-paragraph">
            Sou desenvolvedor com 5 anos de experiência, com foco em soluções back-end escaláveis. Tenho 4 anos de experiência com Java e Spring Boot, implementando APIs com foco em performance, observabilidade e confiabilidade. Trabalhei em integrações complexas com bancos relacionais, projetos orientados a microsserviços e desenho de contratos HTTP/REST.
          </p>
          <p id="about_paragraph2" className="about-paragraph">
            No último ano, ampliei minha atuação para Python e Django, criando ferramentas internas, automações e integrações. Como Tech Lead em um ERP, lidero decisões arquiteturais, incentivando TDD, pipelines de CI/CD e automação de testes. Também contribuo com mentorias, definição de padrões e melhoria contínua do time.
          </p>
          <p id="about_paragraph3" className="about-paragraph">
            Interesses: leitura técnica e ficção, viagens para novos lugares, participação em comunidades técnicas e apresentações em meetups. Fluente em inglês, com facilidade para comunicação e liderança de pessoas.
          </p>

          <div id="about_skills_row" className="skills-row">
            <div id="about_skills_list" className="skills-list">
              <h4 id="about_skills_title" className="about-h4-small">Skills</h4>
              <div id="about_skill_badges" className="skill-badges">
                <button id="about_skill_java" className="skill-badge"><span className="skill-icon"><FaJava /></span><span className="skill-label">Java</span></button>
                <button id="about_skill_spring" className="skill-badge"><span className="skill-icon"><SiSpring /></span><span className="skill-label">Spring</span></button>
                <button id="about_skill_python" className="skill-badge"><span className="skill-icon"><SiPython /></span><span className="skill-label">Python</span></button>
                <button id="about_skill_django" className="skill-badge"><span className="skill-icon"><SiDjango /></span><span className="skill-label">Django</span></button>
                <button id="about_skill_react" className="skill-badge"><span className="skill-icon"><SiReact /></span><span className="skill-label">React</span></button>
                <button id="about_skill_devops" className="skill-badge"><span className="skill-icon"><FiGithub /></span><span className="skill-label">DevOps / Git</span></button>
                <button id="about_skill_apis" className="skill-badge"><span className="skill-icon"><FiMail /></span><span className="skill-label">APIs / REST</span></button>
              </div>
            </div>
          </div>

          <div id="about_card_actions" className="card-actions">
            <button id="about_btn_stats" className="primary-btn">
              Visualizar estatistica
            </button>
            <button id="about_btn_restart" className="primary-btn">reiniciar projeto</button>
          </div>
        </div>
      </div >
    </div >
  );
}

function SkillBadge({ icon, label }) {
  return (
    <div id={`about_skill_${label.toLowerCase().replace(/\s+/g, '_').replace(/\//g, '_')}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'white', border: '1px solid rgba(15,23,42,0.04)', borderRadius: 999, boxShadow: 'rgb(0 0 0 / 33%) 0px 8px 24px', color: '#0f172a', fontWeight: 600 }}>
      <span id={`about_skill_icon_${label.toLowerCase().replace(/\s+/g, '_').replace(/\//g, '_')}`} style={{ display: 'inline-flex', alignItems: 'center', fontSize: 18 }}>{icon}</span>
      <span id={`about_skill_label_${label.toLowerCase().replace(/\s+/g, '_').replace(/\//g, '_')}`} style={{ fontSize: 13 }}>{label}</span>
    </div>
  );
}