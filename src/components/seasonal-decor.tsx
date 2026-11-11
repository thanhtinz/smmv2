"use client";
import { useEffect, useRef } from "react";
import { SEASONAL_ACCENT, type SeasonalTheme } from "@/lib/seasonal";

export type { SeasonalTheme };

/** TRANG TRÍ MÙA LỄ HỘI — thiết kế đã được Tín duyệt 2026-11-11.
 *  4 lớp phối hợp theo theme: hạt rơi (canvas) + vòng trang trí treo dưới
 *  header (SVG) + dải màu nhấn (gradient ở mép trên trang / thanh thông báo)
 *  + NHÂN VẬT/VẬT PHẨM đặc trưng từng mùa ở góc dưới-trái (SVG cố định:
 *  Tết = cây mai + lì xì, Noel = người tuyết, Halloween = cụm bí ngô,
 *  Trung thu = thỏ ngọc + bánh + đèn lồng).
 *  Tất cả pointer-events-none, không chiếm layout (vòng treo nằm trong hộp
 *  h-0, hạt là canvas fixed, vật phẩm fixed góc), không emoji — chỉ SVG/CSS/canvas. */

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
  ctx.quadraticCurveTo(s * 0.35, -s * 0.55, 0, -s * 0.18);
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

/* ================= VÒNG TREO (SVG) ================= */

const W = 1440;
function scallop(): string {
  let d = "M0,4";
  for (let x = 0; x < W; x += 120) d += ` Q${x + 60},26 ${x + 120},4`;
  return d;
}
const DIPS = Array.from({ length: 12 }, (_, i) => 60 + i * 120);

function TetLantern({ x, drop, big }: { x: number; drop: number; big: boolean }) {
  const r = big ? 15 : 11;
  const body = big ? "#D62828" : "#F5A623";
  const rib = big ? "rgba(255,205,90,0.55)" : "rgba(185,28,28,0.4)";
  const cy = 16 + drop + r;
  return (
    <g>
      <line x1={x} y1={14} x2={x} y2={16 + drop} stroke="#7F1D1D" strokeWidth="1.4" />
      <circle cx={x} cy={cy} r={r + 7} fill="#FBBF24" opacity="0.16" />
      <ellipse cx={x} cy={cy} rx={r} ry={r * 0.82} fill={body} stroke={big ? "#991B1B" : "#B45309"} strokeWidth="1" />
      {[-0.55, 0, 0.55].map((f) => (
        <ellipse key={f} cx={x} cy={cy} rx={Math.abs(f) * r + 0.6} ry={r * 0.82} fill="none" stroke={rib} strokeWidth="1" />
      ))}
      <rect x={x - r * 0.42} y={cy - r * 0.82 - 3.4} width={r * 0.84} height="3.6" rx="1" fill="#F59E0B" stroke="#B45309" strokeWidth="0.6" />
      <rect x={x - r * 0.42} y={cy + r * 0.82 - 0.2} width={r * 0.84} height="3.6" rx="1" fill="#F59E0B" stroke="#B45309" strokeWidth="0.6" />
      <line x1={x - 3} y1={cy + r * 0.82 + 3.4} x2={x - 3} y2={cy + r * 0.82 + 10} stroke="#DC2626" strokeWidth="1.3" />
      <line x1={x} y1={cy + r * 0.82 + 3.4} x2={x} y2={cy + r * 0.82 + 12} stroke="#DC2626" strokeWidth="1.3" />
      <line x1={x + 3} y1={cy + r * 0.82 + 3.4} x2={x + 3} y2={cy + r * 0.82 + 10} stroke="#DC2626" strokeWidth="1.3" />
    </g>
  );
}

