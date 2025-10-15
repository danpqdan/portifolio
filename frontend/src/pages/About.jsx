import React, { useRef, useEffect } from 'react';
import perfil from '../assets/img/img_perfil.png';
import { FaJava } from 'react-icons/fa';
import { SiSpring, SiPython, SiDjango, SiReact } from 'react-icons/si';
import { FiGithub, FiMail, FiPhone } from 'react-icons/fi';

export default function About() {
  const rootRef = useRef(null);
  const enviarDados = () => { };

  useEffect(() => {
    const handleResize = () => {
      const screenWidth = window.innerWidth;
      const skillsRow = document.getElementById('about_skills_row');
      const aboutLeft = document.getElementById('about_left');
      const aboutRight = document.getElementById('about_right');

      if (!skillsRow || !aboutLeft || !aboutRight) return;

      // ✅ JUNTAR AVATAR E TEXTO EM TELAS PEQUENAS
      if (screenWidth < 380) {
        const avatar = document.getElementById('about_avatar');
        const textCenter = document.getElementById('about_text_center');

        if (avatar && textCenter) {
          // Verificar se já existe o container mobile
          let avatarTextContainer = document.getElementById('about_avatar_text_mobile');

          if (!avatarTextContainer) {
            // Criar container para avatar + texto
            avatarTextContainer = document.createElement('div');
            avatarTextContainer.id = 'about_avatar_text_mobile';
            avatarTextContainer.style.display = 'flex';
            avatarTextContainer.style.flexDirection = 'row';
            avatarTextContainer.style.alignItems = 'center';
            avatarTextContainer.style.gap = '12px';
            avatarTextContainer.style.width = '100%';
            avatarTextContainer.style.justifyContent = 'center';
            avatarTextContainer.style.marginBottom = '16px';

            // Mover avatar e texto para o novo container
            avatarTextContainer.appendChild(avatar);
            avatarTextContainer.appendChild(textCenter);

            // Adicionar o container no início do about_left
            aboutLeft.insertBefore(avatarTextContainer, aboutLeft.firstChild);
          }
        }
      } else {
        // Restaurar layout original para telas maiores
        const avatarTextContainer = document.getElementById('about_avatar_text_mobile');

        if (avatarTextContainer) {
          const avatar = document.getElementById('about_avatar');
          const textCenter = document.getElementById('about_text_center');

          if (avatar && textCenter) {
            // Remover do container mobile e adicionar de volta ao about_left
            aboutLeft.insertBefore(avatar, avatarTextContainer);
            aboutLeft.insertBefore(textCenter, avatarTextContainer);

            // Remover o container mobile
            avatarTextContainer.remove();
          }
        }
      }

      if (screenWidth < 720) {
        // Verificar se já existe o container mobile para skills
        const existingMobileSkills = document.getElementById('about_skills_row_mobile');
        if (existingMobileSkills) {
          return; // Já existe, não criar novamente
        }

        // Criar um container temporário com apenas os 3 primeiros skills
        const skillBadges = skillsRow.querySelector('#about_skill_badges');
        const allSkills = skillBadges.querySelectorAll('.skill-badge');
        const first3Skills = Array.from(allSkills).slice(0, 4);
        first3Skills.forEach((skill, index) => {
          const label = skill.querySelector('.skill-label')?.textContent || 'N/A';
        });

        // Criar novo container para os 3 primeiros
        const mobileSkillsContainer = document.createElement('div');
        mobileSkillsContainer.id = 'about_skills_row_mobile';
        mobileSkillsContainer.className = 'skills-row';

        const mobileSkillsList = document.createElement('div');
        mobileSkillsList.className = 'skills-list';

        const mobileSkillsTitle = document.createElement('h4');
        mobileSkillsTitle.className = 'about-h4-small';
        mobileSkillsTitle.textContent = 'Skills';

        const mobileSkillBadges = document.createElement('div');
        mobileSkillBadges.className = 'skill-badges';

        // Adicionar apenas os 3 primeiros skills
        first3Skills.forEach(skill => {
          const clonedSkill = skill.cloneNode(true);
          mobileSkillBadges.appendChild(clonedSkill);
        });

        mobileSkillsList.appendChild(mobileSkillsTitle);
        mobileSkillsList.appendChild(mobileSkillBadges);
        mobileSkillsContainer.appendChild(mobileSkillsList);

        // Adicionar ao about_left
        aboutLeft.appendChild(mobileSkillsContainer);

        // ESCONDER o container original no about_right
        skillsRow.style.display = 'none';

      } else {
        // Remover skills mobile e mostrar o original no about_right
        const mobileSkills = document.getElementById('about_skills_row_mobile');
        if (mobileSkills) {
          mobileSkills.remove();
        }

        // MOSTRAR o container original no about_right
        if (skillsRow) {
          skillsRow.style.display = 'block';
        }
      }
    };

    // Executar na montagem do componente
    handleResize();

    // Adicionar listener para mudanças de tamanho
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="page-root" style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', height: '100%', width: '100%', marginLeft: '2%' }}>
      <div id="about_card" ref={rootRef} className="card-carousel about-card">
        <div id="about_left" className="about-left">
          <img id="about_avatar" src={perfil} alt="perfil" className="avatar" />
          <div id="about_text_center" className="about-text-center">
            <h3 id="about_role_title" className="about-h3-large">Desenvolvedor / Tech Lead</h3>
            <p id="about_meta" className="about-meta">5 anos — Java (4y) • Python/Django (1y)</p>
          </div>

          <div id="about_contact_list" className="contact-list">
            <a id="about_link_github" href="https://github.com/" target="_blank" rel="noreferrer" ><FiGithub /> Github</a>
            <a id="about_link_email" href="mailto:danieltisantos@gmail.com"><FiMail /> E-mail</a>
            <a id="about_link_phone" href="tel:+5511962696757"><FiPhone />Celular</a>
          </div>

          <div id="about_interests_block" className="info-block">
            <div id="about_interests_box" className="info-box">
              <strong id="about_interests_title" className="about-info-strong">Interesses:</strong>
              <div id="about_interests_text" className="about-info-text">Leitura · Viagens · Convivência</div>
            </div>
          </div>

        </div>

        {/* right column: about + skills */}
        <div id="about_right" className="card-content about-right">
          <h3 id="about_title" className="about-h3-large tittle">Sobre mim</h3>
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
            <button id="about_btn_stats" className="primary-btn" onClick={enviarDados}>
              Visualizar estatística
            </button>
            <button id="about_btn_restart" className="primary-btn">reiniciar projeto</button>
          </div>
        </div>
      </div>
    </div>
  );
}