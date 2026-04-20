import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';

import { createPortal } from 'react-dom';
import ClasseAbout from '../classe/ClasseAbout';
import ClasseHome from '../classe/ClasseHome';
import ClasseProjects from '../classe/ClasseProjects';

// Horizontal carousel using translateX; slides have no visible scroll (overflow: hidden)
export default function SlidesCarousel({ slides }) {
    const [index, setIndex] = useState(0);
    const [cardNodesVersion, setCardNodesVersion] = useState(0);
    const wrapperRef = useRef(null);
    const containerRef = useRef(null);
    const lastTimeRef = useRef(0);
    const indexRef = useRef(index);
    useEffect(() => {
        indexRef.current = 0;
        setIndex(0);
    }, [slides]);

    useEffect(() => {
        const onTorreStarted = () => {
            indexRef.current = 0;
            setIndex(0);
        };
        window.addEventListener('torre:started', onTorreStarted);
        return () => window.removeEventListener('torre:started', onTorreStarted);
    }, [slides]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const onWheel = (e) => {
            const now = Date.now();
            if (now - lastTimeRef.current < 450) return; // throttle
            const delta = e.deltaY;
            if (delta === 0) return;

            e.preventDefault();
            lastTimeRef.current = now;
            setIndex(i => {
                const next = delta > 0 ? Math.min(i + 1, slides.length - 1) : Math.max(i - 1, 0);
                indexRef.current = next;
                return next;
            });
        };

        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [slides.length]);

    // touch swipe (horizontal)
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        let startX = 0;
        let startTime = 0;

        const onTouchStart = (e) => { startX = e.touches[0].clientX; startTime = Date.now(); };
        const onTouchMove = () => { /* noop to allow browser behavior */ };
        const onTouchEnd = (e) => {
            const endX = e.changedTouches[0].clientX;
            const diff = startX - endX;
            const dt = Date.now() - startTime;
            if (Math.abs(diff) > 50 && dt < 1000) {
                if (diff > 0) {
                    setIndex(i => { const next = Math.min(i + 1, slides.length - 1); indexRef.current = next; return next; });
                } else {
                    setIndex(i => { const prev = Math.max(i - 1, 0); indexRef.current = prev; return prev; });
                }
            }
        };

        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: true });
        el.addEventListener('touchend', onTouchEnd);
        return () => {
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
        };
    }, [slides.length]);

    // no routing sync: carousel manages its own state and keeps page at top when switching
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'auto' });
    }, [index, cardNodesVersion, slides]);

    // apply translateX on wrapper
    useEffect(() => {
        const w = wrapperRef.current;
        if (!w) return;
        w.style.transition = 'transform 0.8s cubic-bezier(.22,.9,.2,1)';
        w.style.transform = `translateX(${-index * 100}vw)`;
        indexRef.current = index;
    }, [index]);

    // start/stop analytics timers based on visible slide
    const visiblePageRef = useRef(null);
    const classeAboutRef = useRef(null);
    const aboutRootRef = useRef(null);
    const classeHomeRef = useRef(null);
    const homeRootRef = useRef(null);
    const classeProjectsRef = useRef(null);
    const projectsRootRef = useRef(null);
    const cardNodesRef = useRef(new Map());
    const removeTimersRef = useRef(new Map());

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        
        // Detectar se é dispositivo touch
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        // Se for dispositivo touch, não adicionar eventos de mouse
        if (isTouchDevice) {
            return;
        }
        
        let isDragging = false;
        let startX = 0;
        let startTime = 0;

        const onMouseDown = (e) => {
            isDragging = true;
            startX = e.clientX;
            startTime = Date.now();
            el.style.cursor = 'grabbing';
            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
        };

        const onMouseUp = (e) => {
            if (!isDragging) return;
            isDragging = false;
            el.style.cursor = 'grab';
            
            const endX = e.clientX;
            const diff = startX - endX;
            const dt = Date.now() - startTime;
            
            // Se movimento > 50px e tempo < 1s, considerar como swipe
            if (Math.abs(diff) > 50 && dt < 1000) {
                if (diff > 0) {
                    // Drag para esquerda = próximo slide
                    setIndex(i => { 
                        const next = Math.min(i + 1, slides.length - 1); 
                        indexRef.current = next; 
                        return next; 
                    });
                } else {
                    // Drag para direita = slide anterior
                    setIndex(i => { 
                        const prev = Math.max(i - 1, 0); 
                        indexRef.current = prev; 
                        return prev; 
                    });
                }
            }
        };

        const onMouseLeave = () => {
            if (isDragging) {
                isDragging = false;
                el.style.cursor = 'grab';
            }
        };

        // Adicionar cursor grab por padrão
        el.style.cursor = 'grab';
        
        el.addEventListener('mousedown', onMouseDown);
        el.addEventListener('mousemove', onMouseMove);
        el.addEventListener('mouseup', onMouseUp);
        el.addEventListener('mouseleave', onMouseLeave);
        
        return () => {
            el.removeEventListener('mousedown', onMouseDown);
            el.removeEventListener('mousemove', onMouseMove);
            el.removeEventListener('mouseup', onMouseUp);
            el.removeEventListener('mouseleave', onMouseLeave);
        };
    }, [slides.length]);

    // ✅ TOUCH SWIPE para mobile - MELHORADO para prevenir conflitos
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        
        let startX = 0;
        let startTime = 0;
        let isScrolling = false;

        const onTouchStart = (e) => {
            startX = e.touches[0].clientX;
            startTime = Date.now();
            isScrolling = false;
        };

        const onTouchMove = (e) => {
            if (!startX) return;
            
            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            const diffX = Math.abs(startX - currentX);
            const diffY = Math.abs(e.touches[0].clientY - (e.touches[0].clientY - currentY));
            
            // Determinar direção do movimento
            if (!isScrolling) {
                if (diffY > diffX) {
                    // Movimento vertical - permitir scroll
                    isScrolling = true;
                } else if (diffX > 10) {
                    // Movimento horizontal - prevenir scroll e ativar swipe
                    e.preventDefault();
                }
            }
        };

        const onTouchEnd = (e) => {
            if (!startX || isScrolling) {
                startX = 0;
                return;
            }
            
            const endX = e.changedTouches[0].clientX;
            const diff = startX - endX;
            const dt = Date.now() - startTime;
            
            // Reset
            startX = 0;
            
            // Se movimento > 50px e tempo < 1s, considerar como swipe
            if (Math.abs(diff) > 50 && dt < 1000) {
                if (diff > 0) {
                    // Swipe para esquerda = próximo slide
                    setIndex(i => {
                        const next = Math.min(i + 1, slides.length - 1);
                        indexRef.current = next;
                        return next;
                    });
                } else {
                    // Swipe para direita = slide anterior
                    setIndex(i => {
                        const prev = Math.max(i - 1, 0);
                        indexRef.current = prev;
                        return prev;
                    });
                }
            }
        };

        const onTouchCancel = () => {
            startX = 0;
            isScrolling = false;
        };

        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd, { passive: true });
        el.addEventListener('touchcancel', onTouchCancel, { passive: true });

        return () => {
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
            el.removeEventListener('touchcancel', onTouchCancel);
        };
    }, [slides.length]);

    useEffect(() => {
        const slide = slides && slides[index];
        visiblePageRef.current = normalizarPageId(slide, index);

    }, [index, slides]);

    // manage page analytics lifecycle when the visible slide changes
    useEffect(() => {
        const slide = slides && slides[index];
        const page = normalizarPageId(slide, index);
        visiblePageRef.current = page;
        // find the card-carousel node for the current slide from the reported map
        const cardNode = cardNodesRef.current.get(index) || null;

        // manage page-specific controllers based on route path
        if (page === '/') {
            homeRootRef.current = cardNode || null;

            if (homeRootRef.current) {
                if (!classeHomeRef.current) {
                    classeHomeRef.current = new ClasseHome(homeRootRef.current);
                }

                if (classeHomeRef.current instanceof ClasseHome) {
                    if (!classeHomeRef.current.executando) {
                        try {
                            classeHomeRef.current.iniciar();
                        } catch { // pass
                        }
                    }
                } else {
                    //
                }
            }
        } else {
            if (classeHomeRef.current) {
                try {
                    classeHomeRef.current.parar();
                } catch {
                    //
                }
            }
        }

        if (page === '/about') {
            // only start when we have a real cardNode to attach to
            aboutRootRef.current = cardNode || null;
            if (aboutRootRef.current) {
                if (!classeAboutRef.current) {
                    classeAboutRef.current = new ClasseAbout(aboutRootRef.current);
                    try {
                        // Tentar iniciar - verificando qual método está disponível
                        if (typeof classeAboutRef.current.iniciar === 'function') {
                            classeAboutRef.current.iniciar();
                        } else if (typeof classeAboutRef.current.start === 'function') {
                            classeAboutRef.current.start();
                        }
                    } catch {
                        //
                    }
                } else {
                    if (classeAboutRef.current.root !== aboutRootRef.current)
                        classeAboutRef.current.root = aboutRootRef.current;

                    // Verificar se está executando
                    const isRunning =
                        (typeof classeAboutRef.current.executando === 'boolean' && classeAboutRef.current.executando) ||
                        (typeof classeAboutRef.current.running === 'boolean' && classeAboutRef.current.running);

                    if (!isRunning) {
                        try {
                            if (typeof classeAboutRef.current.iniciar === 'function') {
                                classeAboutRef.current.iniciar();
                            } else if (typeof classeAboutRef.current.start === 'function') {
                                classeAboutRef.current.start();
                            }
                        } catch {
                            //
                        }
                    }
                }
            }
        } else {
            if (classeAboutRef.current) {
                try {
                    if (typeof classeAboutRef.current.parar === 'function') {
                        classeAboutRef.current.parar();
                    } else if (typeof classeAboutRef.current.stop === 'function') {
                        classeAboutRef.current.stop();
                    }
                } catch {
                    //
                }
            }
        }

        if (page === '/projects') {
            projectsRootRef.current = cardNode || null;
            if (projectsRootRef.current) {
                if (!classeProjectsRef.current) {
                    classeProjectsRef.current = new ClasseProjects(projectsRootRef.current);
                    try {
                        if (typeof classeProjectsRef.current.iniciar === 'function') {
                            classeProjectsRef.current.iniciar();
                        } else if (typeof classeProjectsRef.current.start === 'function') {
                            classeProjectsRef.current.start();
                        }
                    } catch {
                        //
                    }
                } else {
                    if (classeProjectsRef.current.root !== projectsRootRef.current)
                        classeProjectsRef.current.root = projectsRootRef.current;

                    // Verificar se está executando
                    const isRunning =
                        (typeof classeProjectsRef.current.executando === 'boolean' && classeProjectsRef.current.executando) ||
                        (typeof classeProjectsRef.current.running === 'boolean' && classeProjectsRef.current.running);

                    if (!isRunning) {
                        try {
                            if (typeof classeProjectsRef.current.iniciar === 'function') {
                                classeProjectsRef.current.iniciar();
                            } else if (typeof classeProjectsRef.current.start === 'function') {
                                classeProjectsRef.current.start();
                            }
                        } catch {
                            //
                        }
                    }
                }
            }
        } else {
            if (classeProjectsRef.current) {
                try {
                    if (typeof classeProjectsRef.current.parar === 'function') {
                        classeProjectsRef.current.parar();
                    } else if (typeof classeProjectsRef.current.stop === 'function') {
                        classeProjectsRef.current.stop();
                    }
                } catch {
                    //
                }
            }
        }
    }, [index, cardNodesVersion, slides]);

    const handleNodeReady = useCallback((idx, node) => {
        const map = cardNodesRef.current;
        const timers = removeTimersRef.current;
        // if a pending remove timer exists for this idx, cancel it when node returns
        const pending = timers.get(idx);
        if (pending) {
            clearTimeout(pending);
            timers.delete(idx);
        }

        if (node) {
            map.set(idx, node);
            setCardNodesVersion(v => v + 1);
            return;
        }

        // schedule removal after short delay -- avoids transient stop/start caused by remount/double-render in dev
        const t = setTimeout(() => {
            try {
                map.delete(idx);
                setCardNodesVersion(v => v + 1);
            } finally {
                removeTimersRef.current.delete(idx);
            }
        }, 150);
        timers.set(idx, t);
    }, []);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'ArrowRight') {
                setIndex(i => { const next = Math.min(i + 1, slides.length - 1); indexRef.current = next; return next; });
            } else if (e.key === 'ArrowLeft') {
                setIndex(i => { const prev = Math.max(i - 1, 0); indexRef.current = prev; return prev; });
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [slides.length]);

    // cleanup ClasseAbout on unmount
    useEffect(() => {
        return () => {
            if (classeAboutRef.current) {
                try {
                    if (typeof classeAboutRef.current.parar === 'function') {
                        classeAboutRef.current.parar();
                    } else if (typeof classeAboutRef.current.stop === 'function') {
                        classeAboutRef.current.stop();
                    }
                } catch {
                    //
                }
            }
            if (classeHomeRef.current) {
                try {
                    if (typeof classeHomeRef.current.parar === 'function') {
                        classeHomeRef.current.parar();
                    } else if (typeof classeHomeRef.current.stop === 'function') {
                        classeHomeRef.current.stop();
                    }
                } catch {
                    //
                }
            }
            if (classeProjectsRef.current) {
                try {
                    if (typeof classeProjectsRef.current.parar === 'function') {
                        classeProjectsRef.current.parar();
                    } else if (typeof classeProjectsRef.current.stop === 'function') {
                        classeProjectsRef.current.stop();
                    }
                } catch {
                    // 
                }
            }
        };
    }, []);

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', touchAction: 'pan-y' }}>
            <div ref={wrapperRef} style={{ display: 'flex', flexDirection: 'row', width: `${slides.length * 100}vw`, height: '100vh', willChange: 'transform' }}>
                {slides.map((s, i) => (
                    <SlideItem key={s.path} slide={s} idx={i} total={slides.length}
                        goPrev={() => { setIndex(cur => { const prev = Math.max(cur - 1, 0); indexRef.current = prev; return prev; }); }}
                        goNext={() => { setIndex(cur => { const next = Math.min(cur + 1, slides.length - 1); indexRef.current = next; return next; }); }}
                        onNodeReady={handleNodeReady}
                    />
                ))}
            </div>
        </div>
    );
}