function NoelBulb({ x, drop, color, sprig }: { x: number; drop: number; color: string; sprig?: boolean }) {
  const cy = 16 + drop + 8;
  return (
    <g>
      <line x1={x} y1={14} x2={x} y2={16 + drop} stroke="#14532D" strokeWidth="1.4" />
      {sprig && (
        <g stroke="#166534" strokeWidth="1.6" strokeLinecap="round">
          {[-26, -13, 0, 13, 26].map((deg) => {
            const rad = ((90 + deg) * Math.PI) / 180;
            return <line key={deg} x1={x} y1={15} x2={x + Math.cos(rad) * 13} y2={15 + Math.sin(rad) * 13} />;
          })}
          <circle cx={x - 5} cy={24} r="2" fill="#DC2626" stroke="none" />
          <circle cx={x + 5} cy={25} r="2" fill="#DC2626" stroke="none" />
        </g>
      )}
      <circle cx={x} cy={cy + 2} r="11" fill={color} opacity="0.30" />
      <rect x={x - 2.6} y={16 + drop} width="5.2" height="4" rx="1" fill="#475569" />
      <circle cx={x} cy={cy + 3} r="5.6" fill={color} stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" />
      <circle cx={x - 1.8} cy={cy + 1.2} r="1.6" fill="rgba(255,255,255,0.75)" />
    </g>
  );
}

function HalloweenItem({ x, drop, pumpkin }: { x: number; drop: number; pumpkin: boolean }) {
  const cy = 16 + drop + 12;
  if (!pumpkin) {
    return (
      <g>
        <line x1={x} y1={14} x2={x} y2={16 + drop} stroke="#3B0764" strokeWidth="1.4" />
        <g transform={`translate(${x},${cy})`}>
          <path d="M0,-3 Q-6,-9 -15,-3 Q-8,0 -13,4 Q-5,3 0,6 Q5,3 13,4 Q8,0 15,-3 Q6,-9 0,-3 Z" fill="#1F2937" />
          <circle cx="0" cy="0" r="2.6" fill="#1F2937" />
        </g>
      </g>
    );
  }
  return (
    <g>
      <line x1={x} y1={14} x2={x} y2={16 + drop} stroke="#3B0764" strokeWidth="1.4" />
      <path d={`M${x - 1.5},${16 + drop} q3,-5 6,-1 l-1.6,4 l-4.8,0 Z`} fill="#4D7C0F" />
      <ellipse cx={x} cy={cy + 2} rx="13" ry="10.5" fill="#F97316" stroke="#C2410C" strokeWidth="1" />
      {[-6.5, 0, 6.5].map((dx) => (
        <path key={dx} d={`M${x + dx},${cy - 7.5} q${dx === 0 ? 0 : dx > 0 ? 2.4 : -2.4},9.5 0,19`} fill="none" stroke="#C2410C" strokeWidth="1" opacity="0.65" />
      ))}
      <path d={`M${x - 6},${cy - 1} l3,-3.4 l3,3.4 Z M${x + 1},${cy - 1} l3,-3.4 l3,3.4 Z`} fill="#451A03" />
      <path d={`M${x - 6.5},${cy + 4} l2.4,2 l2,-2.4 l2.2,2.4 l2,-2.2 l2.4,2 Z`} fill="#451A03" />
    </g>
  );
}

function TrungThuLantern({ x, drop, i }: { x: number; drop: number; i: number }) {
  const colors = ["#F472B6", "#38BDF8", "#FBBF24", "#A78BFA", "#34D399"];
  const c = colors[i % colors.length];
  const cy = 16 + drop + 13;
  const diamond = i % 3 === 2;
  return (
    <g>
      <line x1={x} y1={14} x2={x} y2={16 + drop} stroke="#92400E" strokeWidth="1.4" />
      <circle cx={x} cy={cy} r="20" fill={c} opacity="0.16" />
      {diamond ? (
        <g>
          <rect x={x - 10} y={cy - 10} width="20" height="20" rx="3" transform={`rotate(45 ${x} ${cy})`} fill={c} fillOpacity="0.9" stroke="rgba(120,53,15,0.45)" strokeWidth="1" />
          <path d={`M${x - 7},${cy} h14 M${x},${cy - 7} v14`} stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" />
        </g>
      ) : (
        <g>
          <ellipse cx={x} cy={cy} rx="12.5" ry="10.6" fill={c} fillOpacity="0.92" stroke="rgba(120,53,15,0.4)" strokeWidth="1" />
          {[-5.5, 0, 5.5].map((dx) => (
            <line key={dx} x1={x + dx} y1={cy - 9.6} x2={x + dx} y2={cy + 9.6} stroke="rgba(255,255,255,0.55)" strokeWidth="1" />
          ))}
          <rect x={x - 5} y={cy - 13.4} width="10" height="3.2" rx="1" fill="#F59E0B" />
          <rect x={x - 5} y={cy + 10.2} width="10" height="3.2" rx="1" fill="#F59E0B" />
        </g>
      )}
      <line x1={x - 2.6} y1={cy + 13.4} x2={x - 2.6} y2={cy + 19} stroke={c} strokeWidth="1.3" />
      <line x1={x} y1={cy + 13.4} x2={x} y2={cy + 21} stroke={c} strokeWidth="1.3" />
      <line x1={x + 2.6} y1={cy + 13.4} x2={x + 2.6} y2={cy + 19} stroke={c} strokeWidth="1.3" />
    </g>
  );
}

