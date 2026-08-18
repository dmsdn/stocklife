package com.storeflow.inventory.dto;

import com.storeflow.inventory.entity.Zone;

public class ZoneMapResponse {
    private String zoneId;
    private String name;
    private Zone.ZoneType zoneType;

    public ZoneMapResponse(Zone zone) {
        this.zoneId = zone.getZoneId();
        this.name = zone.getName();
        this.zoneType = zone.getZoneType();
    }

    public String getZoneId() { return zoneId; }
    public String getName() { return name; }
    public Zone.ZoneType getZoneType() { return zoneType; }
}