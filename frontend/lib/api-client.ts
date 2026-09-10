// lib/api-client.ts
// 백엔드(Spring Boot) 공용 호출 래퍼.
// - 인증 토큰을 자동으로 붙이고
// - 401(토큰 만료)을 한 번 감지해서 리프레시하고
// - 응답을 JSON으로 파싱해준다.
//
// ⚠ 백엔드에 전역 예외 핸들러(@ControllerAdvice)가 없는 곳이 많아서(예: 결제 실패),
//   Spring Boot 기본 에러 바디({message: "..."} 형태로 오는 경우가 많음)에서 message를
//   최대한 꺼내서 보여줍니다. 그래도 백엔드가 표준 에러 응답 포맷을 정해서 항상
//   {message: "..."}를 내려주면 훨씬 안정적이니, 가능하면 그쪽으로 정리 요청해주세요.

// lib/session-id.ts를 따로 만들지 않고 여기서 바로 관리 — 비회원(게스트) 장바구니/이벤트가
// 전부 X-Session-Id 헤더 하나에 의존하는데, 지금까지는 apiFetch가 이 헤더를 자동으로 붙여주지
// 않아서 cart/wishlist 계열 API를 비로그인 상태로 호출하면 백엔드가 400(세션 없음)을 내고 있었다.
// 로그인 화면 등 극소수 API만 제외하면 거의 모든 API가 "로그인 상태면 Authorization, 아니면
// X-Session-Id"를 원하므로 auth:true 옵션에 얹어 자동으로 처리한다.
const GUEST_SESSION_KEY = "storeflow_guest_session_id";

// ✅ crypto.randomUUID()는 보안 컨텍스트(https 또는 localhost)에서만 존재합니다.
//   http://IP주소:3000처럼 접속하면 이 함수가 없어서 TypeError가 나고, 그게 로그인
//   fetch()가 나가기도 전에(요청 바디 만드는 단계에서) 터져버려서 "네트워크 요청 자체가
//   안 나가고 콘솔에도 안 찍히는" 것처럼 보였던 문제의 원인이었습니다. 폴백을 추가합니다.
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateGuestSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(GUEST_SESSION_KEY);
  if (!id) {
    id = generateId();
    window.localStorage.setItem(GUEST_SESSION_KEY, id);
  }
  return id;
}

// 브라우저 요청은 현재 origin의 /api를 사용한다. 개발은 Next/Vite 프록시,
// 배포는 Nginx가 백엔드로 전달하므로 HTTPS에서 HTTP:8080 요청이 생기지 않는다.
// 별도 API 서버를 쓰는 환경은 기존 NEXT_PUBLIC_API_BASE_URL 설정을 유지한다.
function resolveApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured !== undefined) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined") return "";
  return process.env.BACKEND_BASE_URL ?? "http://localhost:8080";
}

export const API_BASE_URL = resolveApiBaseUrl();

// ✅ 신규(2026-09) — 상품 이미지 URL 문제 발견: DB의 image_url 컬럼이 "/img/211590.webp"처럼
//   상대경로로 들어있는데, <img src={product.imageUrl}>로 그대로 렌더링하면 브라우저가 이걸
//   "지금 열려있는 페이지 주소" 기준으로 해석합니다 — 즉 프론트 개발서버(3000) 기준
//   localhost:3000/img/211590.webp 로 요청이 가버려서 항상 404였습니다(이미지는 백엔드
//   8080의 정적 리소스로 서빙되고 있음). photo-search 버그와 똑같은 패턴 — 상대경로가
//   엉뚱한 origin으로 해석되는 문제. 이미 http(s):// 나 data: 로 시작하는 절대경로(외부
//   CDN 등)는 그대로 두고, "/"로 시작하는 상대경로만 API_BASE_URL을 붙여줍니다.
export function resolveImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?:)?\/\//.test(url) || url.startsWith("data:")) return url;
  return `${API_BASE_URL}${url.startsWith("/") ? url : `/${url}`}`;
}

const ACCESS_TOKEN_KEY = "storeflow_access_token";
const REFRESH_TOKEN_KEY = "storeflow_refresh_token";

// ✅ "로그인 상태 유지" 체크 여부에 따라 저장소를 다르게 씁니다.
//   - localStorage: 브라우저를 완전히 껐다 켜거나 새 창을 열어도 로그인이 유지됨
//   - sessionStorage: 그 탭에서만 유지. 새 탭/새 창을 열거나 브라우저(탭)를 닫으면
//     로그인이 풀림 — "로그인 유지"를 안 눌렀을 때 원하시는 동작입니다.
//   읽을 땐 둘 다 확인합니다(로그인 당시 어느 쪽에 저장했는지 호출부가 몰라도 되게).
export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY) ?? window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY) ?? window.sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

