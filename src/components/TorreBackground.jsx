import { useEffect, useRef } from "react";
import torre from '../assets/videos/torre_eifield.mp4';

export default function TorreBackground({ onEnded }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      if (onEnded) onEnded();
    };

    const onLoaded = () => {
      try { video.muted = false; } catch { /* ignore */ }
      video.play().catch(() => { /* ignore autoplay errors */ });
    };

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('ended', handleEnded);
    };
  }, [onEnded]);

  return (
    <video
      ref={videoRef}
      src={torre}
      className="torre-background"
      loop
      playsInline
      style={{
        width: '100%',
        height: '100vh',
        objectFit: 'cover',
        position: 'fixed',
        top: 0,
            left: 0,
            zIndex: 10000,
      }}
    />
  );
}
