import { useEffect, useRef } from 'react';
import torre from '../assets/videos/torre_eifield.mp4';

export default function TorreBackground({ onEnded }) {
  const ref = useRef(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    const handleLoaded = async () => {
      try {
        v.muted = true;
        v.loop = true;
        await v.play();
        // ✅ dispara o evento APÓS o primeiro frame visível
        window.dispatchEvent(new CustomEvent('torre:started'));
      } catch (error) {
        console.warn("Erro ao iniciar vídeo da torre:", error);
      }
    };

    v.addEventListener('loadeddata', handleLoaded);

    return () => {
      v.removeEventListener('loadeddata', handleLoaded);
      v.pause();
    };
  }, []);

  const getVideoStyle = () => ({
    width: '100%',
    height: '100vh',
    objectFit: 'cover',
    objectPosition: window.innerWidth < 380 ? '75% center' : 'center',
    display: 'block',
  });

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100vh',
      zIndex: 20000,
      pointerEvents: 'none',
      overflow: 'hidden'
    }}>
      <video
        ref={ref}
        src={torre}
        muted
        loop
        playsInline
        preload="auto"
        style={getVideoStyle()}
      />
    </div>
  );
}
