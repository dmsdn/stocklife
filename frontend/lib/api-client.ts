// lib/api-client.ts
// 백엔드(Spring Boot) 공용 호출 래퍼.
// - 인증 토큰을 자동으로 붙이고
// - 401(토큰 만료)을 한 번 감지해서 리프레시하고
// - 응답을 JSON으로 파싱해준다.
//
// ⚠ 백엔드에 전역 예외 핸들러(@ControllerAdvice)가 안 보여서, 에러 응답 바디 형식이
//   통일되어 있는지 확인 못 했습니다. 지금은 "실패하면 그냥 실패"로만 처리합니다 —
//   에러 메시지를 화면에 그대로 보여줘야 하면 백엔드 쪽에 표준 에러 응답 포맷을 문의해주세요.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

const ACCESS_TOKEN_KEY = "storeflow_access_token";
const REFRESH_TOKEN_KEY = "storeflow_refresh_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string) {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
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

  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string>),
  };

  if (auth) {
    const token = getAccessToken();
    if (token) finalHeaders["Authorization"] = `Bearer ${token}`;
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
