package com.storeflow.inventory.dto;

import java.time.Instant;

/**
 * 세계 데이터가 실려 있는지 알려주는 응답 (09-10 신설).
 *
 * [왜 필요한가] {@code GET /internal/replenishment/pending} 은 보충 대기 큐가 없을 때
 * 빈 배열을 준다. 그런데 그 빈 배열에는 두 가지 뜻이 섞여 있다.
 *
 * <pre>
 *   ① 정말로 밀린 매대가 없다        → "곧 채워져요"라고 답해도 된다
 *   ② 세계 데이터가 안 실려서 셀 게 없다 → "모르겠어요"라고 답해야 한다
 * </pre>
 *
 * 지금까지는 받는 쪽에서 이 둘을 구분할 방법이 없었다. Agent 의 가용예측은 빈 배열을
 * 큐 길이 0, 즉 "매장이 한산하다"로 읽어서 매우 빠른 보충 확률을 냈다. 404 도 500 도
 * 아니고 **틀린 확률**이 나오는 실패라 응답 검증(guard)으로도 걸러지지 않는다.
 * (Agent/backend_probe.py 의 주석이 이 문제를 기록해 두었고, 지금까지는 시연 전에
 * 사람이 그 스크립트를 손으로 돌려서 막고 있었다.)
 *
 * 이 응답은 그 판단 근거를 데이터 공급하는 쪽에서 내려준다. 부르는 쪽은
 * {@code seeded} 가 false 면 빈 큐를 "한산"이 아니라 "모름"으로 읽으면 된다.
 *
 * [기존 응답을 안 바꾼 이유] pending 의 형태를 바꾸면 이미 그것을 읽고 있는 Agent 가
 * 깨진다. 창구를 따로 내면 붙이는 쪽이 자기 속도로 옮길 수 있고, 안 붙여도 지금과
 * 똑같이 동작한다.
 */
public class WorldHealthResponse {

    /**
     * 세계 데이터가 실려 있는가. false 면 이 서버의 재고 관련 응답은 "없다"가 아니라
     * "모른다"로 읽어야 한다.
     *
     * 판단 기준은 재고 행과 매대 설정이 하나라도 있는지다. 둘 다 없으면 보충 대기 큐를
     * 계산할 재료 자체가 없다는 뜻이기 때문이다.
     */
    private final boolean seeded;

    private final long stockCount;
    private final long shelfConfigCount;

    /**
     * 격자 칸 수. 0 이면 길 안내가 성립하지 않는다 — 재고를 알아도 갈 수가 없다.
     * seeded 와 따로 두는 이유는 "재고는 있는데 지도가 없다"는 상태를 구분하기 위함이다.
     */
    private final long mapCellCount;

    /** 지금 par 밑이라 보충 대기 중인 매대 수. seeded 가 false 면 이 0 은 의미가 없다. */
    private final int pendingCount;

    /**
     * 마지막 매대 사건 시각. null 이면 사건이 한 건도 없다는 뜻이고, 이것도 세계가
     * 멈춰 있는지 판단하는 근거가 된다.
     */
    private final Instant lastShelfEventAt;

    public WorldHealthResponse(long stockCount, long shelfConfigCount, long mapCellCount,
                               int pendingCount, Instant lastShelfEventAt) {
        this.stockCount = stockCount;
        this.shelfConfigCount = shelfConfigCount;
        this.mapCellCount = mapCellCount;
        this.pendingCount = pendingCount;
        this.lastShelfEventAt = lastShelfEventAt;
        this.seeded = stockCount > 0 && shelfConfigCount > 0;
    }

    public boolean isSeeded() { return seeded; }
    public long getStockCount() { return stockCount; }
    public long getShelfConfigCount() { return shelfConfigCount; }
    public long getMapCellCount() { return mapCellCount; }
    public int getPendingCount() { return pendingCount; }
    public Instant getLastShelfEventAt() { return lastShelfEventAt; }
}