function WebCorner({ flip }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 90 90" aria-hidden className={`pointer-events-none absolute top-0 h-[76px] w-[76px] opacity-60 ${flip ? "right-0 -scale-x-100" : "left-0"}`}>
      <g stroke="#CBD5E1" strokeWidth="1.1" fill="none">
        <path d="M0,0 L90,90 M0,34 L56,90 M34,0 L90,56 M0,62 L28,90 M62,0 L90,28" opacity="0.7" />
        <path d="M8,14 Q30,20 44,8 M14,32 Q36,40 58,20 M24,52 Q44,58 66,38" />
      </g>
      <circle cx="46" cy="52" r="2.4" fill="#334155" />
      <line x1="46" y1="0" x2="46" y2="49" stroke="#94A3B8" strokeWidth="0.9" />
    </svg>
  );
}

function Garland({ theme }: { theme: SeasonalTheme }) {
  const drops = [4, 12, 6, 14, 5, 11, 7, 13, 4, 12, 6, 10];
  const bulbs = ["#EF4444", "#22C55E", "#F59E0B", "#3B82F6", "#EC4899", "#FACC15"];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[44]" data-seasonal-garland={theme}>
      <svg viewBox={`0 0 ${W} 78`} preserveAspectRatio="xMidYMin slice" className="block h-[76px] w-full">
        <path d={scallop()} fill="none" stroke={theme === "noel" ? "#14532D" : theme === "halloween" ? "#3B0764" : theme === "tet" ? "#7F1D1D" : "#92400E"} strokeWidth="1.8" />
        {DIPS.map((x, i) =>
          theme === "tet" ? (
            <TetLantern key={x} x={x} drop={drops[i]} big={i % 2 === 0} />
          ) : theme === "noel" ? (
            <NoelBulb key={x} x={x} drop={drops[i]} color={bulbs[i % bulbs.length]} sprig={i % 4 === 1} />
          ) : theme === "halloween" ? (
            <HalloweenItem key={x} x={x} drop={drops[i]} pumpkin={i % 3 !== 2} />
          ) : (
            <TrungThuLantern key={x} x={x} drop={drops[i]} i={i} />
          ),
        )}
      </svg>
      {theme === "halloween" && (
        <>
          <WebCorner />
          <WebCorner flip />
        </>
      )}
    </div>
  );
}

/* ================= NHÂN VẬT / VẬT PHẨM GÓC DƯỚI-TRÁI (SVG) =================
 * Góc dưới-phải là nút liên hệ nổi của site — vật phẩm chỉ ở dưới-TRÁI.
 * Chuyển động rất nhẹ (đung đưa / nhấp nhô / lửa bí ngô lập loè / tai thỏ
 * giật nhẹ) bằng CSS keyframes; tắt hẳn khi prefers-reduced-motion. */

