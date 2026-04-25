import React, { useState } from 'react';
import { useSpring, a } from '@react-spring/web';
import {
  FaJs,
  FaPython,
  FaGithub,
  FaExternalLinkAlt,
  FaJava
} from 'react-icons/fa';
import {
  SiPython,
  SiApachekafka,
  SiDocker,
  SiMysql
} from 'react-icons/si';


// Card individual com animação flip
function ProjectCard({ project }) {
  const [flipped, setFlipped] = useState(false);

  const { transform, opacity } = useSpring({
    opacity: flipped ? 1 : 0,
    transform: `perspective(800px) rotateX(${flipped ? 180 : 0}deg)`,
    config: { mass: 5, tension: 500, friction: 80 },
  });

  const toggle = () => setFlipped(state => !state);

  return (
    <div
      className="project-tile"
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={`${project.title} — clique para ver detalhes`}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <a.div
        className="project-tile__face project-tile__face--front"
        style={{ opacity: opacity.to(o => 1 - o), transform }}
      >
        <header className="project-tile__header">
          <h3 className="project-tile__title">{project.title}</h3>
          <p className="project-tile__description">{project.description}</p>
        </header>
        <footer className="project-tile__chips">
          {project.technologies.map((tech, idx) => (
            <span className="project-tile__chip" key={idx}>
              <span className="project-tile__chip-icon" aria-hidden="true">{tech.icon}</span>
              <span className="project-tile__chip-label">{tech.name}</span>
            </span>
          ))}
        </footer>
        <span className="project-tile__hint" aria-hidden="true">toque para detalhes</span>
      </a.div>

      <a.div
        className="project-tile__face project-tile__face--back"
        style={{ opacity, transform: transform.to(t => `${t} rotateX(180deg)`) }}
      >
        <div className="project-tile__back-body">
          <h3 className="project-tile__title project-tile__title--invert">{project.title}</h3>
          <p className="project-tile__details">{project.details}</p>
          {project.features && (
            <ul className="project-tile__features">
              {project.features.map((feature, idx) => (
                <li key={idx}>{feature}</li>
              ))}
            </ul>
          )}
        </div>
        <footer className="project-tile__actions">
          {project.githubUrl && (
            <button
              type="button"
              className="project-tile__action project-tile__action--primary"
              onClick={(e) => { e.stopPropagation(); window.open(project.githubUrl, '_blank', 'noopener'); }}
            >
              <FaGithub aria-hidden="true" /> GitHub
            </button>
          )}
          {project.demoUrl && (
            <button
              type="button"
              className="project-tile__action project-tile__action--success"
              onClick={(e) => { e.stopPropagation(); window.open(project.demoUrl, '_blank', 'noopener'); }}
            >
              <FaExternalLinkAlt aria-hidden="true" /> Demo
            </button>
          )}
        </footer>
      </a.div>
    </div>
  );
}

