// 앱과 Simulation을 같은 origin에 배포할 때 사용하는 회원 인증.
const TOKEN_KEY = 'storeflow_access_token';

export function getMemberToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
    const token = window.localStorage.getItem(TOKEN_KEY)
        ?? window.sessionStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    try {
        const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const claims = JSON.parse(atob(part));
        if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) return null;
    } catch {
        return null;
    }
    // This is only an expiry check. The backend verifies the signature.
    return token;
    } catch {
        return null;
    }
}

export async function memberFetch(
    path: string,
    options: RequestInit = {},
): Promise<Response> {
    const token = getMemberToken();
    if (!token) {
        throw new Error('오른쪽 앱에서 회원 로그인을 먼저 해주세요.');
    }

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Accept', 'application/json');

    const response = await fetch(path, { ...options, headers });

    // 요청 도중 로그아웃하거나 계정이 바뀌면 이전 응답을 사용하지 않는다.
    if (getMemberToken() !== token) {
        throw new Error('로그인 상태가 변경되었습니다.');
    }
    if (response.status === 401 || response.status === 403) {
        throw new Error('로그인이 만료되었거나 접근 권한이 없습니다.');
    }
    return response;
}