const PROP_CSS = `
.sdp-sway{transform-box:fill-box;transform-origin:50% 100%;animation:sdpSway 6.5s ease-in-out infinite alternate}
.sdp-bob{transform-box:fill-box;animation:sdpBob 3.6s ease-in-out infinite alternate}
.sdp-flicker{animation:sdpFlicker 2.8s ease-in-out infinite}
.sdp-pulse{animation:sdpPulse 3.2s ease-in-out infinite alternate}
.sdp-ear{transform-box:fill-box;transform-origin:50% 94%;animation:sdpEar 5.5s ease-in-out infinite}
@keyframes sdpSway{from{transform:rotate(-1.1deg)}to{transform:rotate(1.1deg)}}
@keyframes sdpBob{from{transform:translateY(0)}to{transform:translateY(-3px)}}
@keyframes sdpFlicker{0%,100%{opacity:.92}38%{opacity:.55}52%{opacity:1}68%{opacity:.68}82%{opacity:.95}}
@keyframes sdpPulse{from{opacity:.45}to{opacity:.95}}
@keyframes sdpEar{0%,86%,100%{transform:rotate(0deg)}89%{transform:rotate(-7deg)}92%{transform:rotate(3deg)}95%{transform:rotate(0deg)}}
@media (prefers-reduced-motion: reduce){.sdp-sway,.sdp-bob,.sdp-flicker,.sdp-pulse,.sdp-ear{animation:none}}
`;

function MaiFlower({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      {[0, 72, 144, 216, 288].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return <circle key={deg} cx={Math.cos(rad) * 4.4} cy={Math.sin(rad) * 4.4} r="3.9" fill="#FFC93C" stroke="#E8A90C" strokeWidth="0.5" />;
      })}
      <circle r="2.1" fill="#E8590C" />
    </g>
  );
}

function LiXi({ x, y, drop }: { x: number; y: number; drop: number }) {
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y + drop} stroke="#B45309" strokeWidth="1.1" />
      <rect x={x - 6} y={y + drop} width="12" height="16" rx="1.6" fill="#DC2626" stroke="#991B1B" strokeWidth="0.8" />
      <circle cx={x} cy={y + drop + 8} r="2.6" fill="#FBBF24" />
      <rect x={x - 6} y={y + drop} width="12" height="3" fill="#B91C1C" />
    </g>
  );
}

function TetMaiTree() {
  const blooms: Array<[number, number, number]> = [
    [62, 96, 1], [76, 72, 0.9], [56, 112, 0.8], [88, 58, 1.05], [104, 42, 1],
    [122, 60, 0.95], [134, 84, 1], [114, 80, 0.85], [94, 84, 0.8], [70, 122, 0.85],
    [128, 106, 0.9], [102, 104, 0.75], [84, 38, 0.85], [146, 100, 0.8], [48, 92, 0.75],
  ];
  return (
    <svg viewBox="0 0 200 214" className="block h-auto w-full" role="img" aria-label="Cây mai ngày Tết">
      <ellipse cx="100" cy="204" rx="68" ry="7" fill="rgba(0,0,0,0.13)" />
      <g className="sdp-sway">
        {/* cành + thân uốn lượn */}
        <g fill="none" stroke="#6B4226" strokeLinecap="round">
          <path d="M100,168 C95,150 107,140 99,122 C95,112 101,102 97,90" strokeWidth="7" />
          <path d="M99,124 C86,112 74,106 62,98" strokeWidth="4.4" />
          <path d="M98,110 C110,98 120,90 130,86" strokeWidth="4.2" />
          <path d="M97,92 C88,80 84,68 84,54" strokeWidth="3.6" />
          <path d="M97,96 C106,82 112,68 114,52" strokeWidth="3.4" />
          <path d="M100,132 C90,128 78,126 68,124" strokeWidth="3.4" />
        </g>
        {/* lì xì treo cành */}
        <LiXi x={72} y={108} drop={9} />
        <LiXi x={126} y={90} drop={11} />
        <LiXi x={104} y={118} drop={8} />
        {/* hoa mai + nụ */}
        {blooms.map(([x, y, s], i) => (
          <MaiFlower key={i} x={x} y={y} s={s} />
        ))}
        {[[58, 84], [96, 30], [140, 70], [80, 130], [118, 122], [44, 106]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.6" fill="#FFD93C" stroke="#E8A90C" strokeWidth="0.5" />
        ))}
      </g>
      {/* chậu sành */}
      <path d="M63,172 L137,172 L129,202 L71,202 Z" fill="#B91C1C" stroke="#7F1D1D" strokeWidth="1.2" />
      <rect x="58" y="163" width="84" height="10" rx="3" fill="#991B1B" stroke="#7F1D1D" strokeWidth="1" />
      <rect x="58" y="163" width="84" height="3" rx="1.5" fill="#F59E0B" opacity="0.85" />
      {[[84, 186], [100, 190], [116, 186]].map(([x, y], i) => (
        <path key={i} d={`M${x},${y - 4} L${x + 4},${y} L${x},${y + 4} L${x - 4},${y} Z`} fill="#FBBF24" />
      ))}
    </svg>
  );
}

