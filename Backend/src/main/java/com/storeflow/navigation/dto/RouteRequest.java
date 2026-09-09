package com.storeflow.navigation.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * 순서(stops)는 이미 AI가 자연어를 해석해서 정한 방문 순서 그대로 온다.
 * 이 순서를 바꾸는 판단은 백엔드가 하지 않는다 — 백엔드는 그 순서대로
 * 좌표를 이어주는 "계산"만 담당한다.
 */
public class RouteRequest {

    @NotNull
    private Integer startFloor;

    @NotNull
    private Integer startX;

    @NotNull
    private Integer startY;

    @NotEmpty(message = "목적지가 최소 1개는 있어야 합니다.")
    @Valid
    @jakarta.validation.constraints.Size(max = 64)
    private List<RouteStopRequest> stops;
    private boolean escalatorsOnly;
    public boolean isEscalatorsOnly() { return escalatorsOnly; }
    public void setEscalatorsOnly(boolean value) { escalatorsOnly = value; }

    public Integer getStartFloor() { return startFloor; }
    public void setStartFloor(Integer startFloor) { this.startFloor = startFloor; }
    public Integer getStartX() { return startX; }
    public void setStartX(Integer startX) { this.startX = startX; }
    public Integer getStartY() { return startY; }
    public void setStartY(Integer startY) { this.startY = startY; }
    public List<RouteStopRequest> getStops() { return stops; }
    public void setStops(List<RouteStopRequest> stops) { this.stops = stops; }
}