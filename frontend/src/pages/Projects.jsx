import React, { useState, useEffect } from 'react';
import { useSpring, a } from '@react-spring/web';
import {
  FaReact,
  FaJs,
  FaPython,
  FaGithub,
  FaExternalLinkAlt,
  FaJava,
  FaHandPointer,
  FaMousePointer,
  FaArrowRight
} from 'react-icons/fa';
import {
  SiTypescript,
  SiDjango,
  SiInfluxdb,
  SiPostgresql,
  SiPython,
  SiApachekafka,
  SiDocker,
  SiMysql
} from 'react-icons/si';
import "../styles/project.css";

// Card individual com animação flip
function ProjectCard({ project, index, cardWidth }) {
  const [flipped, setFlipped] = useState(false);
  const [isClicked, setIsClicked] = useState(false);

  // Animação principal do flip
  const { transform, opacity } = useSpring({
    opacity: flipped ? 1 : 0,
    transform: `perspective(600px) rotateX(${flipped ? 180 : 0}deg)`,
    config: { mass: 5, tension: 500, friction: 80 },
  });

  // Animação de clique (rotação de 15°)
  const { rotate } = useSpring({
    rotate: isClicked ? 15 : 0,
    config: { tension: 300, friction: 10, duration: 150 },
  });

  const handleClick = () => {
    // Ativa a animação de clique
    setIsClicked(true);

    // Alterna o flip após um pequeno delay
    setTimeout(() => {
      setFlipped(state => !state);
      setIsClicked(false);
    }, 150);
  };

  return (
    <div
      className="project-card-container"
      onClick={handleClick}
      style={{
        cursor: 'pointer',
        transform: rotate.to(r => `rotate(${r}deg)`),
        transition: 'transform 0.15s ease-out',
      }}
    >
      {/* Frente do card */}
      <a.div className="project-card-front" style={{
        opacity: opacity.to(o => 1 - o),
        transform
      }}>
        <div className="card-inner">
          <div className="card-top">
            <div className="card-title-container">
              <h3 className="card-title">{project.title}</h3>
              <div className="click-indicator-icon">
                <FaHandPointer className="click-icon" />
              </div>
            </div>
            <p className="project-card-description">{project.description}</p>
          </div>
        </div>
        <div className="card-bottom">
          <div className='container-btn-front'>
            {project.technologies.map((tech, idx) => (
              <span className='tech-span' key={idx}>
                {tech.icon}
                {tech.name}
              </span>
            ))}
          </div>
        </div>
      </a.div>

      {/* Verso do card */}
      <a.div
        className="project-card-back"
        style={{
          opacity,
          transform: transform.to(t => `${t} rotateX(180deg)`),
          position: 'absolute',
          backfaceVisibility: 'hidden',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
          backgroundColor: 'rgba(30, 41, 59, 0.95)',
        }}
      >
        <div className="card-inner">
          <div className="card-top">
            <div className="card-title-container">
              <h3 className="card-title" style={{ color: '#f1f5f9' }}>{project.title}</h3>
              <div className="click-indicator-icon">
                <FaHandPointer className="click-icon" />
              </div>
            </div>
            <p>{project.details}</p>

            {project.features && (
              <ul className="project-features">
                {project.features.map((feature, idx) => (
                  <li key={idx}>{feature}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="card-bottom">
          <div className='container-btn-projects'>
            {project.githubUrl && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(project.githubUrl, '_blank');
                }}
                className="btn-github"
              >
                <FaGithub /> GitHub
              </button>
            )}

            {project.demoUrl && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(project.demoUrl, '_blank');
                }}
                className="btn-demo"
              >
                <FaExternalLinkAlt /> Demo
              </button>
            )}
          </div>
        </div>
      </a.div>
    </div>
  );
}

