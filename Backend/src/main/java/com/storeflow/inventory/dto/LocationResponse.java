package com.storeflow.inventory.dto;


/**
 * 프론트 지도 렌더링용 매대 위치 응답. 같은 랙(zoneId+rackNo+bayNo)의 여러 레벨(L1~L6)은
 * 평면 좌표(x,y)가 전부 동일하므로(schema_v2.sql 주석 참고), 매대 하나당 한 행만 내려준다
 * (levelNo=2로 고정 — 프론트가 기존에 로컬 floor{N}.json에서 쓰던 것과 동일한 대표 레벨).
 */
public class LocationResponse {
    private final String locationId;
    private final String zoneId;
    private final int rackNo;
    private final int bayNo;
    private final int x;
    private final int y;

    public LocationResponse(String locationId, String zoneId, byte rackNo, byte bayNo, short x, short y) {
        this.locationId = locationId;
        this.zoneId = zoneId;
        this.rackNo = rackNo;
        this.bayNo = bayNo;
        this.x = x;
        this.y = y;
    }

    public String getLocationId() { return locationId; }
    public String getZoneId() { return zoneId; }
    public int getRackNo() { return rackNo; }
    public int getBayNo() { return bayNo; }
    public int getX() { return x; }
    public int getY() { return y; }
}
