import { useEffect, useRef, useState } from 'react';
import analytics from '../lib/analyticsCache';
import { createPortal } from 'react-dom';

// Horizontal carousel using translateX; slides have no visible scroll (overflow: hidden)
export default function SlidesCarousel({ slides }) {
    const [index, setIndex] = useState(0);
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
    }, [index]);

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
    useEffect(() => {
        const slide = slides && slides[index];
        // derive a stable page key: prefer slide.path or slide.id, normalize it
        let pageKey = slide && (slide.path || slide.id || `slide_${index}`);
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
        const prev = visiblePageRef.current;
        if (prev && prev !== pageKey) {
            try { analytics.stopPageTimer(prev); } catch (err) { console.debug('stopPageTimer failed', err); }
        }
        if (pageKey) {
            try { analytics.startPageTimer(pageKey); } catch (err) { console.debug('startPageTimer failed', err); }
        }
        visiblePageRef.current = pageKey;

        return () => {
            // on unmount stop the currently running timer
            const cur = visiblePageRef.current;
            if (cur) {
                try { analytics.stopPageTimer(cur); } catch (err) { console.debug('stopPageTimer failed', err); }
            }
        };
    }, [index, slides]);

    // keyboard navigation (left/right) and focus management
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
                    />
                ))}
            </div>
        </div>
    );
}

// Helper component: renders a slide and injects prev/next buttons inside the first `.card-carousel`
function SlideItem({ slide, goPrev, goNext }) {
    const rootRef = useRef(null);
    const [target, setTarget] = useState(null);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        // wait a tick to ensure slide.element rendered
        const t = setTimeout(() => {
            const node = root.querySelector('.card-carousel');
            if (node) {
                // ensure positioning so absolute buttons are relative to the card
                if (!node.style.position || node.style.position === 'static') node.style.position = 'relative';
                setTarget(node);
            }
        }, 0);
        return () => clearTimeout(t);
    }, []);

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