import { Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import CardNavbar from './navbar/CardNavbar.jsx';
import Home from '../pages/Home';
import Projects from '../pages/Projects';
import About from '../pages/About';

export default function NavRouter() {
  const [showNav, setShowNav] = useState(false);

  useEffect(() => {
    const onTorreStarted = () => setShowNav(true);
    window.addEventListener('torre:started', onTorreStarted);
    return () => window.removeEventListener('torre:started', onTorreStarted);
  }, []);

  return (
    <>
      {showNav && <CardNavbar />}
      {showNav && (
        <div style={{ position: 'relative', zIndex: 20000 }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </div>
      )}
    </>
  );
}
