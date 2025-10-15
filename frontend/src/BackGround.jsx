import { useEffect, useRef, useState } from "react";
import rotacao from './assets/videos/earth_light.mp4';
import entrada from './assets/videos/entrada.mp4';
import TorreBackground from './components/TorreBackground';

export default function BackGround() {
    const videoRef = useRef(null);
    const entradaRef = useRef(null);
    const [playingEntrada, setPlayingEntrada] = useState(false);
    const [showBlackFrame, setShowBlackFrame] = useState(false);
    const [blackFadeOut, setBlackFadeOut] = useState(false);
    const [showTorre, setShowTorre] = useState(false);
    const [blackTimeout, setBlackTimeout] = useState(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onLoadedMetadata = () => {
            video.muted = true;
            video.play().catch(() => { /* ignore autoplay errors */ });
        };

        video.addEventListener('loadedmetadata', onLoadedMetadata);

        return () => {
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
        };
    }, []);

    useEffect(() => {
        return () => {
            if (blackTimeout) {
                clearTimeout(blackTimeout);
            }
        };
    }, [blackTimeout]);

    useEffect(() => {
        if (playingEntrada) {
            const ent = entradaRef.current;
            if (ent) {
                ent.currentTime = 0;
                ent.muted = true;
                ent.play().catch(() => { });
                const onEnded = () => {
                    setPlayingEntrada(false);
                    setShowBlackFrame(true);
                    const t = setTimeout(() => {
                        setShowTorre(true);
                        window.dispatchEvent(new CustomEvent('torre:started'));
                        setBlackFadeOut(true);
                        videoRef.current?.pause();
                    }, 2000);
                    setBlackTimeout(t);
                    window.dispatchEvent(new CustomEvent('entrada:ended'));
                    ent.removeEventListener('ended', onEnded);
                };
                ent.addEventListener('ended', onEnded);
            }
        }
        // Limpeza do timeout já está em outro useEffect
    }, [playingEntrada]);

    const handleStartProject = () => {
        videoRef.current?.pause();
        setPlayingEntrada(true);
    };

    useEffect(() => {
        const bg = videoRef.current;
        const ent = entradaRef.current;

        return () => {
            if (bg) {
                bg.pause();
                bg.src = "";
            }
            if (ent) {
                ent.pause();
                ent.src = "";
            }
        };
    }, []);


    var styleContent = {
        width: '100%',
        height: '50px',
        objectFit: 'cover',
        position: 'fixed',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        top: '10%',
        left: 0,
        zIndex: 2,
        transformOrigin: 'center center'
    }

    var styleTitle = {
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        cursor: 'pointer',
        color: 'white',
        textAlign: 'center',
        lineHeight: '50px',
        fontSize: '24px',
        fontWeight: 'bold',
        border: '1px solid white',
        borderRadius: '8px',
        padding: '12px 36px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
    }

    const overlayStyle = {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100vh',
        zIndex: 9999,
        display: playingEntrada ? 'flex' : 'none',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)'
    };
    const blackFrameStyle = {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100vh',
        backgroundColor: 'black',
        zIndex: 10000,
        opacity: blackFadeOut ? 0 : 1,
        transition: 'opacity 1s ease'
    };

    return (
        <div className="background">
            <div className="content" style={styleContent}>
                <button className="title" id="iniciar-projeto" style={styleTitle} onClick={handleStartProject}>Iniciar Projeto</button>
            </div>
            <video
                ref={videoRef}
                src={rotacao}
                className="background-video"
                muted
                playsInline
                loop
                style={{
                    width: '100%',
                    height: '100vh',
                    objectFit: 'cover',
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    zIndex: -1,
                    transformOrigin: 'center center'
                }}
            />
            {playingEntrada && (
                <div style={overlayStyle} aria-hidden={!playingEntrada}>
                    <video
                        ref={entradaRef}
                        src={entrada}
                        className="entrada-video"
                        muted
                        playsInline
                        style={{
                            width: '100%',
                            height: '100vh',
                            objectFit: 'cover'
                        }}
                    />
                </div>
            )}
            {showBlackFrame && (
                <div style={blackFrameStyle} />
            )}
            {showTorre && (
                <TorreBackground onEnded={() => {
                    window.dispatchEvent(new CustomEvent('torre:ended'));
                }} />
            )}
        </div>
    );
}