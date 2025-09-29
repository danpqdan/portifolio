import { useEffect, useRef, useState } from "react";
import rotacao from './assets/videos/earth_light.mp4';
import entrada from './assets/videos/entrada.mp4';
import TorreBackground from './components/TorreBackground';
import GrafanaPanel from './components/GrafanaPanel';

export default function BackGround() {
    const videoRef = useRef(null);
    const entradaRef = useRef(null);
    const [playingEntrada, setPlayingEntrada] = useState(false);
    const [showBlackFrame, setShowBlackFrame] = useState(false);
    const [blackFadeOut, setBlackFadeOut] = useState(false);
    const [showTorre, setShowTorre] = useState(false);
    const [blackTimeout, setBlackTimeout] = useState(null);
    const [showGrafanaOverlay, setShowGrafanaOverlay] = useState(false);
    const [grafanaDetail, setGrafanaDetail] = useState(null);

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

    // listen for grafana:show events
    useEffect(() => {
        const onGrafanaShow = (ev) => {
            setGrafanaDetail(ev && ev.detail ? ev.detail : null);
            setShowGrafanaOverlay(true);
        };
        window.addEventListener('grafana:show', onGrafanaShow);
        // also check sessionStorage on mount so a reload can trigger the overlay
        try {
            const raw = sessionStorage.getItem('grafana_show');
            if (raw) {
                const parsed = JSON.parse(raw);
                setGrafanaDetail(parsed || null);
                setShowGrafanaOverlay(true);
                sessionStorage.removeItem('grafana_show');
            }
        } catch {
            // ignore
        }

        return () => window.removeEventListener('grafana:show', onGrafanaShow);
    }, []);

    // cleanup black timeout if component unmounts
    useEffect(() => {
        return () => {
            if (blackTimeout) {
                clearTimeout(blackTimeout);
            }
        };
    }, [blackTimeout]);

    const handleStartProject = async () => {
        const bg = videoRef.current;
        const ent = entradaRef.current;
        if (!ent) return;
        try { bg.pause(); } catch { /* ignore */ }
        setPlayingEntrada(true);
        try { ent.currentTime = 0; } catch { /* ignore */ }
        ent.muted = false;
        try { await ent.play(); } catch { /* ignore */ }

        const onEnded = () => {
            setPlayingEntrada(false);
            setShowBlackFrame(true);
            const t = setTimeout(() => {
                setShowTorre(true);
                // notify other parts that Torre video is starting
                window.dispatchEvent(new CustomEvent('torre:started'));
                setBlackFadeOut(true);
                try { bg.pause(); } catch { /* ignore */ }
            }, 2000);

            setBlackTimeout(t);
            window.dispatchEvent(new CustomEvent('entrada:ended'));
            ent.removeEventListener('ended', onEnded);
        };

        ent.addEventListener('ended', onEnded);
    };

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
            <div style={overlayStyle} aria-hidden={!playingEntrada}>
                <video
                    ref={entradaRef}
                    src={entrada}
                    className="entrada-video"
                    playsInline
                    style={{
                        width: '100%',
                        height: '100vh',
                        objectFit: 'cover'
                    }}
                />
            </div>
            {showBlackFrame && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100vh',
                        backgroundColor: 'black',
                        zIndex: 10001,
                        opacity: blackFadeOut ? 0 : 1,
                        transition: 'opacity 1s ease'
                    }}
                />
            )}

            {/* Grafana overlay */}
            {showGrafanaOverlay && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ position: 'relative', width: '90%', maxWidth: 1200, height: '80%', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
                        <button onClick={() => setShowGrafanaOverlay(false)} style={{ position: 'absolute', right: 8, top: 8, zIndex: 20100, padding: '6px 10px' }}>Fechar</button>
                        {
                            grafanaDetail && grafanaDetail.influx && grafanaDetail.influx.gotoUrl
                                ? <GrafanaPanel fullSrc={grafanaDetail.influx.gotoUrl} />
                                : <GrafanaPanel
                                    dashboardUid={grafanaDetail && grafanaDetail.influx && grafanaDetail.influx.dashboardUid ? grafanaDetail.influx.dashboardUid : 'adtkx5l'}
                                    dashboardSlug={grafanaDetail && grafanaDetail.influx && grafanaDetail.influx.dashboardSlug ? grafanaDetail.influx.dashboardSlug : 'influx'}
                                    panelId={grafanaDetail && grafanaDetail.influx && grafanaDetail.influx.panelId ? grafanaDetail.influx.panelId : 1}
                                    from="now-24h"
                                    to="now"
                                />
                        }
                    </div>
                </div>
            )}

            {showTorre && (
                <TorreBackground onEnded={() => {
                    window.dispatchEvent(new CustomEvent('torre:ended'));
                }} />
            )}
        </div>
    );
}
