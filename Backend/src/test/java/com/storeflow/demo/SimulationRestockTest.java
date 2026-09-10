package com.storeflow.demo;
import com.storeflow.inventory.service.InventoryService;
import com.storeflow.inventory.entity.ShelfEvent;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class SimulationRestockTest {
 final JdbcTemplate db=mock(JdbcTemplate.class);
 final InventoryService inventory=mock(InventoryService.class);
 final SimulationRestockController controller=new SimulationRestockController(db,inventory);
 void setup(String phone,int bulk){
  ReflectionTestUtils.setField(controller,"enabled",true);
  when(db.queryForObject(anyString(),eq(String.class),eq(2002L))).thenReturn(phone);
  when(db.queryForList(anyString(),eq(207291))).thenReturn(List.of(Map.of("location_id","P","tier_role","PICK","qty",0),Map.of("location_id","B","tier_role","BULK","qty",bulk)));
 }
 @Test void rejectsOrdinaryAccountBeforeInventoryRead(){setup("01012345678",10);assertThrows(ResponseStatusException.class,()->controller.restock(2002L,new SimulationRestockController.Request(207291,"P",5)));verifyNoInteractions(inventory);verify(db,never()).queryForList(anyString(),eq(207291));}
 @Test void insufficientBulkDoesNotChangeEitherStock(){setup("01090000001",4);assertThrows(ResponseStatusException.class,()->controller.restock(2002L,new SimulationRestockController.Request(207291,"P",5)));verifyNoInteractions(inventory);}
 @Test void movesFiveWithoutCreatingStock(){setup("01090000001",10);assertEquals(5,controller.restock(2002L,new SimulationRestockController.Request(207291,"P",5)).get("stock"));var order=inOrder(inventory);order.verify(inventory).applyChange(eq(207291),eq("B"),eq(-5),eq(ShelfEvent.EventType.ITEM_CONFIRMED),anyString());order.verify(inventory).applyChange(eq(207291),eq("P"),eq(5),eq(ShelfEvent.EventType.RESTOCK_IN),anyString());}
 @Test void wrongLocationAndQuantityAreRejected(){setup("01090000001",10);assertThrows(ResponseStatusException.class,()->controller.restock(2002L,new SimulationRestockController.Request(207291,"B",5)));assertThrows(ResponseStatusException.class,()->controller.restock(2002L,new SimulationRestockController.Request(207291,"P",500)));verifyNoInteractions(inventory);}
}
