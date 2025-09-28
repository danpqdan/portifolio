import { SiGrafana, SiRedux } from 'react-icons/si';
import { FaReact, FaIcons, FaFonticons } from "react-icons/fa";
import { TbBrandVite } from "react-icons/tb";
import '../styles/cards.css';
import '../styles/home.css';
import analytics from '../lib/analyticsCache';
import { useEffect } from 'react';



export default function Home() {
  useEffect(() => {
    analytics.startPageTimer('home');
    analytics.increment('view_home');
    return () => {
      analytics.stopPageTimer('home');
    };
  }, []);
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', height: '100%', width: '100%', marginLeft: '12px' }}>
      <div className="card-carousel home-card">
        {/* header */}
        <div className="card-header home-header">
          <h1>Portfólio Pessoal — Controle de Dados</h1>
        </div>
        {/* content (scrollable) */}
        <div
          onWheel={(e) => { e.stopPropagation(); }}
          onTouchMove={(e) => { e.stopPropagation(); }}
          className="card-content"
        >
          <h3 style={{ marginTop: 6, color: '#334155' }}>O projeto</h3>
          <p>
            Este portfólio pessoal inclui um componente para controle de dados e estatísticas (visualizáveis via Grafana <SiGrafana style={{ color: '#f76b1c', verticalAlign: 'middle', marginLeft: 6 }} />). A ideia é centralizar métricas e eventos relevantes sobre projetos e interações dos visitantes, transformando-os em dashboards que ajudam a entender o comportamento, medir impacto e tomar decisões informadas.
          </p>

          <h3 style={{ marginTop: 6, color: '#334155' }}>Por que ter uma página pessoal?</h3>
          <p>
            Uma página pessoal funciona como vitrine e central de contatos para profissionais que oferecem serviços. Ela ajuda a construir credibilidade mostrando projetos, resultados e habilidades de forma clara e acessível. Além disso, uma página própria permite apresentar estudos de caso, destacar integrações (como o uso do Grafana para monitoramento) e oferecer caminhos diretos para contratação — tudo isso melhora a percepção de valor e facilita a aquisição de clientes.
          </p>

          <p>
            Se você presta serviços técnicos, um portfólio atualizado e um painel de estatísticas demonstram não apenas know-how, mas também compromisso com qualidade e transparência dos resultados. Este portfólio pessoal foi desenvolvido com foco em exibir métricas e facilitar a apresentação de resultados a clientes.
          </p>

          <h3 style={{ marginTop: 6, color: '#334155' }}>Integrações e bibliotecas usadas</h3>
          <p>
            Todas as integrações apresentadas aqui são realizadas com React como base. O fluxo de dados e estado global é gerenciado com Redux (ou uma variação leve do mesmo, conforme necessidade). Para ícones e pequenos componentes visuais usamos <strong>react-icons</strong>. O projeto foi iniciado com Vite para obter builds rápidos em desenvolvimento.
          </p>

        </div>

        {/* footer */}
        <div className="home-footer">
          <a className="tech-btn" href="https://grafana.com/" target="_blank" rel="noopener noreferrer" onClick={() => { analytics.increment('clicks_info'); analytics.increment('clicks_geral'); }}>
            <SiGrafana style={{ color: '#f76b1c' }} /> Abrir Grafana
          </a>
          <a className="tech-btn" href="https://react.dev/" target="_blank" rel="noopener noreferrer" onClick={() => { analytics.increment('clicks_info'); analytics.increment('clicks_geral'); }}>
            <FaReact style={{ color: '#61dafb' }} /> React
          </a>
          <a className="tech-btn" href="https://redux.js.org/" target="_blank" rel="noopener noreferrer" onClick={() => { analytics.increment('clicks_info'); analytics.increment('clicks_geral'); }}>
            <SiRedux style={{ color: '#764abc' }} /> Redux
          </a>
          <a className="tech-btn" href="https://react-icons.github.io/react-icons/" target="_blank" rel="noopener noreferrer" onClick={() => { analytics.increment('clicks_info'); analytics.increment('clicks_geral'); }}>
            <FaFonticons style={{ color: '#61dafb' }} /> react-icons
          </a>
          <a className="tech-btn" href="https://vite.dev/" target="_blank" rel="noopener noreferrer" onClick={() => { analytics.increment('clicks_info'); analytics.increment('clicks_geral'); }}>
            <TbBrandVite style={{ color: '#64b64f' }} /> Vite
          </a>
        </div>
      </div>
    </div >
  );
}
