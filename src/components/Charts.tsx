import { useState } from 'react';
import type { TelemetryReading } from '../types/telemetry';

interface WaterFlowChartProps {
  waterFlowL: number;
  waterFlowDelta: number;
  history: TelemetryReading[];
}

export function WaterFlowChart({ waterFlowL, waterFlowDelta, history }: WaterFlowChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const totalBars = 14;
  // Determine split point around center (7 inactive / 7 active at ~6.75 L)
  const ratio = Math.min(0.85, Math.max(0.25, waterFlowL / 13.5));
  const activeCount = Math.round(totalBars * ratio);
  const startActiveIdx = totalBars - activeCount;

  const recentTail = history.slice(-totalBars);

  return (
    <div className="relative pt-5">
      {/* Marker Label positioned directly above active transition bar */}
      <div
        className="absolute top-0 -translate-x-1/2 text-[10.5px] font-medium text-[#2A332D] dark:text-[#B9C9BF] tabular-nums whitespace-nowrap pointer-events-none transition-all duration-200"
        style={{
          left: `${((startActiveIdx + 0.5) / totalBars) * 100}%`,
        }}
      >
        Sum {waterFlowDelta.toFixed(3)}
      </div>

      <div className="flex items-end justify-between gap-1.5 h-[74px]">
        {Array.from({ length: totalBars }, (_, idx) => {
          const isActive = idx >= startActiveIdx;
          const matchingRow = recentTail[idx - Math.max(0, totalBars - recentTail.length)];
          const barValue = matchingRow
            ? matchingRow.waterFlowL
            : Number((waterFlowL * (0.85 + (idx / totalBars) * 0.25)).toFixed(2));

          return (
            <div
              key={idx}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="relative flex-1 h-full flex items-center justify-center group cursor-pointer"
            >
              <div
                className={`w-[6.5px] sm:w-[7.5px] h-full rounded-full transition-all duration-200 ${
                  isActive
                    ? 'bg-[#6A9A40] group-hover:bg-[#578530]'
                    : 'bg-[#E3E6E4] dark:bg-white/10 group-hover:bg-[#CFD4D1] dark:group-hover:bg-white/20'
                }`}
              />
              {hoveredIdx === idx && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-20 px-2 py-0.5 rounded-md bg-[#161E19] text-white text-[10px] font-medium tabular-nums whitespace-nowrap shadow-md pointer-events-none">
                  {barValue.toFixed(2)} L
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface PowerConsumptionChartProps {
  powerTotalKwh: number;
  history: TelemetryReading[];
}

const DEFAULT_POWER_BUCKETS = [
  { label: '07:00', bars: [0.46, 0.68, 0.54, 0.84], tone: 'muted' as const },
  { label: '08:00', bars: [0.62, 0.44, 0.52], tone: 'muted' as const },
  { label: '09:00', bars: [0.58, 0.72, 0.66], tone: 'peak' as const },
  { label: '10:00', bars: [0.95, 0.74, 0.86, 0.62], tone: 'peak' as const },
  { label: '11:00', bars: [0.54, 0.48, 0.64], tone: 'muted' as const },
  { label: '12:00', bars: [0.62, 0.78, 0.66], tone: 'green' as const },
  { label: '01:00', bars: [0.84, 0.72, 0.9], tone: 'green' as const },
];

export function PowerConsumptionChart({ powerTotalKwh, history }: PowerConsumptionChartProps) {
  const [hoveredBucket, setHoveredBucket] = useState<number | null>(null);
  const scaleFactor = Math.min(1.15, Math.max(0.75, powerTotalKwh / 144));

  return (
    <div className="mt-3">
      <div className="flex items-end justify-between gap-2 h-[72px]">
        {DEFAULT_POWER_BUCKETS.map((bucket, bIdx) => {
          const histRow = history[history.length - 7 + bIdx];
          const bucketKwh = histRow
            ? Math.round(histRow.powerTotalKwh)
            : Math.round(powerTotalKwh * (0.75 + bucket.bars[0] * 0.35));

          return (
            <div
              key={bucket.label}
              onMouseEnter={() => setHoveredBucket(bIdx)}
              onMouseLeave={() => setHoveredBucket(null)}
              className="relative flex-1 h-full flex items-end justify-center gap-[3px] cursor-pointer"
            >
              {bucket.bars.map((h, i) => {
                const pct = Math.min(100, Math.round(h * scaleFactor * 100));
                const colorClass =
                  bucket.tone === 'peak'
                    ? 'bg-[#C85A2D]'
                    : bucket.tone === 'green'
                    ? 'bg-[#6B9B42]'
                    : 'bg-[#C8CDCA] dark:bg-white/20';

                return (
                  <div
                    key={i}
                    style={{ height: `${pct}%` }}
                    className={`w-[3.5px] rounded-full transition-all duration-200 ${colorClass}`}
                  />
                );
              })}
              {hoveredBucket === bIdx && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-20 px-2 py-0.5 rounded-md bg-[#161E19] text-white text-[10px] font-medium tabular-nums whitespace-nowrap shadow-md pointer-events-none">
                  {bucket.label} · {bucketKwh} kWh
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between text-[10.5px] font-medium text-[#6D7771] dark:text-[#8E9F95] tabular-nums">
        {DEFAULT_POWER_BUCKETS.map((bucket) => (
          <span key={bucket.label} className="text-center flex-1">
            {bucket.label}
          </span>
        ))}
      </div>
    </div>
  );
}

interface GrowthRateChartProps {
  growthRate: number;
  history: TelemetryReading[];
}

const DEFAULT_GROWTH_DAYS = [
  { label: 'July 20', bars: [0.34, 0.45, 0.4, 0.56, 0.48], active: false },
  { label: 'July 21', bars: [0.68, 0.82, 0.58, 0.64, 0.44], active: false },
  { label: 'July 22', bars: [0.52, 0.6, 0.78, 0.88, 0.72], active: true },
  { label: 'July 23', bars: [0.85, 0.94, 0.86, 0.74, 0.66], active: true },
  { label: 'July 24', bars: [0.62, 0.72, 0.54, 0.6, 0.48], active: false },
  { label: 'July 25', bars: [0.56, 0.46, 0.52, 0.42, 0.5], active: false },
  { label: 'July 26', bars: [0.46, 0.56, 0.48, 0.54, 0.4], active: false },
];

export function GrowthRateChart({ growthRate, history }: GrowthRateChartProps) {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const scaleFactor = Math.min(1.15, Math.max(0.7, growthRate / 0.7));

  return (
    <div className="mt-3 flex-1 flex flex-col justify-end">
      <div className="flex items-end justify-between gap-1.5 h-[104px] sm:h-[112px]">
        {DEFAULT_GROWTH_DAYS.map((day, dIdx) => {
          const histRow = history[history.length - 7 + dIdx];
          const dayRate = histRow
            ? histRow.growthRate
            : Number((growthRate * (0.72 + day.bars[2] * 0.38)).toFixed(2));

          return (
            <div
              key={day.label}
              onMouseEnter={() => setHoveredDay(dIdx)}
              onMouseLeave={() => setHoveredDay(null)}
              className="relative flex-1 h-full flex items-end justify-center gap-[3.5px] cursor-pointer group"
            >
              {day.bars.map((h, idx) => {
                const pct = Math.min(100, Math.round(h * scaleFactor * 100));
                return (
                  <div
                    key={idx}
                    style={{ height: `${pct}%` }}
                    className={`w-[3.5px] sm:w-[4px] rounded-full transition-all duration-200 ${
                      day.active
                        ? 'bg-[#6B9B42] group-hover:bg-[#578530]'
                        : 'bg-[#CFD4D0] dark:bg-white/18 group-hover:bg-[#B8BFBA] dark:group-hover:bg-white/30'
                    }`}
                  />
                );
              })}

              {hoveredDay === dIdx && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-20 px-2 py-0.5 rounded-md bg-[#161E19] text-white text-[10px] font-medium tabular-nums whitespace-nowrap shadow-md pointer-events-none">
                  {day.label} · {dayRate.toFixed(2)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[10.5px] font-medium text-[#6D7771] dark:text-[#8E9F95] tabular-nums">
        {DEFAULT_GROWTH_DAYS.map((day) => (
          <span key={day.label} className="flex-1 text-center truncate">
            {day.label}
          </span>
        ))}
      </div>
    </div>
  );
}

interface AirCo2ChartProps {
  airCo2Ppm: number;
  recordedAt?: string;
  history: TelemetryReading[];
}

export function AirCo2Chart({ airCo2Ppm, recordedAt, history }: AirCo2ChartProps) {
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);

  const defaultSteps = [625, 725, 795, 878, 860, 892, 835, airCo2Ppm || 900];
  const recent = history.slice(-8);
  const steps =
    recent.length >= 4
      ? [
          ...defaultSteps.slice(0, Math.max(0, 8 - recent.length)),
          ...recent.map((r) => r.airCo2Ppm),
        ]
      : defaultSteps;

  const width = 280;
  const height = 118;
  const minVal = 400;
  const maxVal = 940;
  const stepWidth = width / steps.length;

  const mapY = (ppm: number) => {
    const clamped = Math.min(maxVal, Math.max(minVal, ppm));
    const norm = (clamped - minVal) / (maxVal - minVal);
    return height - norm * (height - 10) - 4;
  };

  // Build SVG stepped polyline & area polygon
  let linePath = '';
  let areaPath = '';
  steps.forEach((val, idx) => {
    const x1 = idx * stepWidth;
    const x2 = (idx + 1) * stepWidth;
    const y = mapY(val);
    if (idx === 0) {
      linePath += `M ${x1} ${y} L ${x2} ${y}`;
      areaPath += `M ${x1} ${height} L ${x1} ${y} L ${x2} ${y}`;
    } else {
      linePath += ` L ${x1} ${y} L ${x2} ${y}`;
      areaPath += ` L ${x1} ${y} L ${x2} ${y}`;
    }
  });
  areaPath += ` L ${width} ${height} Z`;

  const lastIdx = steps.length - 1;
  const lastX = lastIdx * stepWidth;
  const lastY = mapY(steps[lastIdx]);

  const timeLabel = recordedAt
    ? new Date(recordedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '16:47';

  return (
    <div className="mt-2 flex items-stretch gap-2.5 flex-1">
      {/* Y-Axis Labels */}
      <div className="flex flex-col justify-between py-0.5 text-[10.5px] font-medium text-[#6D7771] dark:text-[#8E9F95] tabular-nums select-none">
        <span>900</span>
        <span>800</span>
        <span>600</span>
        <span>400</span>
      </div>

      {/* SVG Stepped Area */}
      <div className="relative flex-1 min-h-[118px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="co2AreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6B9B42" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#6B9B42" stopOpacity="0.02" />
            </linearGradient>
            <pattern id="co2Hatch" width="4" height="4" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="4" stroke="#6B9B42" strokeOpacity="0.14" strokeWidth="1" />
            </pattern>
          </defs>

          {/* Vertical subtle step grid lines */}
          {steps.map((_, idx) => (
            <line
              key={idx}
              x1={idx * stepWidth}
              y1={0}
              x2={idx * stepWidth}
              y2={height}
              className="stroke-black/6 dark:stroke-white/8"
              strokeWidth="1"
            />
          ))}

          {/* Shaded Area */}
          <path d={areaPath} fill="url(#co2AreaGrad)" />
          <path d={areaPath} fill="url(#co2Hatch)" />

          {/* Highlighted Final Step Column */}
          <rect
            x={lastX}
            y={lastY}
            width={stepWidth}
            height={height - lastY}
            fill="#6B9B42"
            fillOpacity="0.22"
          />

          {/* Top Stepped Stroke */}
          <path
            d={linePath}
            fill="none"
            stroke="#557D3B"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Interactive Hover Overlay Rects */}
          {steps.map((val, idx) => (
            <rect
              key={idx}
              x={idx * stepWidth}
              y={0}
              width={stepWidth}
              height={height}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHoveredStep(idx)}
              onMouseLeave={() => setHoveredStep(null)}
            />
          ))}
        </svg>

        {/* Timestamp pill on top-right plateau */}
        <div
          style={{
            top: `${Math.max(4, Math.min(72, (lastY / height) * 100 + 6))}%`,
            right: '4px',
          }}
          className="absolute px-1.5 py-0.5 rounded-[5px] bg-[#A5C58A]/75 dark:bg-[#4E7A32]/85 text-[#172511] dark:text-[#EDF7E8] text-[9.5px] font-semibold tabular-nums pointer-events-none"
        >
          {timeLabel}
        </div>

        {hoveredStep !== null && (
          <div
            style={{
              left: `${((hoveredStep + 0.5) / steps.length) * 100}%`,
            }}
            className="absolute -top-6 -translate-x-1/2 z-20 px-2 py-0.5 rounded-md bg-[#161E19] text-white text-[10px] font-medium tabular-nums whitespace-nowrap shadow-md pointer-events-none"
          >
            {Math.round(steps[hoveredStep])} ppm
          </div>
        )}
      </div>
    </div>
  );
}