function NoelSnowman() {
  return (
    <svg viewBox="0 0 210 204" className="block h-auto w-full" role="img" aria-label="Người tuyết Giáng sinh">
      <ellipse cx="112" cy="192" rx="82" ry="8" fill="rgba(0,0,0,0.10)" />
      {/* cây thông nhỏ bên cạnh */}
      <g>
        <rect x="27" y="162" width="7" height="14" fill="#7C4A2D" />
        <path d="M30,92 L50,130 L10,130 Z" fill="#166534" />
        <path d="M30,112 L55,152 L5,152 Z" fill="#15803D" />
        <path d="M30,134 L58,168 L2,168 Z" fill="#166534" />
        <path d="M30,92 L42,112 L18,112 Z M30,112 L46,134 L14,134 Z" fill="#F8FAFC" opacity="0.85" />
        {[[24, 124], [38, 140], [28, 156], [42, 162]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.4" fill={i % 2 ? "#F59E0B" : "#DC2626"} />
        ))}
        <path d="M30,78 l2.2,4.8 4.8,2.2 -4.8,2.2 -2.2,4.8 -2.2,-4.8 -4.8,-2.2 4.8,-2.2 Z" fill="#FBBF24" />
      </g>
      {/* người tuyết */}
      <g className="sdp-bob">
        <ellipse cx="126" cy="186" rx="56" ry="7" fill="#E0F2FE" />
        <circle cx="126" cy="156" r="31" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.2" />
        <circle cx="126" cy="110" r="22.5" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.2" />
        <circle cx="126" cy="74" r="16.5" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.2" />
        {/* tay cành cây */}
        <g stroke="#7C4A2D" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M106,106 L80,90 M80,90 L72,92 M80,90 L76,82" />
          <path d="M146,106 L172,84 M172,84 L180,84 M172,84 L176,74" />
        </g>
        {/* nút than */}
        <circle cx="126" cy="102" r="2.3" fill="#1F2937" />
        <circle cx="126" cy="114" r="2.3" fill="#1F2937" />
        <circle cx="126" cy="148" r="2.4" fill="#1F2937" />
        <circle cx="126" cy="162" r="2.4" fill="#1F2937" />
        {/* mặt */}
        <circle cx="120" cy="70" r="2.2" fill="#1F2937" />
        <circle cx="132" cy="70" r="2.2" fill="#1F2937" />
        <path d="M126,76 L146,80.5 L126,83 Z" fill="#F97316" stroke="#EA580C" strokeWidth="0.7" />
        {[[117, 81], [121, 84], [126, 85.4], [131, 84], [135, 81]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1.05" fill="#1F2937" />
        ))}
        <ellipse cx="113" cy="79" rx="3" ry="2" fill="#F9A8D4" opacity="0.55" />
        <ellipse cx="139" cy="79" rx="3" ry="2" fill="#F9A8D4" opacity="0.55" />
        {/* khăn đỏ */}
        <path d="M108,86 Q126,94 144,86 L144,95 Q126,103 108,95 Z" fill="#DC2626" stroke="#991B1B" strokeWidth="0.8" />
        <path d="M138,93 L148,95 L145,120 L135,117 Z" fill="#DC2626" stroke="#991B1B" strokeWidth="0.8" />
        <path d="M136.4,112 L146,114.4 M137.4,117 L145.4,119" stroke="#FBBF24" strokeWidth="1.6" />
        {/* mũ cao bồi */}
        <rect x="107" y="56" width="38" height="5.5" rx="2.4" fill="#1F2937" />
        <rect x="114" y="30" width="24" height="27" rx="2.5" fill="#1F2937" />
        <rect x="114" y="48" width="24" height="6.5" fill="#DC2626" />
      </g>
    </svg>
  );
}

