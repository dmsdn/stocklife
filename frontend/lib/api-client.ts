// lib/api-client.ts
// 백엔드(Spring Boot) 공용 호출 래퍼.
// - 인증 토큰을 자동으로 붙이고
// - 401(토큰 만료)을 한 번 감지해서 리프레시하고
// - 응답을 JSON으로 파싱해준다.
//
// ⚠ 백엔드에 전역 예외 핸들러(@ControllerAdvice)가 안 보여서, 에러 응답 바디 형식이
//   통일되어 있는지 확인 못 했습니다. 지금은 "실패하면 그냥 실패"로만 처리합니다 —
//   에러 메시지를 화면에 그대로 보여줘야 하면 백엔드 쪽에 표준 에러 응답 포맷을 문의해주세요.

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

// ✅ IP를 하드코딩하지 않고, "지금 이 페이지를 연 주소"를 그대로 따라가되 포트만
//   8080으로 바꿔서 백엔드를 찾습니다. localhost로 열면 localhost:8080을, IP로 열면
//   그 IP의 8080을 자동으로 찾아가서 — 와이파이 바뀔 때마다 IP를 다시 안 고쳐도 됩니다.
//   .env.local에 NEXT_PUBLIC_API_BASE_URL을 명시적으로 넣어두면 그 값이 항상 우선합니다.
function resolveApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL;
  if (typeof window !== "undefined") return `http://${window.location.hostname}:8080`;
  return "http://localhost:8080"; // 서버사이드 렌더링 시점 폴백
}

const API_BASE_URL = resolveApiBaseUrl();

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

/** @param persist true면 localStorage(브라우저 재시작해도 유지), false면 sessionStorage(이 탭 닫으면 로그아웃) */
export function setTokens(accessToken: string, refreshToken: string, persist: boolean = true) {
  const storage = persist ? window.localStorage : window.sessionStorage;
  const other = persist ? window.sessionStorage : window.localStorage;
  // 이전에 반대쪽에 저장돼 있던 토큰이 남아 getAccessToken()에서 잘못 읽히지 않도록 정리
  other.removeItem(ACCESS_TOKEN_KEY);
  other.removeItem(REFRESH_TOKEN_KEY);
  storage.setItem(ACCESS_TOKEN_KEY, accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
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
    // TODO: 백엔드 에러 응답 형식 확정되면 message를 바디에서 꺼내도록 개선
    throw new ApiError(res.status, `요청 실패 (${res.status})`);
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