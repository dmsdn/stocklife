// components/domain/route-dialog.tsx
// ✅ POST /api/navigation/route(lib/navigation.ts)로 실제 경로를 계산해서 보여주는 공용 다이얼로그.
// 스캔·저장 화면 둘 다에서 재사용합니다.
// ⚠ 실제 2D 지도 그래픽은 아직 없어서(별도 시각화 작업 필요), 지금은 방문 순서를 리스트로
//   보여줍니다. GET /api/map/floors/{floorNo}까지 붙이면 실제 지도 위에 경로선을 그릴 수 있습니다.
// ⚠ 시작 위치는 실제 GPS/비콘 연동 전이라 1층 (0,0) 고정입니다.
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getRoute, type RouteResult, type RouteStop } from "@/lib/navigation";

interface RouteDialogProps {
  open: boolean;
  onClose: () => void;
  stops: RouteStop[];
}

export function RouteDialog({ open, onClose, stops }: RouteDialogProps) {
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (stops.length === 0) {
      setRoute(null);
      setError("담긴 상품이 없어서 동선을 계산할 수 없어요.");
      return;
    }

    setLoading(true);
    setError(null);
    // TODO: 시작 위치를 실제 사용자 위치(스캔 위치 등)로 교체
    getRoute({ floorNo: 1, x: 0, y: 0 }, stops)
      .then(setRoute)
      .catch(() => setError("동선을 불러오지 못했어요."))
      .finally(() => setLoading(false));
  }, [open, stops]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>동선 보기</DialogTitle>
        </DialogHeader>

        {loading && <p className="py-8 text-center text-sm text-muted-foreground">경로 계산 중...</p>}
        {error && <p className="py-8 text-center text-sm text-danger">{error}</p>}

        {route && (
          <div className="space-y-1">
            <p className="mb-3 text-sm text-muted-foreground">
              총 이동 거리 {route.totalDistance}칸
            </p>
            {route.legs.map((leg) => (
              <div
                key={leg.stopIndex}
                className="flex items-center justify-between border-b border-border py-3 text-sm last:border-none"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs">
                    {leg.stopIndex + 1}
                  </span>
                  <span>{leg.label ?? (leg.skuId ? `상품 #${leg.skuId}` : "목적지")}</span>
                </div>
                <span
                  className={
                    leg.status === "OK"
                      ? "text-muted-foreground"
                      : "text-danger"
                  }
                >
                  {leg.status === "OK"
                    ? `${leg.distance}칸`
                    : leg.status === "UNRESOLVED"
                      ? "위치 확인 불가"
                      : "경로 없음"}
                </span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