function PumpkinFace({ cx, cy, s, variant }: { cx: number; cy: number; s: number; variant: number }) {
  const eye = variant === 0
    ? `M${cx - 17 * s},${cy - 6 * s} l6.5,${-8 * s} l6.5,${8 * s} Z M${cx + 4 * s},${cy - 6 * s} l6.5,${-8 * s} l6.5,${8 * s} Z`
    : variant === 1
      ? `M${cx - 13 * s},${cy - 5 * s} l5.5,${-6.5 * s} l5.5,${6.5 * s} Z M${cx + 2 * s},${cy - 5 * s} l5.5,${-6.5 * s} l5.5,${6.5 * s} Z`
      : `M${cx - 12 * s},${cy - 4 * s} l5,${-6 * s} l5,${6 * s} Z`;
  const mouth = variant === 0
    ? `M${cx - 19 * s},${cy + 7 * s} l5,${5.5 * s} l5,${-3.6 * s} l5,${5 * s} l5,${-3.6 * s} l5,${5.5 * s} l4,${-4 * s} l-2,${-6.5 * s} l-9,${2.4 * s} l-11,${-0.5 * s} l-10,${-2 * s} l-2,${-1.4 * s} Z`
    : variant === 1
      ? `M${cx - 13 * s},${cy + 6 * s} q13,${11 * s} 26,0 l-3.4,${-2.6 * s} l-5,${3.4 * s} l-5,${-3.4 * s} l-5,${3.2 * s} l-4.6,${-3 * s} Z`
      : `M${cx - 10 * s},${cy + 5 * s} q10,${9 * s} 20,0 l-8,${1.8 * s} l-12,${-0.6 * s} Z`;
  return (
    <g fill="#FEF9C3">
      <path d={eye} />
      <path d={mouth} />
    </g>
  );
}

function Pumpkin({ cx, cy, rx, ry, variant }: { cx: number; cy: number; rx: number; ry: number; variant: number }) {
  return (
    <g>
      <path d={`M${cx - 2.5},${cy - ry - 1} q4.5,-8 10,-4.5 l-2,7.5 l-8,0 Z`} fill="#4D7C0F" stroke="#365314" strokeWidth="0.8" />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#F97316" stroke="#C2410C" strokeWidth="1.4" />
      <ellipse cx={cx} cy={cy} rx={rx * 0.62} ry={ry * 0.97} fill="none" stroke="#C2410C" strokeWidth="1.1" opacity="0.55" />
      <ellipse cx={cx} cy={cy} rx={rx * 0.28} ry={ry * 0.99} fill="none" stroke="#C2410C" strokeWidth="1.1" opacity="0.5" />
      <ellipse cx={cx - rx * 0.34} cy={cy - ry * 0.3} rx={rx * 0.2} ry={ry * 0.34} fill="#FB923C" opacity="0.5" />
      <g className="sdp-flicker" style={{ filter: "drop-shadow(0 0 5px rgba(251,191,36,0.95))" }}>
        <PumpkinFace cx={cx} cy={cy} s={rx / 52} variant={variant} />
      </g>
    </g>
  );
}

function HalloweenPumpkins() {
  return (
    <svg viewBox="0 0 216 168" className="block h-auto w-full" role="img" aria-label="Bí ngô Halloween">
      <ellipse cx="108" cy="156" rx="92" ry="8" fill="rgba(0,0,0,0.16)" />
      <Pumpkin cx={46} cy={130} rx={31} ry={24} variant={1} />
      <Pumpkin cx={172} cy={132} rx={28} ry={22} variant={2} />
      <Pumpkin cx={108} cy={114} rx={54} ry={42} variant={0} />
      {/* lá khô dưới chân */}
      <g opacity="0.9">
        <path d="M70,156 q7,-6 13,-1 q-6,6 -13,1 Z" fill="#B45309" />
        <path d="M138,158 q8,-5 13,1 q-7,5 -13,-1 Z" fill="#92400E" />
        <path d="M96,160 q6,-5 12,-1 q-6,5 -12,1 Z" fill="#D97706" />
      </g>
      {/* nến nhỏ */}
      <g>
        <rect x="76" y="140" width="9" height="13" rx="1.4" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="0.7" />
        <g className="sdp-flicker">
          <path d="M80.5,132 q3.4,4.4 0,8 q-3.4,-3.6 0,-8 Z" fill="#FBBF24" />
          <circle cx="80.5" cy="137" r="4.6" fill="#F59E0B" opacity="0.3" />
        </g>
      </g>
    </svg>
  );
}

