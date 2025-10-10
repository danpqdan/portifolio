import React, { useState } from 'react';
import { useSpring, a } from '@react-spring/web';
import { FaReact, FaJs, FaPython, FaGithub, FaExternalLinkAlt } from 'react-icons/fa';
import { SiTypescript, SiDjango, SiInfluxdb, SiPostgresql } from 'react-icons/si';

// Card individual com animação flip
function ProjectCard({ project, index }) {
  const [flipped, setFlipped] = useState(false);

  const { transform, opacity } = useSpring({
    opacity: flipped ? 1 : 0,
    transform: `perspective(600px) rotateX(${flipped ? 180 : 0}deg)`,
    config: { mass: 5, tension: 500, friction: 80 },
  });

  return (
    <div
      className="project-card-container"
      onClick={() => setFlipped(state => !state)}
      style={{
        position: 'relative',
        width: '300px',
        height: '200px',
        margin: '10px',
        cursor: 'pointer',
        perspective: '600px'
      }}
    >
      {/* Frente do card */}
      <a.div
        className="project-card-front"
        style={{
          opacity: opacity.to(o => 1 - o),
          transform,
          position: 'absolute',
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backfaceVisibility: 'hidden'
        }}
      >
        <div>
          <h3 style={{ margin: '0 0 10px 0', color: '#0b1220', fontSize: '18px' }}>
            {project.title}
          </h3>
          <p className="project-card-description" style={{ margin: '0', color: '#334155', fontSize: '14px', lineHeight: '1.4' }}>
            {project.description}
          </p>
        </div>

        <div className='container-btn-front' style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
          {project.technologies.map((tech, idx) => (
            <span
              className='tech-span'
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: '#e2e8f0',
                color: '#475569',
                padding: '12px 16px',
                borderRadius: '6px',
                fontSize: '12px',
              }}
            >
              {tech.icon}
              {tech.name}
            </span>
          ))}
        </div>
      </a.div>

      {/* Verso do card */}
      <a.div
        className="project-card-back"
        style={{
          opacity,
          transform: transform.to(t => `${t} rotateX(180deg)`),
          position: 'absolute',
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(30, 41, 59, 0.95)',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backfaceVisibility: 'hidden',
          color: 'white'
        }}
      >
        <div>
          <h3 style={{ margin: '0 0 10px 0', color: '#f1f5f9', fontSize: '18px' }}>
            {project.title}
          </h3>
          <p style={{ margin: '0 0 15px 0', color: '#cbd5e1', fontSize: '14px', lineHeight: '1.4' }}>
            {project.details}
          </p>

          {project.features && (
            <ul style={{ margin: '0', padding: '0 0 0 15px', color: '#e2e8f0', fontSize: '12px', listStyleType: 'none',  lineHeight: '1.4' }}>
              {project.features.map((feature, idx) => (
                <li key={idx} style={{ marginBottom: '5px' }}>{feature}</li>
              ))}
            </ul>
          )}
        </div>

        <div className='container-btn-projects' style={{ display: 'flex' }}>
          {project.githubUrl && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(project.githubUrl, '_blank');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
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
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
            >
              <FaExternalLinkAlt /> Demo
            </button>
          )}
        </div>
      </a.div>
    </div>
  );
}

export default function Projects() {
  // Função placeholder para botão GitHub (será controlada pelas classes)
  const enviarDados = () => console.log('📊 Botão GitHub clicado em Projects');

  // Dados dos projetos
  const projects = [
    {
      title: "Portfolio Interativo",
      description: "Portfolio pessoal com analytics em tempo real e monitoramento de interações do usuário.",
      details: "Sistema completo de portfolio com coleta de dados de interação, heatmaps e analytics temporais usando InfluxDB.",
      technologies: [
        { name: "React", icon: <FaReact /> },
        { name: "TypeScript", icon: <SiTypescript /> },
        { name: "InfluxDB", icon: <SiInfluxdb /> }
      ],
      features: [
        "Analytics em tempo real",
        "Heatmap de interações",
        "Dashboard de métricas",
        "Responsivo e acessível"
      ],
      githubUrl: "https://github.com/username/portfolio",
      demoUrl: "https://portfolio-demo.com"
    },
    {
      title: "Sistema de Heatmap",
      description: "Implementação de rastreamento de interações do usuário com mapas de calor e analytics.",
      details: "Sistema avançado para captura e visualização de padrões de comportamento do usuário em interfaces web.",
      technologies: [
        { name: "JavaScript", icon: <FaJs /> },
        { name: "Python", icon: <FaPython /> },
        { name: "Django", icon: <SiDjango /> }
      ],
      features: [
        "Captura de mouse tracking",
        "Geração de heatmaps",
        "Dashboard analítico",
        "API REST completa"
      ],
      githubUrl: "https://github.com/username/heatmap-system",
      demoUrl: "https://heatmap-demo.com"
    },
    {
      title: "API de Analytics",
      description: "Backend robusto para coleta e processamento de dados analíticos em tempo real.",
      details: "API escalável construída com Django e PostgreSQL para processamento de grandes volumes de dados.",
      technologies: [
        { name: "Python", icon: <FaPython /> },
        { name: "Django", icon: <SiDjango /> },
        { name: "PostgreSQL", icon: <SiPostgresql /> }
      ],
      features: [
        "Processamento em tempo real",
        "Autenticação JWT",
        "Rate limiting",
        "Documentação Swagger"
      ],
      githubUrl: "https://github.com/username/analytics-api"
    },
    {
      title: "Dashboard InfluxDB",
      description: "Interface de visualização para métricas temporais coletadas via InfluxDB.",
      details: "Dashboard interativo para visualização de séries temporais com gráficos dinâmicos e alertas.",
      technologies: [
        { name: "React", icon: <FaReact /> },
        { name: "TypeScript", icon: <SiTypescript /> },
        { name: "InfluxDB", icon: <SiInfluxdb /> }
      ],
      features: [
        "Gráficos em tempo real",
        "Alertas personalizados",
        "Queries Flux",
        "Export de dados"
      ],
      githubUrl: "https://github.com/username/influx-dashboard",
      demoUrl: "https://influx-dashboard-demo.com"
    }
  ];

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', height: '100%', width: '100%', marginLeft: '2%' }}>
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
            <p id="projects_description" style={{ color: '#0b1220', textAlign: 'center', fontSize: '14px' }}>
              Clique nos cards para ver mais detalhes de cada projeto.
            </p>

            <div
              id="projects_list"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '50px 0px',
                width: '100%',
                height: 'fit-content'
              }}
            >
              {projects.map((project, index) => (
                <ProjectCard
                  key={index}
                  project={project}
                  index={index}
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