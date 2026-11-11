"use client";
import { useEffect, useRef } from "react";
import type { SeasonalTheme } from "@/lib/seasonal";

export type { SeasonalTheme };

/** TRANG TRÍ MÙA LỄ HỘI — rút gọn theo lệnh Tín 2026-11-11: CHỈ còn hiệu ứng
 *  HẠT RƠI theo chủ đề trên canvas (Tết = cánh hoa mai/đào rơi, Noel = tuyết,
 *  Halloween = lá thu + dơi bay ngẫu nhiên, Trung thu = sao + đốm sáng trôi,
 *  Phục sinh = trứng pastel + cánh hoa xuân, Black Friday = thẻ giảm giá +
 *  giấy màu, Valentine = trái tim, Năm mới = giấy màu + tia lửa vàng,
 *  Quốc khánh = sao vàng + giấy màu đỏ vàng).
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

/** Trứng Phục sinh pastel: thân trứng bo (đầu hẹp, đáy tròn) + đề-can theo
 *  pattern — 0 = chấm bi, 1 = hai sọc ngang, 2 = dải sóng giữa thân. */
function drawEgg(ctx: CanvasRenderingContext2D, s: number, base: string, deco: string, pattern: number) {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.bezierCurveTo(s * 0.58, -s * 0.62, s * 0.8, -s * 0.02, s * 0.74, s * 0.42);
  ctx.bezierCurveTo(s * 0.64, s * 0.92, -s * 0.64, s * 0.92, -s * 0.74, s * 0.42);
  ctx.bezierCurveTo(-s * 0.8, -s * 0.02, -s * 0.58, -s * 0.62, 0, -s);
  ctx.fillStyle = base;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = deco;
  if (pattern === 0) {
    for (const [dx, dy] of [[-0.34, -0.25], [0.3, -0.42], [0.05, 0.05], [-0.28, 0.42], [0.36, 0.38]]) {
      ctx.beginPath();
      ctx.arc(dx * s, dy * s, s * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pattern === 1) {
    ctx.fillRect(-s, -s * 0.36, s * 2, s * 0.2);
    ctx.fillRect(-s, s * 0.2, s * 2, s * 0.2);
  } else {
    const y0 = s * 0.02, amp = s * 0.15, step = s * 0.36;
    ctx.beginPath();
    ctx.moveTo(-s, y0);
    for (let x = -s; x < s; x += step) {
      ctx.lineTo(x + step / 2, y0 - amp);
      ctx.lineTo(x + step, y0);
    }
    ctx.lineWidth = s * 0.14;
    ctx.strokeStyle = deco;
    ctx.stroke();
  }
  ctx.restore();
}

/** Trái tim Valentine + vệt sáng mềm ở mép trái trên. */
function drawHeart(ctx: CanvasRenderingContext2D, s: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.9);
  ctx.bezierCurveTo(-s * 1.25, s * 0.1, -s * 0.68, -s * 0.85, 0, -s * 0.34);
  ctx.bezierCurveTo(s * 0.68, -s * 0.85, s * 1.25, s * 0.1, 0, s * 0.9);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(-s * 0.36, -s * 0.28, s * 0.18, s * 0.3, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

/** Thẻ giá Black Friday: thân thẻ mũi nhọn + lỗ xỏ dây + ký tự "%" trắng
 *  (chữ vẽ canvas, không phải emoji). */
function drawTag(ctx: CanvasRenderingContext2D, s: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(-s, -s * 0.6);
  ctx.lineTo(s * 0.32, -s * 0.6);
  ctx.lineTo(s * 1.05, 0);
  ctx.lineTo(s * 0.32, s * 0.6);
  ctx.lineTo(-s, s * 0.6);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-s * 0.6, 0, s * 0.17, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 ${Math.round(s * 0.95)}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("%", s * 0.22, s * 0.06);
}

/** Giấy màu confetti: hình chữ nhật nhỏ, khung hình gọi xoay + co trục Y. */
function drawConfetti(ctx: CanvasRenderingContext2D, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(-s * 0.75, -s * 0.45, s * 1.5, s * 0.9);
}

/** Sao 5 cánh vàng (Quốc khánh). */
function drawStar5(ctx: CanvasRenderingContext2D, s: number, color: string) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const b = a + Math.PI / 5;
    ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
    ctx.lineTo(Math.cos(b) * s * 0.46, Math.sin(b) * s * 0.46);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
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

    const kindFor = (i: number): number => {
      switch (theme) {
        case "tet": return i % 3 === 0 ? 1 : 0;        // 1 = hoa mai · 0 = cánh đào
        case "halloween": return i % 14 === 0 ? 2 : 0; // 2 = dơi · 0 = lá thu
        case "phucsinh": return i % 5 < 3 ? 0 : 1;     // 0 = trứng pastel · 1 = cánh hoa xuân
        case "blackfriday": return i % 5 < 2 ? 0 : 1;  // 0 = thẻ giảm giá · 1 = giấy màu
        case "nammoi": return i % 10 < 3 ? 1 : 0;      // 1 = tia lửa vàng · 0 = giấy màu
        case "quockhanh": return i % 9 < 5 ? 0 : 1;    // 0 = sao vàng · 1 = giấy màu đỏ vàng
        default: return 0;
      }
    };
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
        kind: kindFor(i),
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
    const EGGS: Array<[string, string]> = [
      ["#FBCFE8", "#F472B6"], ["#A7F3D0", "#34D399"], ["#DDD6FE", "#8B5CF6"],
      ["#FDE68A", "#F59E0B"], ["#BFDBFE", "#60A5FA"],
    ];
    const SPRING = ["#FCE4EC", "#F8BBD0", "#FFFFFF"];
    const HEARTS = ["#F43F5E", "#EC4899", "#FB7185", "#E11D48", "#F9A8D4"];
    const TAGS = ["#111827", "#DC2626"];
    const CONFETTI_BF = ["#DC2626", "#111827", "#F59E0B", "#FACC15"];
    const CONFETTI_NY = ["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#A855F7", "#EC4899", "#FACC15"];
    const CONFETTI_QK = ["#DC2626", "#EF4444", "#F59E0B", "#FACC15"];
    const GOLDSTARS = ["#FACC15", "#F59E0B", "#FDE047"];

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
      } else if (theme === "trungthu") {
        if (p.kind === 0 && p.hue > 0.45) {
          drawStar(ctx, 3 + p.s * 0.8, 0.5 + 0.5 * Math.sin(t / 480 + p.phase), p.hue > 0.75 ? "#FDE68A" : "#FBCFE8");
        } else {
          drawGlowOrb(ctx, 9 + p.s * 2.1, ORBS[Math.floor(p.hue * ORBS.length)], 0.30 + 0.12 * Math.sin(t / 900 + p.phase));
        }
      } else if (theme === "phucsinh") {
        ctx.rotate(p.a * 0.6);
        if (p.kind === 0) {
          const [base, deco] = EGGS[Math.floor(p.hue * EGGS.length)];
          drawEgg(ctx, 4.4 + p.s * 0.95, base, deco, Math.floor(p.hue * 3) % 3);
        } else {
          drawPetal(ctx, 3 + p.s * 0.85, SPRING[Math.floor(p.hue * SPRING.length)]);
        }
      } else if (theme === "blackfriday") {
        if (p.kind === 0) {
          ctx.rotate(p.a * 0.8 + p.phase);
          drawTag(ctx, 6.2 + p.s * 0.8, TAGS[Math.floor(p.hue * TAGS.length)]);
        } else {
          ctx.rotate(p.a * 6 + p.phase);
          ctx.scale(1, Math.max(0.25, Math.abs(Math.sin(t / 320 + p.phase))));
          drawConfetti(ctx, 3.2 + p.s * 0.8, CONFETTI_BF[Math.floor(p.hue * CONFETTI_BF.length)]);
        }
      } else if (theme === "valentine") {
        ctx.rotate(Math.sin(t / 1400 + p.phase) * 0.25);
        ctx.globalAlpha = 0.55 + p.hue * 0.45;
        drawHeart(ctx, 3.6 + p.s * 1.05, HEARTS[Math.floor(p.hue * HEARTS.length)]);
        ctx.globalAlpha = 1;
      } else if (theme === "nammoi") {
        if (p.kind === 1) {
          drawStar(ctx, 2.6 + p.s * 0.7, 0.5 + 0.5 * Math.sin(t / 380 + p.phase), p.hue > 0.5 ? "#FDE047" : "#FDE68A");
        } else {
          ctx.rotate(p.a * 6 + p.phase);
          ctx.scale(1, Math.max(0.25, Math.abs(Math.sin(t / 300 + p.phase))));
          drawConfetti(ctx, 3.4 + p.s * 0.8, CONFETTI_NY[Math.floor(p.hue * CONFETTI_NY.length)]);
        }
      } else if (theme === "quockhanh") {
        if (p.kind === 0) {
          ctx.rotate(p.a * 0.5);
          drawStar5(ctx, 3.4 + p.s * 0.85, GOLDSTARS[Math.floor(p.hue * GOLDSTARS.length)]);
        } else {
          ctx.rotate(p.a * 6 + p.phase);
          ctx.scale(1, Math.max(0.25, Math.abs(Math.sin(t / 310 + p.phase))));
          drawConfetti(ctx, 3.2 + p.s * 0.8, CONFETTI_QK[Math.floor(p.hue * CONFETTI_QK.length)]);
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
          // Tốc độ rơi theo tính chất từng lễ: Valentine/Phục sinh rơi chậm nhẹ,
          // Black Friday/Năm mới rơi nhanh náo nhiệt, còn lại mức thường.
          const fall = theme === "valentine" ? 0.5 : theme === "phucsinh" ? 0.55
            : theme === "noel" || theme === "blackfriday" ? 0.85 : theme === "nammoi" ? 0.8 : 0.7;
          p.y += p.vy * fall;
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