export default function Projects() {
  // Função placeholder para botão GitHub (será controlada pelas classes)
  const enviarDados = () => console.log('📊 Botão GitHub clicado em Projects');

  // Dados dos projetos atualizados
  const projects = [
    {
      title: "Análise Educacional - IDEB",
      description: "Análise da importância da inovação nas escolas brasileiras através de dados do IDEB e censo escolar.",
      details: "Dashboard interativo para visualização de dados educacionais, analisando o impacto da tecnologia nas notas e correlação com indicadores do IDEB.",
      technologies: [
        { name: "Streamlit", icon: <SiPython /> },
        { name: "Pandas", icon: <SiPython /> },
        { name: "Matplotlib", icon: <FaPython /> },
        { name: "Scikit-learn", icon: <SiPython /> }
      ],
      features: [
        "Dashboard interativo de dados educacionais",
        "Análise de correlação tecnologia x notas",
        "Visualização de indicadores IDEB",
        "Análise de evasão escolar"
      ],
      githubUrl: "https://github.com/danpqdan/analise-dados-educacionais",
      demoUrl: "https://9vnfumnf7ajvghfs4ttffq.streamlit.app/"
    },
    {
      title: "Análise de Dados Python",
      description: "Coleção de projetos em Python focados em análise estatística, automação e visualização de dados.",
      details: "Repositório com múltiplos projetos incluindo automação web, controle comercial, gráficos 3D e análises estatísticas avançadas.",
      technologies: [
        { name: "Python", icon: <FaPython /> },
        { name: "Tkinter", icon: <SiPython /> },
        { name: "Matplotlib", icon: <FaPython /> },
        { name: "Pandas", icon: <SiPython /> }
      ],
      features: [
        "Automação de processos web",
        "Controle comercial com Tkinter",
        "Visualizações 3D de dados",
        "Análises estatísticas e probabilísticas"
      ],
      githubUrl: "https://github.com/danpqdan/analise_dados-py"
    },
    {
      title: "Chatbot LLM com Kafka",
      description: "Assistente de IA em tempo real com arquitetura de microsserviços e comunicação assíncrona via Kafka.",
      details: "Sistema distribuído em Java com event-driven architecture, WebSocket para client-side e Kafka para alta resiliência e demanda.",
      technologies: [
        { name: "Java", icon: <FaJava /> },
        { name: "Kafka", icon: <SiApachekafka /> },
        { name: "WebSocket", icon: <FaJs /> },
        { name: "Microservices", icon: <SiDocker /> }
      ],
      features: [
        "Arquitetura event-driven",
        "Comunicação WebSocket em tempo real",
        "Alta resiliência com Kafka",
        "Escalabilidade para alta demanda"
      ],
      githubUrl: "https://github.com/danpqdan/chatbot-llm-kafka"
    },
    {
      title: "Sistema Help Desk",
      description: "Sistema desktop para gerenciamento de ordens de serviço com interface intuitiva e geração de relatórios.",
      details: "Aplicação robusta desenvolvida em Python com Tkinter, MySQL e ReportLab para gestão completa de ordens de serviço e relatórios em PDF.",
      technologies: [
        { name: "Python", icon: <FaPython /> },
        { name: "Tkinter", icon: <SiPython /> },
        { name: "MySQL", icon: <SiMysql /> },
        { name: "ReportLab", icon: <FaPython /> }
      ],
      features: [
        "Interface gráfica intuitiva",
        "Gestão completa de ordens de serviço",
        "Relatórios PDF automatizados",
        "Integração com banco MySQL"
      ],
      githubUrl: "https://github.com/danpqdan/desk-help",
      demoUrl: "https://github.com/danpqdan/desk-help/releases/tag/dist%2Fdist%2Frelease_windows_0.0.1"
    }
  ];

  return (
    <div className="page-root">
      <div id="projects_card" className="card-carousel project-card">
        <div style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div id="projects_content" className="card-content" style={{
            overflowY: 'auto',
            flex: '1',
            paddingBottom: '20px'
          }}>
            <h1 id="projects_title" style={{ margin: '0 0 10px 0', color: '#0b1220' }}>Projetos</h1>
            <p id="projects_description" style={{ color: '#0b1220', textAlign: 'center' }}>
              Clique nos cards para ver mais detalhes de cada projeto.
            </p>

            <div id="projects_list" className="projects-grid">
              {projects.map((project, index) => (
                <ProjectCard
                  key={index}
                  project={project}
                />
              ))}
            </div>
          </div>

          {/* ✅ DIV FIXA NO BOTTOM E CENTRALIZADA */}
          <div
            id="projects_actions"
            className="card-actions"
            style={{
              textAlign: 'center',
              position: 'sticky',
              bottom: '0',
              padding: '15px 20px',
              borderTop: '1px solid rgba(0, 0, 0, 0.1)',
              backdropFilter: 'blur(10px)',
              zIndex: 10,
              display: 'flex',
              justifyContent: 'center',
              gap: '10px',
              flexShrink: '0'
            }}
          >
            <button id="projects_btn_view" className="primary-btn">
              Ver todos os projetos
            </button>
            <button id="projects_btn_github" className="primary-btn" onClick={enviarDados}>
              <FaGithub style={{ marginRight: '8px' }} />
              GitHub
            </button>
          </div>
        </div>
      </div>
    </div>
  );

}