/** ✅ 신규(요청 — "채팅 리스트·상세 링크·리브 추천") — 로그인/로그아웃(계정 전환
 *  포함)마다 쏘는 이벤트. 홈 화면 추천처럼 "지금 로그인된 계정 기준"으로 보여주는
 *  화면들이 이 이벤트를 듣고 다시 불러와서, 계정이 바뀌었는데 이전 계정 데이터가
 *  그대로 남아있는 일이 없게 합니다. */
export const AUTH_CHANGED_EVENT = "storeflow:auth-changed";

/** @param persist true면 localStorage(브라우저 재시작해도 유지), false면 sessionStorage(이 탭 닫으면 로그아웃) */


export function setTokens(accessToken: string, refreshToken: string, persist: boolean = true) {
  const storage = persist ? window.localStorage : window.sessionStorage;
  const other = persist ? window.sessionStorage : window.localStorage;
  // 이전에 반대쪽에 저장돼 있던 토큰이 남아 getAccessToken()에서 잘못 읽히지 않도록 정리
  other.removeItem(ACCESS_TOKEN_KEY);
  other.removeItem(REFRESH_TOKEN_KEY);
  storage.setItem(ACCESS_TOKEN_KEY, accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function clearTokens() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function isLoggedIn(): boolean {
  return !!getAccessToken();
}

interface ApiOptions extends RequestInit {
  auth?: boolean; // true면 Authorization 헤더 자동 첨부 (기본 true)
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { auth = true, headers, ...rest } = options;

  // ✅ FormData(파일 업로드) 바디일 땐 Content-Type을 직접 정하면 안 됨 — 브라우저가
  //   멀티파트 경계(boundary)까지 포함해서 자동으로 설정해줘야 서버가 파싱할 수 있음.
  //   기존엔 무조건 application/json을 강제해서, 이 함수로는 파일 업로드가 불가능했음.
  const isFormData = typeof FormData !== "undefined" && rest.body instanceof FormData;

  const finalHeaders: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    // ✅ 수정(2026-09) — Accept 헤더를 안 보내고 있었음. Spring Boot는 에러가 나면
    //   기본적으로 클라이언트가 뭘 원하는지 Accept 헤더를 보고 응답 형식을 정하는데,
    //   이게 없으면(또는 브라우저 fetch 기본값이 */* 라서 애매하면) HTML 에러 페이지
    //   (Whitelabel Error Page)를 내려줄 수 있어서, 아래에서 JSON으로 파싱을 시도해도
    //   항상 실패해 실제 에러 메시지를 못 꺼내오고 있었을 가능성이 큽니다.
    Accept: "application/json",
    ...(headers as Record<string, string>),
  };

  if (auth) {
    const token = getAccessToken();
    if (token) {
      finalHeaders["Authorization"] = `Bearer ${token}`;
    } else if (!finalHeaders["X-Session-Id"]) {
      // 비로그인 상태면 게스트 세션 ID를 자동으로 붙인다(장바구니 등 서버가 요구하는 헤더).
      finalHeaders["X-Session-Id"] = getOrCreateGuestSessionId();
    }
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...rest, headers: finalHeaders });

  if (!res.ok) {
    // ✅ 수정(2026-09) — 에러 바디를 아예 안 읽고 늘 "요청 실패 (상태코드)"만 보여주고
    //   있었음. 백엔드가 전역 예외 처리기 없이 예외를 그대로 던지는 곳들(예:
    //   결제 시 "결제할 상품이 선택되지 않았습니다.", "재고가 부족합니다." 등)이 있어서,
    //   Spring 기본 에러 바디({message: "..."} 형태)에 실제 원인이 들어있는 경우 그걸
    //   그대로 보여주면 사용자도, 디버깅하는 우리도 훨씬 도움이 됨. 바디가 없거나 그
    //   형식이 아니면 기존처럼 상태코드만.
    let message = `요청 실패 (${res.status})`;
    try {
      const body = await res.clone().json();
      if (body && typeof body.message === "string" && body.message.trim()) {
        message = body.message;
      } else if (typeof body === "string" && body.trim()) {
        message = body;
      }
    } catch {
      // JSON이 아니거나 바디가 없으면 기본 메시지 유지
    }
    throw new ApiError(res.status, message);
  }

  // ⚠ 201(예: 회원가입)처럼 몸통 없이 성공만 알리는 응답이 있어서, 204뿐 아니라
  //   Content-Length가 0이거나 아예 없는 경우도 파싱 없이 통과시킵니다.
  //   (안 그러면 빈 바디를 res.json()이 파싱하다 에러를 던져서, 실제로는 성공했는데
  //   프론트에서는 실패로 잡히는 문제가 생깁니다 — 회원가입에서 실제로 있었던 버그)
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}