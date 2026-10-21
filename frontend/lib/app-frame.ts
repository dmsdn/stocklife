// lib/app-frame.ts
// 모바일 화면 틀(app/layout.tsx의 #app-frame) 관련 공용 도우미.
//
// 앱 전체가 가로폭이 고정된 "화면 틀" 안에서 그려지고, 스크롤도 브라우저(window)가
// 아니라 틀 안의 #app-scroll 요소에서 일어난다. 그래서 스크롤 위치를 읽거나,
// 모달을 띄울 위치(portal)를 정할 때는 window/document.body 대신 이 도우미를 쓴다.

export const APP_FRAME_ID = "app-frame";
export const APP_SCROLL_ID = "app-scroll";

/** 모달 · 바텀시트를 띄울 화면 틀 요소. 서버 렌더링 중이거나 틀이 없으면 null */
export function getAppFrame(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(APP_FRAME_ID);
}

/** 실제로 스크롤되는 요소. 틀이 없으면 window로 대체 */
export function getScrollRoot(): HTMLElement | Window {
  if (typeof document === "undefined") return window;
  return document.getElementById(APP_SCROLL_ID) ?? window;
}

/** 현재 세로 스크롤 위치(px) */
export function getScrollTop(): number {
  const root = getScrollRoot();
  return root instanceof Window ? root.scrollY : root.scrollTop;
}

/** 화면 맨 위로 스크롤 */
export function scrollAppToTop(behavior: ScrollBehavior = "smooth") {
  getScrollRoot().scrollTo({ top: 0, behavior });
}

/** 화면 틀의 현재 가로폭(px). 틀이 없으면 브라우저 가로폭 */
export function getAppFrameWidth(): number {
  return getAppFrame()?.clientWidth ?? window.innerWidth;
}