// Versão alternativa com animação de "tilt" mais suave
function ProjectCardWithTilt({ project, index, cardWidth }) {
  const [flipped, setFlipped] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  // Animação principal do flip
  const { transform, opacity } = useSpring({
    opacity: flipped ? 1 : 0,
    transform: `perspective(600px) rotateX(${flipped ? 180 : 0}deg)`,
    config: { mass: 5, tension: 500, friction: 80 },
  });

  // Animação de tilt (alternando entre -8° e 8°)
  const { tilt } = useSpring({
    tilt: isPressed ? 8 : -8,
    config: { tension: 200, friction: 15 },
  });

  const handleClick = () => {
    // Animação de press
    setIsPressed(true);

    // Alterna o flip e reseta a animação
    setTimeout(() => {
      setFlipped(state => !state);
      setIsPressed(false);
    }, 300);
  };

  return (
    <div
      className="project-card-container"
      onClick={handleClick}
      style={{
        cursor: 'pointer',
        transform: tilt.to(t => `rotate(${t}deg)`),
        transition: 'transform 0.3s ease-in-out',
      }}
    >
      {/* Frente do card */}
      <a.div className="project-card-front" style={{
        opacity: opacity.to(o => 1 - o),
        transform
      }}>
        <div className="card-inner">
          <div className="card-top">
            <h3 className="card-title">{project.title}</h3>
            <p className="project-card-description">{project.description}</p>
          </div>
        </div>
        <div className="card-bottom">
          <div className='container-btn-front'>
            {project.technologies.map((tech, idx) => (
              <span className='tech-span' key={idx}>
                {tech.icon}
                {tech.name}
              </span>
            ))}
          </div>
        </div>
      </a.div>

      {/* Verso do card */}
      <a.div
        className="project-card-back"
        style={{
          opacity,
          transform: transform.to(t => `${t} rotateX(180deg)`),
          position: 'absolute',
          backfaceVisibility: 'hidden',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
          backgroundColor: 'rgba(30, 41, 59, 0.95)',
        }}
      >
        <div className="card-inner">
          <div className="card-top">
            <h3 className="card-title" style={{ color: '#f1f5f9' }}>{project.title}</h3>
            <p>{project.details}</p>

            {project.features && (
              <ul className="project-features">
                {project.features.map((feature, idx) => (
                  <li key={idx}>{feature}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="card-bottom">
          <div className='container-btn-projects'>
            {project.githubUrl && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(project.githubUrl, '_blank');
                }}
                className="btn-github"
              >
                <FaGithub /> GitHub
              </button>
            )}

            {project.demoUrl && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(project.demoUrl, '_blank');
                }}
                className="btn-demo"
              >
                <FaExternalLinkAlt /> Demo
              </button>
            )}
          </div>
        </div>
      </a.div>
    </div>
  );
}

export default function Projects() {
  const enviarDados = () => { };
  const [cardWidth, setCardWidth] = useState('50vw');

  useEffect(() => {
    function updateCardWidth() {
      const content = document.getElementById('projects_content');
      if (content) {
        const width = content.offsetWidth;
        setCardWidth(`${Math.round(width * 0.45)}px`);
      }
    }
    updateCardWidth();
    window.addEventListener('resize', updateCardWidth);
    return () => window.removeEventListener('resize', updateCardWidth);
  }, []);

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
    <div className='container'>
      <div id="projects_card" className="container-card">
        <div id="projects_content" className="card-content" >
          <h1 id="projects_title" >Projetos</h1>
          <div id="projects_list">
            <div className="container-projects">
              {projects.map((project, index) => (
                <ProjectCard
                  key={index}
                  project={project}
                  index={index}
                  cardWidth={cardWidth}
                />
                // Ou use ProjectCardWithTilt para a versão alternativa
              ))}
            </div>
          </div>
        </div>

        {/* ✅ DIV FIXA NO BOTTOM E CENTRALIZADA */}
        <div
          id="projects_actions"
          className="card-actions"
        >
          <button id="projects_btn_github" className="primary-btn" onClick={enviarDados}>
            <FaGithub style={{ marginRight: '8px' }} />
            GitHub
          </button>
        </div>
      </div>
    </div >
  );
}