package com.storeflow.inventory.service;

import com.storeflow.inventory.dto.FloorMapResponse;
import com.storeflow.inventory.dto.LocationResponse;
import com.storeflow.inventory.dto.MapCellResponse;
import com.storeflow.inventory.dto.ZoneMapResponse;
import com.storeflow.inventory.repository.LocationRepository;
import com.storeflow.inventory.repository.MapCellRepository;
import com.storeflow.inventory.repository.ZoneRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class MapService {

    private final ZoneRepository zoneRepository;
    private final MapCellRepository mapCellRepository;
    private final LocationRepository locationRepository;

    public MapService(ZoneRepository zoneRepository, MapCellRepository mapCellRepository,
                       LocationRepository locationRepository) {
        this.zoneRepository = zoneRepository;
        this.mapCellRepository = mapCellRepository;
        this.locationRepository = locationRepository;
    }

    /** 매장 지도 데이터 API(35번). 프론트 2D 지도 렌더링용 — 존 목록 + 보행 격자(무빙워크 연결 포함)
     *  + 매대 위치 목록(존 박스·랙 그룹핑은 프론트가 이 좌표들로부터 계산한다). */
    @Transactional(readOnly = true)
    public FloorMapResponse getFloorMap(byte floorNo) {
        List<ZoneMapResponse> zones = zoneRepository.findByFloorNo(floorNo).stream()
                .map(ZoneMapResponse::new)
                .toList();
        List<MapCellResponse> cells = mapCellRepository.findByFloorNo(floorNo).stream()
                .map(MapCellResponse::new)
                .toList();
        List<LocationResponse> locations = locationRepository.findMapLocationsByFloorNo(floorNo);
        return new FloorMapResponse(floorNo, zones, cells, locations);
    }
}
