/** 앱 지도와 함께 부모 시뮬레이션에도 같은 상품 위치를 표시한다. */
export function notifySimulationLocation(info: {skuId: number; name: string; floorNo: number; x: number; y: number}) {
  if (typeof window === "undefined" || window.parent === window) return;
  const parentOrigin = document.referrer ? new URL(document.referrer).origin : window.location.origin;
  window.parent.postMessage({source: "storeflow-frontend", type: "LOCATE_PRODUCT", ...info}, parentOrigin);
}
