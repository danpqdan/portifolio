import { useEffect, useState } from 'react';
import BackGround from "./BackGround";
import SlidesCarousel from './components/SlidesCarousel';
import Home from './pages/Home';
import Projects from './pages/Projects';
import About from './pages/About';
import { iniciarAnalytics } from './sdk';
import { WEBSOCKET_URL, DEBUG_ENABLED, NODE_ENV } from './config.js';

const AMBIENTES_SUPORTADOS = ['development', 'test', 'staging', 'production'];
const ambiente = AMBIENTES_SUPORTADOS.includes(NODE_ENV) ? NODE_ENV : 'development';

iniciarAnalytics({
  websocketUrl: WEBSOCKET_URL,
  appId: 'portfolio-local',
  ambiente,
  debug: DEBUG_ENABLED,
  intervaloEnvioMs: 5000,
});

export default function App() {
  const [showUi, setShowUi] = useState(false);

  useEffect(() => {
    const onTorreStarted = () => setShowUi(true);
    window.addEventListener('torre:started', onTorreStarted);

    const handleBeforeUnload = () => {
      const controller = window.__ACTIVE_PAGE_CONTROLLER__;
      if (controller && typeof controller.parar === 'function') {
        controller.parar();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('torre:started', onTorreStarted);
      window.removeEventListener('beforeunload', handleBeforeUnload);
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
