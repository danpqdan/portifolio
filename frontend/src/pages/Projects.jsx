export default function Projects() {
  // Função placeholder para botão GitHub (será controlada pelas classes)
  const enviarDados = () => console.log('📊 Botão GitHub clicado em Projects');

  // Função para debug do WebSocket
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', height: '100%', width: '100%', marginLeft: '2%' }}>
      <div id="projects_card" className="card-carousel project-card" >
        <h1 id="projects_title">Projetos</h1>
        <p id="projects_description">Aqui estão alguns projetos.</p>

        <div id="projects_list">
          <div id="projects_item_1" className="project-item">
            <h3 id="projects_item_1_title">Portfolio Pessoal</h3>
            <p id="projects_item_1_description">Este projeto demonstra uma aplicação React com monitoramento de interação do usuário.</p>
            <div id="projects_item_1_tech" className="project-tech">
              <span id="projects_item_1_tech_react">React</span>
              <span id="projects_item_1_tech_ts">TypeScript</span>
            </div>
          </div>

          <div id="projects_item_2" className="project-item">
            <h3 id="projects_item_2_title">Sistema de Heatmap</h3>
            <p id="projects_item_2_description">Implementação de rastreamento de interações do usuário com mapas de calor.</p>
            <div id="projects_item_2_tech" className="project-tech">
              <span id="projects_item_2_tech_js">JavaScript</span>
              <span id="projects_item_2_tech_analytics">Analytics</span>
            </div>
          </div>
        </div>

        <div id="projects_actions" className="card-actions">
          <button id="projects_btn_view" className="primary-btn">Ver todos os projetos</button>
          <button id="projects_btn_github" className="secondary-btn" onClick={enviarDados}>GitHub</button>
        </div>

      </div>
    </div>
  );
}