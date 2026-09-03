package com.storeflow.inventory.dto;

import java.util.List;

public class FloorMapResponse {
    private byte floorNo;
    private List<ZoneMapResponse> zones;
    private List<MapCellResponse> cells;
    private List<LocationResponse> locations;
    private List<LocationResponse> facilities;   // 09-03: tier_role=FACILITY 위치 (화장실·계산대·엘리베이터…)

    public FloorMapResponse(byte floorNo, List<ZoneMapResponse> zones, List<MapCellResponse> cells,
                            List<LocationResponse> locations, List<LocationResponse> facilities) {
        this.floorNo = floorNo;
        this.zones = zones;
        this.cells = cells;
        this.locations = locations;
        this.facilities = facilities;
    }

    public byte getFloorNo() { return floorNo; }
    public List<ZoneMapResponse> getZones() { return zones; }
    public List<MapCellResponse> getCells() { return cells; }
    public List<LocationResponse> getLocations() { return locations; }
    public List<LocationResponse> getFacilities() { return facilities; }
}
