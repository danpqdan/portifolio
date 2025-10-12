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

    const handleEnded = () => {
      window.dispatchEvent(new CustomEvent('torre:ended'));
      if (onEnded) onEnded();
    };

    v.addEventListener('play', handlePlay);
    v.addEventListener('ended', handleEnded);

    // try to play the video (unmuted if possible). If autoplay with sound is blocked, fallback to muted play.
    const tryPlay = async () => {
      try {
        v.muted = false;
        v.currentTime = 0;
        await v.play();
      } catch {
        // fallback to muted play if unmuted autoplay is blocked
        try {
          v.muted = true;
          await v.play();
        } catch {
          // ignore final failure
        }
      }
    };

    tryPlay();

    return () => {
      v.removeEventListener('play', handlePlay);
      v.removeEventListener('ended', handleEnded);
    };
  }, [onEnded]);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100vh', zIndex: 20000, pointerEvents: 'none' }}>
      <video
        ref={ref}
        src={torre}
        playsInline
        style={{ width: '100%', height: '100vh', objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}
