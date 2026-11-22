import { ArrowUpRight } from 'lucide-react';

interface HarvestAiGaugeProps {
  score: number;
  status: string;
  onExpand: () => void;
}

export function HarvestAiGauge({ score, status, onExpand }: HarvestAiGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score));

  // Semi-circular horseshoe geometry: 225° sweep from 157.5° to 382.5°
  const cx = 110;
  const cy = 92;
  const radius = 70;
  const startAngleDeg = 152;
  const endAngleDeg = 388; // 236 deg total sweep
  const totalSweep = endAngleDeg - startAngleDeg;
  const activeEndDeg = startAngleDeg + (totalSweep * clamped) / 100;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const polar = (deg: number, r = radius) => ({
    x: cx + r * Math.cos(toRad(deg)),
    y: cy + r * Math.sin(toRad(deg)),
  });

  const describeArc = (start: number, end: number, r = radius) => {
    const p1 = polar(start, r);
    const p2 = polar(end, r);
    const largeArc = end - start > 180 ? 1 : 0;
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  };

  // Generate subtle radial tick segments along the track for realistic gauge texture
  const tickCount = 34;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const deg = startAngleDeg + (i / (tickCount - 1)) * totalSweep;
    const isFilled = deg <= activeEndDeg;
    const inner = polar(deg, radius - 4);
    const outer = polar(deg, radius + 4);
    return { deg, isFilled, inner, outer };
  });

  // Leaf tip highlight coordinate
  const tipPos = polar(activeEndDeg, radius);

  return (
    <div className="w-[238px] sm:w-[274px] rounded-[24px] bg-white/78 dark:bg-[#131D17]/82 backdrop-blur-xl border border-white/75 dark:border-white/15 shadow-[0_18px_45px_rgba(12,28,16,0.16)] p-4 sm:p-5 transition-colors">
      {/* Card Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-white/85 dark:bg-white/10 border border-black/5 dark:border-white/10 flex items-center justify-center shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4 text-[#1E2722] dark:text-[#D9ECDF]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
              <path d="M19 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
            </svg>
          </div>
          <span className="text-[15px] font-medium tracking-tight text-[#161F1A] dark:text-[#EFF6F1] truncate">
            Harvest AI
          </span>
        </div>

        <button
          type="button"
          onClick={onExpand}
          aria-label="Inspect Harvest AI history"
          className="w-8 h-8 rounded-full bg-white/85 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 border border-black/5 dark:border-white/10 flex items-center justify-center text-[#1F2923] dark:text-[#E2EDE6] transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B9B42] shrink-0 cursor-pointer"
        >
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>

      {/* Gauge Body */}
      <div className="relative mt-2 flex flex-col items-center">
        <svg
          viewBox="0 0 220 142"
          className="w-full max-w-[224px] overflow-visible"
          role="img"
          aria-label={`Harvest AI score ${Math.round(clamped)} percent, ${status}`}
        >
          <defs>
            <linearGradient id="harvestArcGradient" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#85B653" />
              <stop offset="55%" stopColor="#6B9B42" />
              <stop offset="100%" stopColor="#4A7A2C" />
            </linearGradient>
            <linearGradient id="harvestLeafAccent" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#94C954" />
              <stop offset="100%" stopColor="#4C7D2E" />
            </linearGradient>
          </defs>

          {/* Background track arc */}
          <path
            d={describeArc(startAngleDeg, endAngleDeg)}
            fill="none"
            className="stroke-[#1E2B22]/10 dark:stroke-white/12"
            strokeWidth="9"
            strokeLinecap="round"
          />

          {/* Fine radial tick texture along track */}
          {ticks.map((t, idx) => (
            <line
              key={idx}
              x1={t.inner.x}
              y1={t.inner.y}
              x2={t.outer.x}
              y2={t.outer.y}
              strokeWidth="1.2"
              className={
                t.isFilled
                  ? 'stroke-[#68983E]/35 dark:stroke-[#8AC257]/35'
                  : 'stroke-[#1E2B22]/12 dark:stroke-white/12'
              }
            />
          ))}

          {/* Active Botanical Fill Arc */}
          {clamped > 1 && (
            <path
              d={describeArc(startAngleDeg, activeEndDeg)}
              fill="none"
              stroke="url(#harvestArcGradient)"
              strokeWidth="10"
              strokeLinecap="round"
            />
          )}

          {/* Organic Botanical Canopy Tip Accent (matches curved plant accent on reference arc) */}
          {clamped > 5 && (
            <g transform={`translate(${tipPos.x.toFixed(1)}, ${tipPos.y.toFixed(1)}) rotate(${activeEndDeg - 265})`}>
              <ellipse
                cx="0"
                cy="0"
                rx="13"
                ry="6"
                fill="url(#harvestLeafAccent)"
                opacity="0.95"
              />
              <path
                d="M -9 0 Q 0 -3 9 0"
                fill="none"
                stroke="#C9F098"
                strokeWidth="1.2"
                opacity="0.7"
              />
            </g>
          )}
        </svg>

        {/* Center Readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-5 pointer-events-none">
          <span className="text-[28px] sm:text-[31px] font-semibold tracking-tight text-[#141C17] dark:text-white tabular-nums leading-none">
            {Math.round(clamped)}%
          </span>
          <span className="mt-1.5 text-[12px] font-medium text-[#55615A] dark:text-[#A4B5AA]">
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}