function TrungThuRabbit() {
  return (
    <svg viewBox="0 0 212 196" className="block h-auto w-full" role="img" aria-label="Thỏ ngọc Trung thu">
      <ellipse cx="104" cy="184" rx="82" ry="8" fill="rgba(0,0,0,0.12)" />
      {/* đèn lồng treo trên cọc tre bên phải */}
      <g>
        <line x1="176" y1="176" x2="176" y2="58" stroke="#92400E" strokeWidth="3.4" strokeLinecap="round" />
        <line x1="176" y1="58" x2="160" y2="58" stroke="#92400E" strokeWidth="3" strokeLinecap="round" />
        <line x1="163" y1="58" x2="163" y2="68" stroke="#92400E" strokeWidth="1.2" />
        <circle cx="163" cy="86" r="25" fill="#F59E0B" className="sdp-pulse" opacity="0.35" />
        <ellipse cx="163" cy="86" rx="17" ry="14.5" fill="#F472B6" stroke="#9D174D" strokeWidth="1" />
        {[-6, 0, 6].map((dx) => (
          <line key={dx} x1={163 + dx} y1="72.5" x2={163 + dx} y2="99.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
        ))}
        <rect x="157" y="69.5" width="12" height="3.4" rx="1" fill="#F59E0B" />
        <rect x="157" y="99" width="12" height="3.4" rx="1" fill="#F59E0B" />
        <line x1="160.4" y1="102.4" x2="160.4" y2="109" stroke="#F472B6" strokeWidth="1.3" />
        <line x1="163" y1="102.4" x2="163" y2="111" stroke="#F472B6" strokeWidth="1.3" />
        <line x1="165.6" y1="102.4" x2="165.6" y2="109" stroke="#F472B6" strokeWidth="1.3" />
      </g>
      {/* bánh trung thu trên đĩa bên trái */}
      <g>
        <ellipse cx="44" cy="172" rx="27" ry="6" fill="#E7E5E4" stroke="#D6D3D1" strokeWidth="0.8" />
        <circle cx="44" cy="158" r="15.5" fill="#B45309" stroke="#92400E" strokeWidth="1.2" />
        <circle cx="44" cy="158" r="10.5" fill="none" stroke="#92400E" strokeWidth="1.1" />
        <rect x="39.5" y="153.5" width="9" height="9" rx="1.4" transform="rotate(45 44 158)" fill="none" stroke="#78350F" strokeWidth="1.1" />
        <circle cx="44" cy="158" r="1.7" fill="#78350F" />
      </g>
      {/* thỏ ngọc */}
      <g className="sdp-bob">
        <circle cx="136" cy="152" r="9.5" fill="#FFFFFF" stroke="#E7E5E4" strokeWidth="1" />
        <ellipse cx="104" cy="142" rx="31" ry="33" fill="#FFFFFF" stroke="#E7E5E4" strokeWidth="1.2" />
        <ellipse cx="104" cy="150" rx="19" ry="22" fill="#FDF2F8" opacity="0.8" />
        <g className="sdp-ear">
          <ellipse cx="93" cy="50" rx="7.5" ry="27" transform="rotate(-7 93 50)" fill="#FFFFFF" stroke="#E7E5E4" strokeWidth="1.1" />
          <ellipse cx="93.6" cy="52" rx="3.6" ry="19" transform="rotate(-7 93 50)" fill="#FBCFE8" />
        </g>
        <g>
          <ellipse cx="116" cy="48" rx="7.5" ry="28" transform="rotate(6 116 48)" fill="#FFFFFF" stroke="#E7E5E4" strokeWidth="1.1" />
          <ellipse cx="115.4" cy="50" rx="3.6" ry="20" transform="rotate(6 116 48)" fill="#FBCFE8" />
        </g>
        <circle cx="104" cy="94" r="21.5" fill="#FFFFFF" stroke="#E7E5E4" strokeWidth="1.2" />
        <circle cx="96.6" cy="91" r="2.5" fill="#1F2937" />
        <circle cx="111.4" cy="91" r="2.5" fill="#1F2937" />
        <circle cx="97.4" cy="90" r="0.9" fill="#FFFFFF" />
        <circle cx="112.2" cy="90" r="0.9" fill="#FFFFFF" />
        <path d="M101.8,97.6 q2.2,-1.8 4.4,0 q-0.6,2.6 -2.2,2.8 q-1.6,-0.2 -2.2,-2.8 Z" fill="#F472B6" />
        <path d="M104,100.4 q0,2.4 -3,2.8 M104,100.4 q0,2.4 3,2.8" fill="none" stroke="#9CA3AF" strokeWidth="0.9" strokeLinecap="round" />
        <ellipse cx="90" cy="98.6" rx="3.6" ry="2.2" fill="#F9A8D4" opacity="0.55" />
        <ellipse cx="118" cy="98.6" rx="3.6" ry="2.2" fill="#F9A8D4" opacity="0.55" />
        <g stroke="#D1D5DB" strokeWidth="0.8" strokeLinecap="round">
          <path d="M88,96 L76,93.6 M88,99.4 L76.6,100.4 M120,96 L132,93.6 M120,99.4 L131.4,100.4" />
        </g>
        <ellipse cx="88" cy="172" rx="10" ry="5.4" fill="#FFFFFF" stroke="#E7E5E4" strokeWidth="1" />
        <ellipse cx="120" cy="172" rx="10" ry="5.4" fill="#FFFFFF" stroke="#E7E5E4" strokeWidth="1" />
        <path d="M84,128 q-5,10 -2,20 M124,128 q5,10 2,20" fill="none" stroke="#E7E5E4" strokeWidth="1.4" />
      </g>
      {/* sao nhỏ lấp lánh */}
      <g fill="#FDE68A" className="sdp-flicker">
        <path d="M64,66 l1.8,4.2 4.2,1.8 -4.2,1.8 -1.8,4.2 -1.8,-4.2 -4.2,-1.8 4.2,-1.8 Z" />
        <path d="M140,34 l1.4,3.2 3.2,1.4 -3.2,1.4 -1.4,3.2 -1.4,-3.2 -3.2,-1.4 3.2,-1.4 Z" />
      </g>
    </svg>
  );
}

