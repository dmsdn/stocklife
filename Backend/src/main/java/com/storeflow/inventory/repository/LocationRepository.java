package com.storeflow.inventory.repository;

import com.storeflow.inventory.dto.LocationResponse;
import com.storeflow.inventory.entity.Location;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface LocationRepository extends JpaRepository<Location, String> {

    /**
     * 지도/매대 상호작용용.
     *
     * 같은 rack/bay의 L1~L3(PICK)는 같은 x,y 좌표를 공유하지만
     * 각각 다른 상품/재고를 가질 수 있으므로 세 단을 모두 내려준다.
     *
     * L4~L6(BULK)는 상단 예비재고이므로 소비자용 매대 팝업에서는 제외한다.
     */
    @Query("""
        SELECT NEW com.storeflow.inventory.dto.LocationResponse(
            l.locationId,
            l.zoneId,
            l.rackNo,
            l.bayNo,
            l.x,
            l.y
        )
        FROM Location l
        WHERE l.floorNo = :floorNo
          AND l.tierRole = :tierRole
        ORDER BY l.zoneId, l.rackNo, l.bayNo, l.levelNo
        """)
    List<LocationResponse> findMapLocationsByFloorNo(
            @Param("floorNo") byte floorNo,
            @Param("tierRole") Location.TierRole tierRole
    );

    /**
     * 09-03: 그 층의 시설 위치(tier_role=FACILITY) — 'F1-X-RESTROOM_M-1' 처럼 id 에 종류가 들어 있다.
     * 위 지도 질의는 PICK/BULK만 고르므로 시설 행은 자동으로 빠진다 — 매대 그리기에
     * 섞이지 않고, 여기서 따로 내려준다. 에이전트 find_facility 와 동선 정지점의 재료.
     */
    @Query("""
        SELECT NEW com.storeflow.inventory.dto.LocationResponse(
            l.locationId, l.zoneId, l.rackNo, l.bayNo, l.x, l.y)
        FROM Location l
        WHERE l.floorNo = :floorNo AND l.tierRole = com.storeflow.inventory.entity.Location$TierRole.FACILITY
        """)
    List<LocationResponse> findFacilityLocationsByFloorNo(@Param("floorNo") byte floorNo);
}