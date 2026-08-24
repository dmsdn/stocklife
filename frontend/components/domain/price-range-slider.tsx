// components/domain/price-range-slider.tsx
// ✅ 값 말풍선이 양 끝(0%, 100%)에서 화면 밖으로 튀어나가던 문제를 clamp()로 고치고,
//   슬라이더 대신 숫자를 직접 입력할 수 있는 칸을 추가했습니다.
"use client";

export interface PriceRangeSliderProps {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
}

// 말풍선 너비의 절반만큼 안쪽으로 여백을 둬서 0%/100% 근처에서도 화면 밖으로 안 나가게 함
const BUBBLE_HALF_WIDTH = "28px";

export function PriceRangeSlider({ min, max, step = 1000, value, onChange }: PriceRangeSliderProps) {
  const [low, high] = value;
  const toPercent = (v: number) => ((v - min) / (max - min)) * 100;
  const clampedLeft = (percent: number) =>
    `clamp(${BUBBLE_HALF_WIDTH}, ${percent}%, calc(100% - ${BUBBLE_HALF_WIDTH}))`;

  const handleLowChange = (next: number) => {
    const clamped = Math.min(Math.max(next, min), high - step);
    onChange([clamped, high]);
  };
  const handleHighChange = (next: number) => {
    const clamped = Math.max(Math.min(next, max), low + step);
    onChange([low, clamped]);
  };

  return (
    <div className="pt-8">
      <div className="relative h-1 w-full rounded-full bg-border">
        <div
          className="absolute h-1 rounded-full bg-primary"
          style={{ left: `${toPercent(low)}%`, right: `${100 - toPercent(high)}%` }}
        />

        {/* 값 말풍선 — clamp()로 화면 밖으로 안 나가게 */}
        <span
          className="absolute -top-9 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background"
          style={{ left: clampedLeft(toPercent(low)) }}
        >
          {low.toLocaleString()}원
        </span>
        <span
          className="absolute -top-9 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background"
          style={{ left: clampedLeft(toPercent(high)) }}
        >
          {high.toLocaleString()}원
        </span>

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={low}
          onChange={(e) => handleLowChange(Number(e.target.value))}
          className="range-thumb pointer-events-none absolute inset-x-0 top-1/2 h-1 w-full -translate-y-1/2 appearance-none bg-transparent"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={high}
          onChange={(e) => handleHighChange(Number(e.target.value))}
          className="range-thumb pointer-events-none absolute inset-x-0 top-1/2 h-1 w-full -translate-y-1/2 appearance-none bg-transparent"
        />
      </div>

      <div className="mt-3 flex justify-between text-xs text-muted-foreground">
        <span>{min.toLocaleString()}원</span>
        <span>{max.toLocaleString()}원</span>
      </div>

      {/* ✅ 직접 입력 */}
      <div className="mt-4 flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={high - step}
          step={step}
          value={low}
          onChange={(e) => handleLowChange(Number(e.target.value) || min)}
          className="w-full min-w-0 rounded-md border border-border px-3 py-2 text-sm"
        />
        <span className="shrink-0 text-muted-foreground">~</span>
        <input
          type="number"
          inputMode="numeric"
          min={low + step}
          max={max}
          step={step}
          value={high}
          onChange={(e) => handleHighChange(Number(e.target.value) || max)}
          className="w-full min-w-0 rounded-md border border-border px-3 py-2 text-sm"
        />
        <span className="shrink-0 text-sm text-muted-foreground">원</span>
      </div>

      <style jsx>{`
        .range-thumb::-webkit-slider-thumb {
          pointer-events: auto;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: var(--background);
          border: 2px solid var(--foreground);
          cursor: pointer;
        }
        .range-thumb::-moz-range-thumb {
          pointer-events: auto;
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: var(--background);
          border: 2px solid var(--foreground);
          cursor: pointer;
        }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
      `}</style>
    </div>
  );
}
