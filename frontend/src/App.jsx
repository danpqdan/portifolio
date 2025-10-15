import { useEffect, useState } from 'react';
import BackGround from "./BackGround";
import SlidesCarousel from './components/SlidesCarousel';
import Home from './pages/Home';
import Projects from './pages/Projects';
import About from './pages/About';
import WebSocketService from './utils/WebSocketService.tsx';
import { HeatmapUtils } from './utils/HeatmapUtils.tsx';

export default function App() {
  const [showUi, setShowUi] = useState(false);

  useEffect(() => {
    WebSocketService.connect();

    const onTorreStarted = () => {
      setTimeout(() => setShowUi(true), 300); // espera o fade terminar
    };

    window.addEventListener('torre:started', onTorreStarted);

    const handleBeforeUnload = () => {
      const dadosFinais = HeatmapUtils.getDadosGlobais();
      WebSocketService.sendAnalyticsData(dadosFinais);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('torre:started', onTorreStarted);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      WebSocketService.disconnect();
    };
  }, []);

  return (
    <div id="app" style={{
      height: '100vh', width: '100vw', overflow: 'hidden', position: 'relative', display: 'flex'
    }}>
      <BackGround />
      {showUi && (
        <div style={{ position: 'relative', zIndex: 20000, width: '100%' }}>
          <SlidesCarousel slides={[
            { path: '/', element: <Home /> },
            { path: '/projects', element: <Projects /> },
            { path: '/about', element: <About /> },
          ]} />
        </div>
      )}
    </div>
  );
}