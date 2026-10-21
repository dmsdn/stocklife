// lib/simulation-bridge.ts
//
// frontend가 iframe으로 Simulation(Vite) 화면 옆에 붙어있을 때, "지금 로그인된 회원이 누구인지"를
// postMessage로 부모(Simulation)에 알려주기 위한 최소 브릿지.
//
// 왜 필요한가: Simulation은 그동안 캐릭터를 고정 계정(consumerId=1, 01099998888)으로만 동작시켰다.
// 왼쪽(시뮬레이션) 캐릭터가 오른쪽(이 frontend)에서 로그인한 계정을 따라가게 하려면, 로그인/로그아웃/
// 최초 로드 시점마다 consumerId를 부모 창에 알려줘야 한다. Simulation이 부모가 아닐 수도 있으므로
// (frontend를 단독 탭으로 열었을 때 등) targetOrigin을 "*"로 두되, iframe 안에서 실행 중일 때만 보낸다.
"use client";

import { getMyProfile } from "./consumer-api";
import { isLoggedIn } from "./api-client";

export type SimulationAuthMessage =
    | { source: "storeflow-frontend"; type: "LOGIN"; consumerId: number; name: string; phoneNumber: string }
    | { source: "storeflow-frontend"; type: "LOGOUT" }
    | { source: "storeflow-frontend"; type: "CART_CHANGED" };

function isEmbeddedInIframe(): boolean {
    try {
        return typeof window !== "undefined" && window.self !== window.top;
    } catch {
        // 크로스 오리진 정책 때문에 window.top 접근 자체가 막히면 iframe 안이라고 봐야 한다.
        return true;
    }
}

function postToParent(message: SimulationAuthMessage) {
    if (!isEmbeddedInIframe()) {
        console.warn(
            "[simulation-bridge] iframe 안이 아니라서 시뮬레이션에 로그인을 못 알림. " +
            "이 웹 화면을 시뮬레이션 오른쪽 패널(iframe)이 아니라 별도 탭으로 열었으면 이 경고가 뜬다."
        );
        return; // 단독 탭으로 열려있으면 알려줄 부모가 없음
    }
    console.log("[simulation-bridge] 부모(시뮬레이션)에 메시지 전송:", message);
    window.parent.postMessage(message, "*");
}

/** 로그인 성공 직후 호출 — Simulation 캐릭터를 이 회원 계정으로 전환시킨다. */
export async function notifySimulationLogin(): Promise<void> {
    try {
        const me = await getMyProfile();
        postToParent({
            source: "storeflow-frontend",
            type: "LOGIN",
            consumerId: me.consumerId,
            name: me.name,
            phoneNumber: me.phoneNumber,
        });
    } catch (error) {
        // 프로필 조회 실패는 로그인 자체를 막을 이유가 안 됨 — 조용히 무시.
        console.error("[simulation-bridge] 로그인 알림 실패", error);
    }
}

/** 로그아웃 직후 호출 — Simulation을 다시 기본 캐릭터(비로그인 상태)로 되돌린다. */
export function notifySimulationLogout(): void {
    postToParent({ source: "storeflow-frontend", type: "LOGOUT" });
}

/**
 * 앱이 처음 켜졌을 때(=iframe이 새로 로드됐을 때) 이미 로그인되어 있으면 그 상태를 한 번 더 알려준다.
 * AppShell 마운트 시 1회 호출.
 */
export function notifySimulationOfCurrentAuthOnce(): void {
    if (!isLoggedIn()) {
        notifySimulationLogout();
        return;
    }
    void notifySimulationLogin();
}

/**
 * 장바구니를 바꾼 직후 호출. 왼쪽 시뮬레이션 화면이 DB에서 장바구니를 다시 읽어
 * 상단 배지와 결제 대상 목록을 새로고침 없이 갱신한다.
 * 실패해도 화면 동작에는 영향이 없으므로 await 하지 않아도 된다.
 */
export function notifySimulationCartChanged(): void {
    postToParent({ source: "storeflow-frontend", type: "CART_CHANGED" });
}