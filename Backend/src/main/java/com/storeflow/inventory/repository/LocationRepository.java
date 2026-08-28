package com.storeflow.inventory.repository;

import com.storeflow.inventory.dto.LocationResponse;
import com.storeflow.inventory.entity.Location;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface LocationRepository extends JpaRepository<Location, String> {

    /**
     * 지도 렌더링용(35번, /api/map/floors/{floorNo} 확장). 같은 랙의 여러 레벨은 좌표가
     * 동일하므로 levelNo=2(대표 레벨) 한 행만 매대 하나로 취급해서 내려준다.
     */
    @Query("""
        SELECT NEW com.storeflow.inventory.dto.LocationResponse(
            l.locationId, l.zoneId, l.rackNo, l.bayNo, l.x, l.y)
        FROM Location l
        WHERE l.floorNo = :floorNo AND l.levelNo = 2
        """)
    List<LocationResponse> findMapLocationsByFloorNo(@Param("floorNo") byte floorNo);
}