function normalizarPageId(slide, index) {
    const rawPageId = slide && (slide.path || slide.id || `/slide-${index}`);
    if (typeof rawPageId !== 'string') {
        return `/slide-${index}`;
    }

    const semQuery = rawPageId.split(/[?#]/)[0] || '/';
    return semQuery.startsWith('/') ? semQuery : `/${semQuery}`;
}

function SlideItem({ slide, idx, goPrev, goNext, onNodeReady }) {
    const rootRef = useRef(null);
    const [target, setTarget] = useState(null);

    useLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const node = root.querySelector('.card-carousel');
        if (node) {
            // ensure positioning so absolute buttons are relative to the card
            if (!node.style.position || node.style.position === 'static') node.style.position = 'relative';
            setTarget(node);
            if (onNodeReady) onNodeReady(idx, node);
        }
        return () => {
            // nothing to cleanup synchronously here
        };
    }, [idx, onNodeReady]);

    useEffect(() => {
        return () => {
            if (onNodeReady) onNodeReady(idx, null);
        };
    }, [idx, onNodeReady]);

    // button UI to be portaled into the card
    const controls = (
        <>
            <button id='prev-button' aria-label="previous" onClick={goPrev}
                style={{
                    position: "absolute",
                    left: "0px",
                    top: "50% ",
                    transform: "translateY(-50%)",
                    zIndex: 9999,
                    background: "transparent",
                    color: "rgb(255, 255, 255)",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px",
                    cursor: "pointer",
                    textAlign: "center",
                    display: "flex",
                    fontSize: "xxx-large"
                }}>
                ‹
            </button>
            <button id='next-button' aria-label="next" onClick={goNext}
                style={{
                    position: "absolute",
                    right: "0px",
                    top: "50% ",
                    transform: "translateY(-50%)",
                    zIndex: 9999,
                    background: "transparent",
                    color: "rgb(255, 255, 255)",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px",
                    cursor: "pointer",
                    textAlign: "center",
                    display: "flex",
                    fontSize: "xxx-large"
                }}>
                ›
            </button>
        </>
    );

    return (
        <div ref={rootRef} style={{ width: '100vw', height: '100vh', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>{slide.element}</div>
            {target && createPortal(controls, target)}
        </div>
    );
}
