import analytics from '../lib/analyticsCache';
import { useEffect } from 'react';

export default function Projects(){
  useEffect(() => {
    analytics.startPageTimer('projects');
    analytics.increment('view_projects');
    return () => analytics.stopPageTimer('projects');
  }, []);

  const handleClick = () => {
    analytics.increment('clicks_projects');
    analytics.increment('projects_acessados');
    analytics.increment('clicks_geral');
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', height: '100%', width: '100%', marginLeft: '12px' }}>
      <div onClick={handleClick} className="card-carousel project-card" style={{ width: '70%', height: '80vh', backgroundColor: 'rgba(192, 189, 189, 0.61)', padding: 24, color: 'black', boxSizing: 'border-box', borderRadius: '8px', cursor: 'pointer' }}>
        <h1>Projetos</h1>
        <p>Aqui estão alguns projetos.</p>
      </div>
    </div>
  )
}
