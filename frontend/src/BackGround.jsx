import { useEffect, useRef, useState } from "react";
import rotacao from './assets/videos/earth_light.mp4';
import entrada from './assets/videos/entrada.mp4';
import TorreBackground from './components/TorreBackground';

export default function BackGround() {
  const videoRef = useRef(null);
  const entradaRef = useRef(null);
  const [stage, setStage] = useState('idle'); // 'idle' | 'entrada' | 'torre' | 'fade'

  // ▶️ Inicia o background rotativo
  useEffect(() => {
    const bg = videoRef.current;
    if (!bg) return;
    bg.muted = true;
    bg.loop = true;
    bg.play().catch(() => {});
  }, []);

  const handleStartProject = () => {
    // Pausa background e toca a entrada
    const bg = videoRef.current;
    if (bg) bg.pause();
    const ent = entradaRef.current;
    if (ent) {
      ent.currentTime = 0;
      ent.muted = true;
      ent.play().catch(() => {});
      setStage('entrada');
    }
  };

  // ▶️ Quando o vídeo de entrada termina
  useEffect(() => {
    const ent = entradaRef.current;
    if (!ent) return;
    const handleEnded = () => {
      setStage('fade');
      // Aguarda o fade preto e mostra torre
      requestAnimationFrame(() => {
        setTimeout(() => setStage('torre'), 1200);
      });
    };
    ent.addEventListener('ended', handleEnded);
    return () => ent.removeEventListener('ended', handleEnded);
  }, []);

  const commonVideoStyle = {
    width: '100%',
    height: '100vh',
    objectFit: 'cover',
    position: 'fixed',
    top: 0,
    left: 0,
    transition: 'opacity 0.8s ease',
  };

  return (
    <div className="background">

      {/* Botão */}
      <div style={{
        width: '100%',
        height: '50px',
        position: 'fixed',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        top: '10%',
        zIndex: 10
      }}>
        <button
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            color: 'white',
            fontSize: 24,
            fontWeight: 'bold',
            border: '1px solid white',
            borderRadius: 8,
            padding: '12px 36px',
            cursor: 'pointer'
          }}
          onClick={handleStartProject}
        >
          Iniciar Projeto
        </button>
      </div>

      {/* Background inicial */}
      <video
        ref={videoRef}
        src={rotacao}
        muted
        playsInline
        preload="auto"
        loop
        style={{
          ...commonVideoStyle,
          zIndex: -3,
          opacity: stage === 'idle' ? 1 : 0
        }}
      />

      {/* Vídeo de entrada */}
      <video
        ref={entradaRef}
        src={entrada}
        muted
        playsInline
        preload="auto"
        style={{
          ...commonVideoStyle,
          zIndex: stage === 'entrada' ? 5 : -2,
          opacity: stage === 'entrada' ? 1 : 0
        }}
      />

      {/* Fade preto */}
      <div
        style={{
          ...commonVideoStyle,
          backgroundColor: 'black',
          zIndex: stage === 'fade' ? 6 : -10,
          opacity: stage === 'fade' ? 1 : 0
        }}
      />

      {/* Torre */}
      {stage === 'torre' && (
        <TorreBackground onEnded={() => {}} />
      )}
    </div>
  );
}
