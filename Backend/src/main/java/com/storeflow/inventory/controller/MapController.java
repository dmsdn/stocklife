package com.storeflow.inventory.controller;

import com.storeflow.inventory.dto.FloorMapResponse;
import com.storeflow.inventory.service.MapService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/map")
public class MapController {

    private final MapService mapService;

    public MapController(MapService mapService) {
        this.mapService = mapService;
    }

    @GetMapping("/floors/{floorNo}")
    public ResponseEntity<FloorMapResponse> getFloorMap(@PathVariable byte floorNo) {
        return ResponseEntity.ok(mapService.getFloorMap(floorNo));
    }
}