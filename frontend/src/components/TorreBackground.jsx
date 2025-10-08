import { useEffect, useRef } from 'react';
import torre from '../assets/videos/torre_eifield.mp4';

export default function TorreBackground({ onEnded }) {
  const ref = useRef(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    const handlePlay = () => {
      // notify that torre started (some callers already dispatch this, but keep for robustness)
      window.dispatchEvent(new CustomEvent('torre:started'));
    };

    v.addEventListener('play', handlePlay);

    const tryPlay = async () => {
      try {
        v.muted = true; // ✅ SEMPRE MUDO
        v.loop = true;  // ✅ LOOP INFINITO
        v.currentTime = 0;
        await v.play();
      } catch (error) {
        console.log('Erro ao reproduzir vídeo Torre:', error);
        // ignore final failure
      }
    };

    tryPlay();

    return () => {
      v.removeEventListener('play', handlePlay);
    };
  }, [onEnded]);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100vh', zIndex: 20000, pointerEvents: 'none' }}>
      <video
        ref={ref}
        src={torre}
        muted
        loop
        playsInline
        style={{ width: '100%', height: '100vh', objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}