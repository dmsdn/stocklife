package com.storeflow.navigation;

import com.storeflow.inventory.entity.MapCell;
import com.storeflow.navigation.model.GridKey;
import com.storeflow.navigation.model.NavigationGraph;
import com.storeflow.navigation.service.AStarPathfinder;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.ArrayList;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

/** DB를 사용하지 않는다. 엘리베이터가 더 가까운 세계에서도 ESC만 선택해야 한다. */
class ShoppingNavigationTest {
    private MapCell cell(int f,int x,int y,String transit) throws Exception {
        var ctor=MapCell.class.getDeclaredConstructor();ctor.setAccessible(true);
        MapCell c=ctor.newInstance();
        ReflectionTestUtils.setField(c,"floorNo",(byte)f);
        ReflectionTestUtils.setField(c,"x",(short)x);ReflectionTestUtils.setField(c,"y",(short)y);
        ReflectionTestUtils.setField(c,"passable",true);ReflectionTestUtils.setField(c,"transitId",transit);
        return c;
    }
    @Test void onlyAdjacentEscalatorsAndNoSameFloorTeleport() throws Exception {
        List<MapCell> cells=new ArrayList<>();
        for(int f=1;f<=3;f++)for(int x=0;x<=4;x++)for(int y=0;y<=4;y++)
            cells.add(cell(f,x,y,x==4 && y>=3?"ESC":x==0&&y==0?"LIFT":null));
        var graph=NavigationGraph.load(cells);
        var result=AStarPathfinder.findPath(graph,GridKey.of(1,0,0),GridKey.of(3,0,0),true);
        assertNotNull(result);
        int changes=0;
        for(int i=1;i<result.path().size();i++){
            var a=result.path().get(i-1);var b=result.path().get(i);
            if(a.floorNo()!=b.floorNo()){
                changes++;
                assertEquals(1,Math.abs(a.floorNo()-b.floorNo()));
                assertEquals(4,a.x());assertEquals(a.x(),b.x());assertEquals(a.y(),b.y());
            } else assertEquals(1,Math.abs(a.x()-b.x())+Math.abs(a.y()-b.y()));
        }
        assertEquals(2,changes);assertEquals(20,result.cost());
    }
    @Test void liftOnlyMapIsUnreachableForShopping() throws Exception {
        var graph=NavigationGraph.load(List.of(cell(1,0,0,"LIFT"),cell(2,0,0,"LIFT")));
        assertNull(AStarPathfinder.findPath(graph,GridKey.of(1,0,0),GridKey.of(2,0,0),true));
    }
    @Test void actualWorldGeometryWhenFixtureProvided() throws Exception {
        String fixture=System.getenv("STOREFLOW_MAP_FIXTURE");
        org.junit.jupiter.api.Assumptions.assumeTrue(fixture!=null);
        var rows=new com.fasterxml.jackson.databind.ObjectMapper().readTree(new java.io.File(fixture));
        List<MapCell> cells=new ArrayList<>();
        for(var row:rows){
            var c=cell(row.get(0).asInt(),row.get(1).asInt(),row.get(2).asInt(),row.get(4).isNull()?null:row.get(4).asText());
            ReflectionTestUtils.setField(c,"passable",row.get(3).asInt()==1);cells.add(c);
        }
        var graph=NavigationGraph.load(cells);
        var start=graph.nearestPassable(GridKey.of(1,10,71),6);
        var goal=graph.nearestPassable(GridKey.of(3,20,20),6);
        var result=AStarPathfinder.findPath(graph,start,goal,true);
        assertNotNull(result);int changes=0;
        for(int i=0;i<result.path().size();i++){
            var b=result.path().get(i);assertTrue(graph.isPassable(b));
            if(i==0)continue;
            var a=result.path().get(i-1);
            if(a.floorNo()!=b.floorNo()){
                changes++;assertEquals(1,Math.abs(a.floorNo()-b.floorNo()));
                assertTrue(a.x()==88||a.x()==89);assertTrue(a.y()==66||a.y()==67);
                assertEquals(a.x(),b.x());assertEquals(a.y(),b.y());
            }else assertEquals(1,Math.abs(a.x()-b.x())+Math.abs(a.y()-b.y()));
        }
        assertEquals(2,changes);
        assertEquals(result.path().size()-1+changes*2,result.cost());
        System.out.println("Actual map cells="+cells.size()+", path points="+result.path().size()+", cost="+result.cost());
    }
}
