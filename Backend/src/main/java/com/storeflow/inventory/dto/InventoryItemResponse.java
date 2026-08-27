package com.storeflow.inventory.dto;

import com.storeflow.inventory.entity.Location;

public class InventoryItemResponse {
    private int skuId;
    private String locationId;
    private String zoneId;
    private Location.TierRole tierRole; // PICK / BULK
    private int floorNo;
    private int x;
    private int y;
    private int qty;

    public InventoryItemResponse(Integer skuId, String locationId, String zoneId, Location.TierRole tierRole,
                                  byte floorNo, short x, short y, int qty) {
        this.skuId = skuId;
        this.locationId = locationId;
        this.zoneId = zoneId;
        this.tierRole = tierRole;
        this.floorNo = floorNo;
        this.x = x;
        this.y = y;
        this.qty = qty;
    }

    public int getSkuId() { return skuId; }
    public String getLocationId() { return locationId; }
    public String getZoneId() { return zoneId; }
    public Location.TierRole getTierRole() { return tierRole; }
    public int getFloorNo() { return floorNo; }
    public int getX() { return x; }
    public int getY() { return y; }
    public int getQty() { return qty; }
}
