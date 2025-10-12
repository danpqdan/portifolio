import { useEffect, useState } from 'react';
import BackGround from "./BackGround";
import SlidesCarousel from './components/SlidesCarousel';
import Home from './pages/Home';
import Projects from './pages/Projects';
import About from './pages/About';

export default function App() {
  const [showUi, setShowUi] = useState(false);

  useEffect(() => {
    const onTorreStarted = () => setShowUi(true);
    window.addEventListener('torre:started', onTorreStarted);
    return () => window.removeEventListener('torre:started', onTorreStarted);
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
