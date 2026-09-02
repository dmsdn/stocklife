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
}