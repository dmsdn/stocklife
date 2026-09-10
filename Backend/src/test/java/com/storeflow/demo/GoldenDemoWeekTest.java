package com.storeflow.demo;

import java.time.LocalDate;
import java.util.List;
import com.storeflow.cart.service.CartService;
import com.storeflow.chat.service.ChatService;
import com.storeflow.inventory.service.*;
import com.storeflow.notification.service.NotificationService;
import com.storeflow.order.service.OrderService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GoldenDemoWeekTest {
 final JdbcTemplate db=mock(JdbcTemplate.class);
 final ChatService chats=mock(ChatService.class);
 final GoldenDemoController demo=new GoldenDemoController(db,mock(CartService.class),chats,mock(InventoryService.class),mock(ConsumerEventService.class),mock(NotificationService.class),mock(OrderService.class),mock(RestTemplate.class));
 @Test void rosterMatchesSixDatesAndStopsOutsidePeriod(){
  for(int i=0;i<6;i++){
   var date=LocalDate.of(2026,9,10+i);
   assertEquals(date,GoldenDemoPlan.dateFor("0109000000"+(i+1)));
   assertEquals("0109000000"+(i+1),GoldenDemoPlan.phoneFor(date));
  }
  assertNull(GoldenDemoPlan.phoneFor(LocalDate.of(2026,9,9)));
  assertNull(GoldenDemoPlan.phoneFor(LocalDate.of(2026,9,16)));
  assertThrows(IllegalArgumentException.class,()->GoldenDemoPlan.dateFor("01090000007"));
  assertEquals("golden-09010-",GoldenDemoPlan.historyPrefix(LocalDate.of(2026,9,10)));
  assertEquals("golden-0915-",GoldenDemoPlan.historyPrefix(LocalDate.of(2026,9,15)));
 }
 @Test void disabledDemoRejectsEvenGoldenAccount(){assertThrows(ResponseStatusException.class,()->demo.status(2002L));verifyNoInteractions(db,chats);}
 @Test void ordinaryAccountCannotUseDemo(){
  ReflectionTestUtils.setField(demo,"enabled",true);
  when(db.queryForObject("select phone_number from consumer where consumer_id=?",String.class,3000L)).thenReturn("01080000050");
  assertThrows(ResponseStatusException.class,()->demo.newSession(3000L,new GoldenDemoController.Scene(40L,null)));
  verifyNoInteractions(chats);
 }
 @Test void AnotherGoldenAccountsSessionRemainsForbidden(){
  ReflectionTestUtils.setField(demo,"enabled",true);
  when(db.queryForObject("select phone_number from consumer where consumer_id=?",String.class,3000L)).thenReturn("01090000002");
  when(db.queryForObject("select count(*) from chat_session where session_id=? and consumer_id=?",Integer.class,"other-account-session",3000L)).thenReturn(0);
  assertThrows(ResponseStatusException.class,()->demo.entry(3000L,new GoldenDemoController.Scene(null,"other-account-session")));
  verifyNoInteractions(chats);
 }
 @Test void checkoutPassesOnlyTheDesignatedProductToMainCheckoutContract(){
  JdbcTemplate checkoutDb=mock(JdbcTemplate.class,inv->{
   String sql=inv.getArguments().length>0?String.valueOf(inv.getArguments()[0]):"";
   if(inv.getMethod().getName().equals("queryForList")){
    if(sql.startsWith("select s.location_id"))return List.of(java.util.Map.of("location_id","F1-D-R01-B01-L2","qty",12,"floor_no",1));
    return List.of();
   }
   if(inv.getMethod().getName().equals("queryForObject")){
    Class<?> type=inv.getArgument(1);
    if(type==String.class)return sql.contains("phone_number")?"01090000002":"골든 · 결제";
    if(type==Long.class)return 2004L;
    if(type==Integer.class){
     if(sql.contains("sum(quantity)"))return 4;
     if(sql.contains("select ci.sku_id"))return 200001;
     if(sql.contains("not in")||sql.contains("sku_id<>200001")||sql.contains("point_balance"))return 0;
     return 1;
    }
   }
   return org.mockito.Answers.RETURNS_DEFAULTS.answer(inv);
  });
  OrderService checkoutOrders=mock(OrderService.class);
  GoldenDemoController target=new GoldenDemoController(checkoutDb,mock(CartService.class),chats,mock(InventoryService.class),mock(ConsumerEventService.class),mock(NotificationService.class),checkoutOrders,mock(RestTemplate.class));
  ReflectionTestUtils.setField(target,"enabled",true);
  target.checkout(2004L,new GoldenDemoController.Scene(50L,null));
  verify(checkoutOrders).checkout(2004L,50L,0,List.of(200001));
 }
}
