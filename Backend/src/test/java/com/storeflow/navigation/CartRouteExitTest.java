package com.storeflow.navigation;

import com.storeflow.navigation.dto.NavigationRequest;
import com.storeflow.navigation.service.CartRouteService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.junit.jupiter.api.Assertions.*;

class CartRouteExitTest {
    @Test void checkedProductsThenEntranceAndOwnershipArePreserved() {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:route_exit;DB_CLOSE_DELAY=-1", "sa", "");
        var db=new JdbcTemplate(ds);
        db.execute("CREATE TABLE cart_group(cart_group_id BIGINT,consumer_id BIGINT,title VARCHAR)");
        db.execute("CREATE TABLE cart_item(cart_group_id BIGINT,sku_id INT,is_checked BOOLEAN,quantity INT)");
        db.execute("CREATE TABLE products(sku_id INT,name VARCHAR)");
        db.execute("CREATE TABLE stocks(sku_id INT,location_id VARCHAR,qty INT)");
        db.execute("CREATE TABLE locations(location_id VARCHAR,floor_no INT,x INT,y INT,tier_role VARCHAR)");
        db.execute("CREATE TABLE map_cells(floor_no INT,x INT,y INT,passable BOOLEAN,transit_id VARCHAR,facility_kind VARCHAR)");
        db.update("INSERT INTO cart_group VALUES(1,7,'test')");
        db.update("INSERT INTO cart_item VALUES(1,100,TRUE,1),(1,101,FALSE,1)");
        db.update("INSERT INTO products VALUES(100,'checked'),(101,'unchecked')");
        db.update("INSERT INTO locations VALUES('pick',1,3,0,'PICK')");
        db.update("INSERT INTO stocks VALUES(100,'pick',2)");
        for(int x=0;x<=4;x++)db.update("INSERT INTO map_cells VALUES(1,?,0,TRUE,NULL,?)",x,x==0?"ENTRANCE":null);
        var request=new NavigationRequest();request.setGroupId(1L);request.setFloor(1);request.setX(1);request.setY(0);
        var service=new CartRouteService(db);
        var result=service.buildCartRoute(7L,request);
        assertEquals(1,result.getStops().size());assertEquals(100,result.getStops().get(0).getSkuId());
        var last=result.getPath().get(result.getPath().size()-1);
        assertEquals(0,last.getX());assertEquals(1,last.getFloor());assertEquals(5,result.getTotalDistance());
        assertThrows(IllegalStateException.class,()->service.buildCartRoute(8L,request));
    }
}
