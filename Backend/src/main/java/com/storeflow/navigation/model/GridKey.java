package com.storeflow.navigation.model;

/** map_cells / locations의 floorNo+x+y와 동일한 격자 좌표 키. */
public record GridKey(byte floorNo, short x, short y) {

    public static GridKey of(byte floorNo, short x, short y) {
        return new GridKey(floorNo, x, y);
    }

    public static GridKey of(int floorNo, int x, int y) {
        return new GridKey((byte) floorNo, (short) x, (short) y);
    }
}