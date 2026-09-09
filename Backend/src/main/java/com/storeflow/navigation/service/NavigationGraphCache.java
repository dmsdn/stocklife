package com.storeflow.navigation.service;

import com.storeflow.inventory.repository.MapCellRepository;
import com.storeflow.navigation.model.NavigationGraph;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 보행 그래프 캐시 (2026-09-03).
 *
 * <p>[왜] 이전에는 {@code buildRoute} 가 요청마다 {@code NavigationGraph.load(mapCellRepository.findAll())}
 * 를 불렀다. map_cells 는 21,375행이고, 그 21,375행을 DB에서 읽어 엔티티로 만들고 해시맵을 짓는 데
 * <b>요청당 2.26초</b>가 든다(실측: 정지점 1개도 4개도 2.26초로 동일 — A* 자체는 밀리초라 값이 정지점
 * 수와 무관했다. 즉 그 시간은 전부 그래프 적재였다).
 *
 * <p>에이전트의 동선 최적화는 구간 비용을 재려고 이 창구를 한 번의 질문에 십수 번 부른다. 그래서
 * "화장실 들렀다가 계란, 마지막에 계산대" 같은 질문이 80~110초가 됐다. 알고리즘(층 분해 + Held-Karp)이
 * 느린 게 아니라 <b>거리를 묻는 값이 비쌌다.</b>
 *
 * <p>[왜 캐시해도 되나] 매장 격자는 <b>정적</b>이다. 상품·재고는 매 순간 바뀌지만 통로와 벽은 시드를
 * 다시 넣을 때만 바뀐다. 그래서 그래프는 프로세스 수명 동안 한 번만 지으면 된다.
 *
 * <p>[무효화] 자동 만료를 두지 않는다 — TTL 이 있으면 "왜 어떤 요청만 2초 느리지"가 생기고, 그 2초는
 * 하필 시연 중에 나온다. 대신 <b>명시적으로</b> 비운다:
 * <ul>
 *   <li>{@code POST /internal/navigation/graph/reload} — 시드를 다시 넣은 뒤 한 번 부른다</li>
 *   <li>백엔드 재기동</li>
 * </ul>
 * 시드 재적재는 DELETE 후 INSERT 라 행 수가 그대로여서 {@code count(*)} 로는 감지할 수 없다. 조용히
 * 옛 그래프를 쓰느니 <b>부르게 만드는 편</b>이 낫다 — 기동·재적재 로그에 칸 수를 찍어 눈에 보이게 한다.
 */
@Component
public class NavigationGraphCache {

    private static final Logger log = LoggerFactory.getLogger(NavigationGraphCache.class);

    private final MapCellRepository mapCellRepository;

    /** volatile: 다른 스레드가 지은 그래프를 즉시 본다(요청은 여러 스레드에서 동시에 온다). */
    private volatile NavigationGraph cached;

    public NavigationGraphCache(MapCellRepository mapCellRepository) {
        this.mapCellRepository = mapCellRepository;
    }

    /**
     * 그래프를 돌려준다. 없으면 짓는다.
     *
     * <p>이중 검사 잠금: 흔한 경우(이미 있음)는 잠금 없이 지나가고, 처음 한 번만 동기화한다.
     * 동시에 열 요청이 들어와도 21,375행을 열 번 읽지 않는다.
     */
    public NavigationGraph get() {
        NavigationGraph g = cached;
        if (g == null) {
            synchronized (this) {
                if (cached == null) {
                    long t0 = System.currentTimeMillis();
                    cached = NavigationGraph.load(mapCellRepository.findAll());
                    log.info("보행 그래프 적재 — {}ms (이후 요청은 이 그래프를 재사용한다)",
                            System.currentTimeMillis() - t0);
                }
                g = cached;
            }
        }
        return g;
    }

    /** 시드를 다시 넣었을 때. 다음 경로 요청이 새로 짓는다. */
    public void invalidate() {
        cached = null;
        log.info("보행 그래프 캐시 비움 — 다음 경로 요청에서 다시 적재한다");
    }
}
