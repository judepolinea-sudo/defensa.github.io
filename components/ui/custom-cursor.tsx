import React, { useEffect, useRef, useState } from 'react';

const LERP_FACTOR = 0.16; // lower = more delay before the beam catches up
const MAX_BEAM_LENGTH = 240;

// Replaces the native pointer with a small glowing dot plus a light beam
// that trails behind with a delayed, elastic catch-up motion. Disabled
// automatically on touch devices and when the user has requested reduced
// motion.
const CustomCursor: React.FC = () => {
  const dotRef = useRef<HTMLSpanElement>(null);
  const beamRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  const mouseRef = useRef({ x: -100, y: -100 });
  const beamPosRef = useRef({ x: -100, y: -100 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isTouch || reducedMotion) return;

    setEnabled(true);
    document.documentElement.classList.add('custom-cursor-active');

    const onMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;

      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
      }
      const target = e.target as HTMLElement;
      const isInteractive = !!target.closest('button, a, [role="button"], input, textarea, select, summary');
      const isGrabbable = !isInteractive && !!target.closest('[class*="cursor-grab"]');
      dotRef.current?.classList.toggle('cursor-dot--pointer', isInteractive);
      dotRef.current?.classList.toggle('cursor-dot--grab', isGrabbable);
    };
    window.addEventListener('mousemove', onMove, { passive: true });

    // Delayed beam: each frame, ease the beam's anchor point toward the
    // live cursor position (never quite catching up), then draw a glowing
    // streak from that lagged anchor to the current cursor — the gap
    // between them is what reads as "light trying to catch up."
    const tick = () => {
      const mouse = mouseRef.current;
      const beam = beamPosRef.current;
      beam.x += (mouse.x - beam.x) * LERP_FACTOR;
      beam.y += (mouse.y - beam.y) * LERP_FACTOR;

      if (beamRef.current) {
        const dx = mouse.x - beam.x;
        const dy = mouse.y - beam.y;
        const distance = Math.min(Math.hypot(dx, dy), MAX_BEAM_LENGTH);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        beamRef.current.style.transform =
          `translate(${beam.x}px, ${beam.y}px) rotate(${angle}deg)`;
        beamRef.current.style.width = `${distance}px`;
        beamRef.current.style.opacity = distance > 2 ? '1' : '0';
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      document.documentElement.classList.remove('custom-cursor-active');
    };
  }, []);

  if (!enabled) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999]" aria-hidden="true">
      <div ref={beamRef} className="cursor-beam" />
      <span ref={dotRef} className="cursor-dot" />
    </div>
  );
};

export default CustomCursor;
