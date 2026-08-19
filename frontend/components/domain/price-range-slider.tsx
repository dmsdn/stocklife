// components/domain/price-range-slider.tsx
// ✅ 신규. 겹친 range input 2개를 쓰는 표준적인 방식의 이중 핸들 슬라이더.
// value는 [min, max] 원 단위, step 단위로 스냅됩니다.
"use client";

export interface PriceRangeSliderProps {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
}

export function PriceRangeSlider({ min, max, step = 1000, value, onChange }: PriceRangeSliderProps) {
  const [low, high] = value;
  const toPercent = (v: number) => ((v - min) / (max - min)) * 100;

  const handleLowChange = (next: number) => {
    onChange([Math.min(next, high - step), high]);
  };
  const handleHighChange = (next: number) => {
    onChange([low, Math.max(next, low + step)]);
  };

  return (
    <div className="pt-8">
      <div className="relative h-1 w-full rounded-full bg-border">
        <div
          className="absolute h-1 rounded-full bg-primary"
          style={{ left: `${toPercent(low)}%`, right: `${100 - toPercent(high)}%` }}
        />

        {/* 값 말풍선 */}
        <span
          className="absolute -top-9 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs text-background"
          style={{ left: `${toPercent(low)}%` }}
        >
          {low.toLocaleString()}원
        </span>
        <span
          className="absolute -top-9 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs text-background"
          style={{ left: `${toPercent(high)}%` }}
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

      {/* 슬라이더 손잡이(thumb)만 클릭 가능하게 — 트랙 자체는 pointer-events-none이라 겹쳐도 됨 */}
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
      `}</style>
    </div>
  );
}