const PROP_CLASS: Record<SeasonalTheme, string> = {
  tet: "w-[112px] sm:w-[198px]",
  noel: "w-[120px] sm:w-[200px]",
  halloween: "w-[138px] sm:w-[224px]",
  trungthu: "w-[118px] sm:w-[186px]",
};

function CornerProp({ theme }: { theme: SeasonalTheme }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed bottom-2 left-2 z-[43] sm:bottom-3 sm:left-3 ${PROP_CLASS[theme]}`}
      data-seasonal-prop={theme}
    >
      <style>{PROP_CSS}</style>
      {theme === "tet" ? <TetMaiTree /> : theme === "noel" ? <NoelSnowman /> : theme === "halloween" ? <HalloweenPumpkins /> : <TrungThuRabbit />}
    </div>
  );
}

/* ================= GỐC ================= */

export default function SeasonalDecor({ theme }: { theme: SeasonalTheme }) {
  const accent = SEASONAL_ACCENT[theme];
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[4] h-44"
        style={{ background: `linear-gradient(180deg, ${accent.wash}, transparent)` }}
        data-seasonal-wash={theme}
      />
      <div className="relative h-0">
        <Garland theme={theme} />
      </div>
      <CornerProp theme={theme} />
      <Particles theme={theme} />
    </>
  );
}
