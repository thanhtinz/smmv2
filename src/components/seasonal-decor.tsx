"use client";
import { useEffect, useRef } from "react";
import type { SeasonalTheme } from "@/lib/seasonal";

export type { SeasonalTheme };

/** TRANG TRÍ MÙA LỄ HỘI — rút gọn theo lệnh Tín 2026-11-11: CHỈ còn hiệu ứng
 *  HẠT RƠI theo chủ đề trên canvas (Tết = cánh hoa mai/đào rơi, Noel = tuyết,
 *  Halloween = lá thu + dơi bay ngẫu nhiên, Trung thu = sao + đốm sáng trôi).
 *  Đã BỎ HẲN: vòng treo dưới header, vật phẩm góc trang (cây mai / người tuyết /
 *  bí ngô / thỏ ngọc) và dải màu nhấn. Canvas fixed pointer-events-none,
 *  không chiếm layout, dừng khi ẩn tab, tôn trọng prefers-reduced-motion. */

/* ================= HẠT RƠI (canvas) ================= */

type P = {
  x: number; y: number; s: number; a: number; spin: number;
  vy: number; phase: number; sway: number; kind: number; hue: number;
};

function drawPetal(ctx: CanvasRenderingContext2D, s: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.bezierCurveTo(s * 0.72, -s * 0.35, s * 0.52, s * 0.62, 0, s);
  ctx.bezierCurveTo(-s * 0.52, s * 0.62, -s * 0.72, -s * 0.35, 0, -s);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawMai(ctx: CanvasRenderingContext2D, s: number) {
  ctx.fillStyle = "#FFC93C";
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(ang) * s * 0.52, Math.sin(ang) * s * 0.52, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#E8590C";
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.26, 0, Math.PI * 2);
  ctx.fill();
}

function drawSnow(ctx: CanvasRenderingContext2D, s: number, alpha: number) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
  g.addColorStop(0, `rgba(255,255,255,${alpha})`);
  g.addColorStop(0.7, `rgba(240,249,255,${alpha * 0.75})`);
  g.addColorStop(1, "rgba(240,249,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, s, 0, Math.PI * 2);
  ctx.fill();
  if (s > 3.4) {
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.9})`;
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang) * s * 0.85, Math.sin(ang) * s * 0.85);
      ctx.stroke();
    }
  }
}

function drawBat(ctx: CanvasRenderingContext2D, s: number, flap: number) {
  ctx.fillStyle = "rgba(31,27,37,0.88)";
  ctx.beginPath();
  const w = s * (0.9 + flap * 0.25);
  ctx.moveTo(0, -s * 0.18);
  ctx.quadraticCurveTo(-s * 0.35, -s * 0.55, -w, -s * 0.1);
  ctx.quadraticCurveTo(-s * 0.62, s * 0.08, -s * 0.5, s * 0.3);
  ctx.quadraticCurveTo(-s * 0.2, s * 0.05, 0, s * 0.34);
  ctx.quadraticCurveTo(s * 0.2, s * 0.05, s * 0.5, s * 0.3);
  ctx.quadraticCurveTo(s * 0.62, s * 0.08, w, -s * 0.1);
  ctx.quadraticCurveTo(s * 0.35, s * 0.55, 0, -s * 0.18);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function drawStar(ctx: CanvasRenderingContext2D, s: number, tw: number, color: string) {
  ctx.save();
  ctx.globalAlpha = 0.35 + tw * 0.65;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * 0.16, -s * 0.16, s, 0);
  ctx.quadraticCurveTo(s * 0.16, s * 0.16, 0, s);
  ctx.quadraticCurveTo(-s * 0.16, s * 0.16, -s, 0);
  ctx.quadraticCurveTo(-s * 0.16, -s * 0.16, 0, -s);
  ctx.fill();
  ctx.restore();
}

function drawGlowOrb(ctx: CanvasRenderingContext2D, s: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
  g.addColorStop(0, color.replace("A", String(alpha)));
  g.addColorStop(1, color.replace("A", "0"));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, s, 0, Math.PI * 2);
  ctx.fill();
}

function Particles({ theme }: { theme: SeasonalTheme }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let w = 0, h = 0, raf = 0, running = true;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let parts: P[] = [];

    const seed = () => {
      const n = Math.max(30, Math.min(85, Math.round((w * h) / 16000)));
      parts = Array.from({ length: n }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        s: 2 + Math.random() * 5,
        a: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.02,
        vy: 0.35 + Math.random() * 0.75,
        phase: Math.random() * Math.PI * 2,
        sway: 18 + Math.random() * 30,
        kind: theme === "halloween" && i % 14 === 0 ? 2 : theme === "tet" ? (i % 3 === 0 ? 1 : 0) : 0,
        hue: Math.random(),
      }));
    };
    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };
    resize();
    window.addEventListener("resize", resize);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const PETALS = ["#FFD1DC", "#F8A5C2", "#FCE4EC"];
    const LEAVES = ["#F97316", "#EA580C", "#F59E0B", "#B45309"];
    const ORBS = ["rgba(251,146,60,A)", "rgba(244,114,182,A)", "rgba(56,189,248,A)", "rgba(251,191,36,A)"];

    const draw = (p: P, t: number) => {
      const x = p.x + Math.sin(t / 1600 + p.phase) * (p.sway / 6);
      ctx.save();
      ctx.translate(x, p.y);
      if (theme === "tet") {
        ctx.rotate(p.a);
        if (p.kind === 1) drawMai(ctx, 3.4 + p.s * 0.85);
        else drawPetal(ctx, 3.2 + p.s * 0.95, PETALS[Math.floor(p.hue * PETALS.length)]);
      } else if (theme === "noel") {
        drawSnow(ctx, 1.4 + p.s * 0.62, 0.55 + p.hue * 0.45);
      } else if (theme === "halloween") {
        if (p.kind === 2) {
          ctx.translate(-p.x + ((t / 22 + p.phase * 140) % (w + 160)) - 80, Math.sin(t / 700 + p.phase) * 14);
          drawBat(ctx, 11 + p.s, Math.abs(Math.sin(t / 180 + p.phase)));
        } else {
          ctx.rotate(p.a);
          drawPetal(ctx, 3.4 + p.s, LEAVES[Math.floor(p.hue * LEAVES.length)]);
        }
      } else {
        if (p.kind === 0 && p.hue > 0.45) {
          drawStar(ctx, 3 + p.s * 0.8, 0.5 + 0.5 * Math.sin(t / 480 + p.phase), p.hue > 0.75 ? "#FDE68A" : "#FBCFE8");
        } else {
          drawGlowOrb(ctx, 9 + p.s * 2.1, ORBS[Math.floor(p.hue * ORBS.length)], 0.30 + 0.12 * Math.sin(t / 900 + p.phase));
        }
      }
      ctx.restore();
    };

    const frame = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        if (theme === "trungthu") {
          p.y -= p.vy * 0.45;
          if (p.y < -18) { p.y = h + 18; p.x = Math.random() * w; }
        } else if (!(theme === "halloween" && p.kind === 2)) {
          p.y += p.vy * (theme === "noel" ? 0.85 : 0.7);
          p.a += p.spin;
          if (p.y > h + 16) { p.y = -16; p.x = Math.random() * w; }
        }
        draw(p, t);
      }
      if (running && !reduced) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onVis = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (!reduced) { running = true; raf = requestAnimationFrame(frame); }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", onVis); };
  }, [theme]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[45]" data-seasonal-particles={theme} />;
}

/* ================= GỐC ================= */

export default function SeasonalDecor({ theme }: { theme: SeasonalTheme }) {
  return <Particles theme={theme} />;
}
