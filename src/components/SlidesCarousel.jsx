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
        const slide = slides && slides[index];
        // derive a stable page key: prefer slide.path or slide.id, normalize it
        let pageKey = slide && (slide.path || slide.id || `slide_${index}`);
        console.debug('[SlidesCarousel] compute pageKey start', { index, slide });
        if (typeof pageKey === 'string') {
            // remove query/hash
            pageKey = pageKey.split(/[?#]/)[0];
            // strip leading slash
            if (pageKey.startsWith('/')) pageKey = pageKey.slice(1);
            // if root (''), treat as 'home'
            if (!pageKey) pageKey = 'home';
            // if it's a path with segments, use the last segment (e.g. 'foo/bar' -> 'bar')
            const parts = pageKey.split('/').filter(Boolean);
            pageKey = parts.length ? parts[parts.length - 1] : 'home';
        }
        console.debug('[SlidesCarousel] compute pageKey result', { index, pageKey });
        visiblePageRef.current = pageKey;

    }, [index, slides]);

    // manage ClasseAbout lifecycle when page becomes 'about'
    useEffect(() => {
        console.debug('[SlidesCarousel] lifecycle effect run', { index, cardNodesVersion });
        // compute page synchronously from slides[index] to avoid relying on async visiblePageRef
        const slide = slides && slides[index];
        let page = slide && (slide.path || slide.id || `slide_${index}`);
        if (typeof page === 'string') {
            page = page.split(/[?#]/)[0];
            if (page.startsWith('/')) page = page.slice(1);
            if (!page) page = 'home';
            const parts = page.split('/').filter(Boolean);
            page = parts.length ? parts[parts.length - 1] : 'home';
        }
        visiblePageRef.current = page;
        // find the card-carousel node for the current slide from the reported map
        const cardNode = cardNodesRef.current.get(index) || null;
        console.debug('[SlidesCarousel] lifecycle page/card snapshot', { page, index, cardNodeExists: !!cardNode, cardNodeKeys: Array.from(cardNodesRef.current.keys()) });

        // manage Home/About/Projects classes based on page key
        if (page === 'home') {
            homeRootRef.current = cardNode || null;

            if (homeRootRef.current) {
                if (!classeHomeRef.current) {
                    classeHomeRef.current = new ClasseHome(homeRootRef.current);
                }

                if (classeHomeRef.current instanceof ClasseHome) {
                    if (!classeHomeRef.current.executando) {
                        try {
                            classeHomeRef.current.iniciar();
                        } catch (e) {
                            console.debug('ClasseHome iniciar falhou', e);
                        }
                    }
                } else {
                    console.error('classeHomeRef.current não é uma instância de ClasseHome');
                }
            }
        } else {
            if (classeHomeRef.current) {
                try {
                    classeHomeRef.current.parar();
                } catch (e) {
                    console.debug('ClasseHome parar falhou', e);
                }
            }
        }
        if (page === 'about') {
            // only start when we have a real cardNode to attach to
            aboutRootRef.current = cardNode || null;
            if (aboutRootRef.current) {
                if (!classeAboutRef.current) {
                    classeAboutRef.current = new ClasseAbout(aboutRootRef.current);
                    try { classeAboutRef.current.start(); } catch (e) { console.debug('ClasseAbout start failed', e); }
                } else {
                    if (classeAboutRef.current.root !== aboutRootRef.current) classeAboutRef.current.root = aboutRootRef.current;
                    if (!classeAboutRef.current.running) try { classeAboutRef.current.start(); } catch (e) { console.debug('ClasseAbout start failed', e); }
                }
            }
        } else {
            if (classeAboutRef.current) {
                try { classeAboutRef.current.stop(); } catch (e) { console.debug('ClasseAbout stop failed', e); }
            }
        }

        if (page === 'projects') {
            projectsRootRef.current = cardNode || null;
            if (!classeProjectsRef.current) {
                classeProjectsRef.current = new ClasseProjects(projectsRootRef.current);
                try { classeProjectsRef.current.start(); } catch (e) { console.debug('ClasseProjects start failed', e); }
            } else {
                if (classeProjectsRef.current.root !== projectsRootRef.current) classeProjectsRef.current.root = projectsRootRef.current;
                if (!classeProjectsRef.current.running) try { classeProjectsRef.current.start(); } catch (e) { console.debug('ClasseProjects start failed', e); }
            }
        } else {
            if (classeProjectsRef.current) {
                try { classeProjectsRef.current.stop(); } catch (e) { console.debug('ClasseProjects stop failed', e); }
            }
        }

        // no explicit cleanup here; on unmount we'll stop below
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
            console.debug('[SlidesCarousel] node reported', { idx, hasNode: true });
            setCardNodesVersion(v => v + 1);
            return;
        }

        // schedule removal after short delay -- avoids transient stop/start caused by remount/double-render in dev
        const t = setTimeout(() => {
            try {
                map.delete(idx);
                console.debug('[SlidesCarousel] node removed (delayed)', { idx });
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
                try { classeAboutRef.current.stop(); } catch (e) { console.debug('ClasseAbout cleanup failed', e); }
            }
            if (classeHomeRef.current) {
                try { classeHomeRef.current.stop(); } catch (e) { console.debug('ClasseHome cleanup failed', e); }
            }
            if (classeProjectsRef.current) {
                try { classeProjectsRef.current.stop(); } catch (e) { console.debug('ClasseProjects cleanup failed', e); }
            }
        };
    }, []);

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', touchAction: 'pan-y' }}>
            <div ref={wrapperRef} style={{ display: 'flex', flexDirection: 'row', width: `${slides.length * 100}vw`, height: '100vh', willChange: 'transform' }}>
                {/*
                    Use SlideItem to inject prev/next buttons INSIDE the page's `.card-carousel` element
                */}
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

// Helper component: renders a slide and injects prev/next buttons inside the first `.card-carousel`
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
            <button aria-label="previous" onClick={goPrev}
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
            <button aria-label="next" onClick={goNext}
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