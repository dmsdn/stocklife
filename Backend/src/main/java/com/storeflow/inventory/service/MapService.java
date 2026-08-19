package com.storeflow.inventory.service;

import com.storeflow.inventory.dto.FloorMapResponse;
import com.storeflow.inventory.dto.MapCellResponse;
import com.storeflow.inventory.dto.ZoneMapResponse;
import com.storeflow.inventory.repository.MapCellRepository;
import com.storeflow.inventory.repository.ZoneRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class MapService {

    private final ZoneRepository zoneRepository;
    private final MapCellRepository mapCellRepository;

    public MapService(ZoneRepository zoneRepository, MapCellRepository mapCellRepository) {
        this.zoneRepository = zoneRepository;
        this.mapCellRepository = mapCellRepository;
    }

    /** 매장 지도 데이터 API(35번). 프론트 2D 지도 렌더링용 — 존 목록 + 보행 격자(무빙워크 연결 포함). */
    @Transactional(readOnly = true)
    public FloorMapResponse getFloorMap(byte floorNo) {
        List<ZoneMapResponse> zones = zoneRepository.findByFloorNo(floorNo).stream()
                .map(ZoneMapResponse::new)
                .toList();
        List<MapCellResponse> cells = mapCellRepository.findByFloorNo(floorNo).stream()
                .map(MapCellResponse::new)
                .toList();
        return new FloorMapResponse(floorNo, zones, cells);
    }
}