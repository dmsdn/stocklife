package com.storeflow.demo;

import com.storeflow.global.security.CurrentConsumer;
import com.storeflow.cart.service.CartService;
import com.storeflow.cart.dto.*;
import com.storeflow.chat.service.ChatService;
import com.storeflow.inventory.service.*;
import com.storeflow.inventory.entity.*;
import com.storeflow.notification.service.NotificationService;
import com.storeflow.order.service.OrderService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import java.util.*;

/** Deliberately limited to the explicitly provisioned demonstration account. */
@RestController
@RequestMapping("/api/demo")
public class GoldenDemoController {

 @org.springframework.beans.factory.annotation.Autowired private com.storeflow.order.repository.OrderRepository orderRepository;
 private final JdbcTemplate db; private final CartService carts; private final ChatService chats;
 private final InventoryService inventory; private final ConsumerEventService events;
 private final NotificationService notifications; private final OrderService orders; private final RestTemplate http;
 @Value("${storeflow.golden-demo-enabled:false}") private boolean enabled;
 @Value("${agent.base-url:http://localhost:8000}") private String agent;
 @Value("${internal.service-key:}") private String key;
 public GoldenDemoController(JdbcTemplate db,CartService carts,ChatService chats,InventoryService inventory,
   ConsumerEventService events,NotificationService notifications,OrderService orders,RestTemplate http){
  this.db=db;this.carts=carts;this.chats=chats;this.inventory=inventory;this.events=events;this.notifications=notifications;this.orders=orders;this.http=http;
 }
 private void owner(Long id){
  if(!enabled || id==null)throw new ResponseStatusException(HttpStatus.FORBIDDEN,"시연 전용 계정에서만 사용할 수 있습니다.");
  String phone=db.queryForObject("select phone_number from consumer where consumer_id=?",String.class,id);
  if(phone==null||!GoldenDemoPlan.PHONES.contains(phone))throw new ResponseStatusException(HttpStatus.FORBIDDEN);
 }
 private LocalDate demoDate(long id){return GoldenDemoPlan.dateFor(db.queryForObject("select phone_number from consumer where consumer_id=?",String.class,id));}
 private String prefix(long id){return GoldenDemoPlan.historyPrefix(demoDate(id));}
 public List<Long> todayAccounts(){
  String phone=GoldenDemoPlan.phoneFor(LocalDate.now(ZoneId.of("Asia/Seoul")));
  return phone==null?List.of():db.queryForList("select consumer_id from consumer where phone_number=?",Long.class,phone);
 }
 private void lock(long id){db.queryForList("select consumer_id from consumer where phone_number in ('01090000001','01090000002','01090000003','01090000004','01090000005','01090000006') order by consumer_id for update");db.queryForObject("select consumer_id from consumer where consumer_id=? for update",Long.class,id);}
 private long group(long id,String title){
  var rows=db.queryForList("select cart_group_id from cart_group where consumer_id=? and title=? and status='ACTIVE' order by cart_group_id desc",id,title);
  if(!rows.isEmpty())return ((Number)rows.get(0).get("cart_group_id")).longValue();
  var req=new CreateCartGroupRequest();req.setTitle(title);req.setDescription("골든 계정 전용 시연 목록");req.setShoppingDate(demoDate(id));
  return carts.createGroup(id,req).getCartGroupId();
 }
 private Map<String,Object> pick(int sku){
  var rows=db.queryForList("select s.location_id,s.qty,l.floor_no from stocks s join locations l on l.location_id=s.location_id where s.sku_id=? and l.tier_role='PICK' order by s.location_id",sku);
  if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"상품의 매대 위치가 없습니다.");return rows.get(0);
 }
 private void checkoutStock(long id,int needed){
  int sku=200001;exclusive(id,sku);var loc=pick(sku);
  int deficit=needed-((Number)loc.get("qty")).intValue();if(deficit<=0)return;
  var bulk=db.queryForList("select s.location_id,s.qty from stocks s join locations l on l.location_id=s.location_id where s.sku_id=? and l.tier_role='BULK' and s.qty>=? order by s.location_id limit 1",sku,deficit);
  if(bulk.isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"한우 등심의 창고 재고가 부족합니다.");
  inventory.applyChange(sku,(String)bulk.get(0).get("location_id"),-deficit,ShelfEvent.EventType.ITEM_CONFIRMED,"golden-checkout-replenish");
  inventory.applyChange(sku,(String)loc.get("location_id"),deficit,ShelfEvent.EventType.RESTOCK_IN,"golden-checkout-replenish");
 }
 private void exclusive(long id,int sku){
  if(db.queryForObject("select count(*) from cart_item ci join cart_group cg on cg.cart_group_id=ci.cart_group_id where ci.sku_id=? and cg.consumer_id not in (select consumer_id from consumer where phone_number in ('01090000001','01090000002','01090000003','01090000004','01090000005','01090000006'))",Integer.class,sku)>0)throw new ResponseStatusException(HttpStatus.CONFLICT,"다른 회원의 리스트에 있는 상품입니다. 준비를 다시 확인해 주세요.");
 }
 private void add(long id,long gid,int sku,int qty){
  if(db.queryForObject("select count(*) from cart_item ci join cart_group cg on cg.cart_group_id=ci.cart_group_id where cg.consumer_id=? and ci.cart_group_id=? and ci.sku_id=?",Integer.class,id,gid,sku)==0){
   var req=new AddCartItemRequest();req.setSkuId(sku);req.setQuantity(qty);carts.addItemToGroup(id,gid,req);
  }
 }
 private int roleSku(long id,long gid,int[] options){
  var present=db.queryForList("select ci.sku_id from cart_item ci join cart_group cg on cg.cart_group_id=ci.cart_group_id where cg.consumer_id=? and ci.cart_group_id=?",id,gid);
  if(!present.isEmpty()){int sku=((Number)present.get(0).get("sku_id")).intValue();if(Arrays.stream(options).noneMatch(x->x==sku))throw new ResponseStatusException(HttpStatus.CONFLICT,"시연 목록의 지정 상품을 복원해 주세요.");return sku;}
  for(int sku:options){if(db.queryForObject("select count(*) from cart_item ci join cart_group cg on cg.cart_group_id=ci.cart_group_id where ci.sku_id=? and cg.consumer_id not in (select consumer_id from consumer where phone_number in ('01090000001','01090000002','01090000003','01090000004','01090000005','01090000006'))",Integer.class,sku)==0 && ((Number)pick(sku).get("qty")).intValue()>0){add(id,gid,sku,1);return sku;}}
  throw new ResponseStatusException(HttpStatus.CONFLICT,"시연용 상품을 확보하지 못했습니다.");
 }
 @GetMapping public Map<String,Object> status(@CurrentConsumer Long id){owner(id);return Map.of("name","골든 시연","demoDate",demoDate(id),"products",db.queryForList("select sku_id as skuId,name from products where sku_id in (205400,201520,200550,204820,203330,202100,207291,204821,204822,200001)"),"groups",carts.getGroups(id),"orders",orders.getMyOrders(id),"notifications",notifications.getNotifications(id));}
 @PostMapping("/prepare") @Transactional
 public Map<String,Object> prepare(@CurrentConsumer Long id){owner(id);lock(id);
  // Mirror only the explicitly marked synthetic history; never create extra purchases or stock sales.
  int imported=0;
  var history=db.queryForList("select p.*,date_format(p.purchased_at,'%Y-%m-%dT%H:%i:%s') as history_at,x.name from purchases p join products x on x.sku_id=p.sku_id where member_id=? and basket_id like ? order by purchased_at",10000000L+id,prefix(id)+"%");
  var existingOrders=orderRepository.findByConsumerIdOrderByCreatedAtDesc(id);
  for(var row:history){
   // purchases is UTC; normal JPA order persistence owns the JDBC timezone conversion.
   LocalDateTime at=LocalDateTime.parse((String)row.get("history_at")).atOffset(ZoneOffset.UTC).atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime();
   int sku=((Number)row.get("sku_id")).intValue();
   if(existingOrders.stream().anyMatch(o->o.getCreatedAt().equals(at)&&o.getOrderItems().stream().anyMatch(i->i.getSkuId()==sku)))continue;
   int price=((Number)row.get("unit_price_krw")).intValue(),qty=((Number)row.get("qty")).intValue();
   var order=com.storeflow.order.entity.Order.demoHistory(id,at);
   order.addItem(new com.storeflow.order.entity.OrderItem(sku,(String)row.get("name"),price,qty));
   orderRepository.save(order);existingOrders.add(order);imported++;
  }
  long entry=group(id,"골든 · 소비주기"),restock=group(id,"골든 · 재입고"),move=group(id,"골든 · 위치 이동"),checkout=group(id,"골든 · 결제");
  long catalog=group(id,"시연 · 10개 품목 (결제 금지)");
  for(int sku:GoldenDemoPlan.SKUS)add(id,catalog,sku,1);
  int rs=roleSku(id,restock,new int[]{207291});
  int ms=roleSku(id,move,new int[]{204821});
  checkoutStock(id,4);
  int cs=roleSku(id,checkout,new int[]{200001});
  int earned=db.queryForObject("select point_earned_total from consumer where consumer_id=?",Integer.class,id);
  if(earned<1000){int price=db.queryForObject("select price_krw from products where sku_id=?",Integer.class,cs);int quantity=(50000+price-1)/price;
   checkoutStock(id,quantity);
   var change=new UpdateCartItemRequest();change.setQuantity(quantity);carts.updateItem(id,db.queryForObject("select cart_item_id from cart_item where cart_group_id=? and sku_id=?",Long.class,checkout,cs),change);
  }
  LocalDateTime promoStart=demoDate(id).plusDays(1).atTime(10,0).atZone(ZoneId.of("Asia/Seoul")).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
  if(db.queryForObject("select count(*) from promotions where promo_type='GOLDEN_DEMO' and sku_id=? and starts_at=?",Integer.class,cs,promoStart)==0){
   db.update("insert into promotions(sku_id,promo_type,discount_krw,starts_at,ends_at) values(?,'GOLDEN_DEMO',500,?,?)",cs,promoStart,promoStart.plusHours(1));
  }
  return Map.of("importedOrders",imported,"entryGroupId",entry,"restockGroupId",restock,"restockSku",rs,"moveGroupId",move,"moveSku",ms,"checkoutGroupId",checkout,"checkoutSku",cs);
 }
 private long allowedGroup(long id,Long gid){
  if(gid==null||db.queryForObject("select count(*) from cart_group where cart_group_id=? and consumer_id=? and title like '골든 · %' and status='ACTIVE'",Integer.class,gid,id)!=1)throw new ResponseStatusException(HttpStatus.FORBIDDEN);return gid;
 }
 private String session(long id,long gid){return chats.createSession(id,null,gid).getSessionId();}
 private void ownSession(long id,String sid){if(sid==null||db.queryForObject("select count(*) from chat_session where session_id=? and consumer_id=?",Integer.class,sid,id)!=1)throw new ResponseStatusException(HttpStatus.FORBIDDEN);}
 public record Scene(Long groupId,String sessionId){}
 @PostMapping("/session") public Map<String,Object> newSession(@CurrentConsumer Long id,@RequestBody Scene req){owner(id);long gid=allowedGroup(id,req.groupId());return Map.of("sessionId",session(id,gid));}
 @PostMapping("/entry") @Transactional
 public Map<String,Object> entry(@CurrentConsumer Long id,@RequestBody Scene req){owner(id);ownSession(id,req.sessionId());var loc=pick(205400);events.record(ConsumerEvent.EventType.SCAN_ADD,req.sessionId(),Math.toIntExact(10000000L+id),205400,(String)loc.get("location_id"),null);return Map.of("message","첫 스캔을 기록했습니다. 리브의 안내를 기다려 주세요.");}
 private int groupSku(long id,Scene req,String title){long gid=allowedGroup(id,req.groupId());
  if(!title.equals(db.queryForObject("select title from cart_group where cart_group_id=?",String.class,gid)))throw new ResponseStatusException(HttpStatus.FORBIDDEN);
  int sku=db.queryForObject("select ci.sku_id from cart_item ci join cart_group cg on cg.cart_group_id=ci.cart_group_id where ci.cart_group_id=? and cg.consumer_id=? order by ci.cart_item_id limit 1",Integer.class,gid,id);
  boolean valid=title.equals("골든 · 재입고")?sku==207291:title.equals("골든 · 위치 이동")?sku==204821:sku==200001;
  if(!valid)throw new ResponseStatusException(HttpStatus.CONFLICT,"지정된 시연 상품이 아닙니다.");return sku;
 }
 @PostMapping("/stockout") @Transactional
 public Map<String,Object> stockout(@CurrentConsumer Long id,@RequestBody Scene req){owner(id);lock(id);int sku=groupSku(id,req,"골든 · 재입고");exclusive(id,sku);var loc=pick(sku);int qty=((Number)loc.get("qty")).intValue();if(qty>0)inventory.applyChange(sku,(String)loc.get("location_id"),-qty,ShelfEvent.EventType.SALE,"golden-stockout");return Map.of("skuId",sku,"message","매대가 비었습니다. 채팅에서 이 상품의 재고를 물어보세요.");}
 @PostMapping("/restock") @Transactional
 public Map<String,Object> restock(@CurrentConsumer Long id,@RequestBody Scene req){owner(id);lock(id);int sku=groupSku(id,req,"골든 · 재입고");exclusive(id,sku);var loc=pick(sku);if(((Number)loc.get("qty")).intValue()!=0)throw new ResponseStatusException(HttpStatus.CONFLICT,"먼저 품절 장면을 실행하세요.");inventory.applyChange(sku,(String)loc.get("location_id"),12,ShelfEvent.EventType.RESTOCK_IN,"golden-restock");return Map.of("skuId",sku,"message","12개를 보충했습니다. 채팅과 알림함을 확인하세요.");}
 @PostMapping("/move") @Transactional
 public Map<String,Object> move(@CurrentConsumer Long id,@RequestBody Scene req){owner(id);lock(id);int sku=groupSku(id,req,"골든 · 위치 이동");exclusive(id,sku);var loc=pick(sku);
  var free=db.queryForList("select l.location_id from locations l left join stocks s on s.location_id=l.location_id where l.tier_role='PICK' and l.floor_no=? and s.location_id is null and not exists(select 1 from shelf_configs c where c.location_id=l.location_id and c.sku_id<>?) order by l.location_id limit 1",loc.get("floor_no"),sku);
  if(free.isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"같은 층의 빈 매대가 없습니다.");String target=(String)free.get(0).get("location_id");inventory.move(sku,(String)loc.get("location_id"),target,"golden-move");db.update("update shelf_configs set location_id=? where sku_id=? and location_id=?",target,sku,loc.get("location_id"));return Map.of("skuId",sku,"from",loc.get("location_id"),"to",target,"message","상품을 새 매대로 옮겼습니다.");}
 @PostMapping("/hesitation") @Transactional
 public Map<String,Object> hesitation(@CurrentConsumer Long id,@RequestBody Scene req){owner(id);ownSession(id,req.sessionId());for(int sku:new int[]{204821,204822,204821})events.record(ConsumerEvent.EventType.VIEW,req.sessionId(),Math.toIntExact(10000000L+id),sku,null,null);return Map.of("message","두 상품을 번갈아 살펴봤습니다. 12초 이상 기다려 주세요.");}
 @PostMapping("/checkout") @Transactional
 public Object checkout(@CurrentConsumer Long id,@RequestBody Scene req){owner(id);lock(id);int sku=groupSku(id,req,"골든 · 결제");exclusive(id,sku);long gid=req.groupId();
  if(db.queryForObject("select count(*) from cart_item where cart_group_id=? and sku_id<>200001",Integer.class,gid)>0)throw new ResponseStatusException(HttpStatus.CONFLICT,"결제 시연 목록에는 한우 등심만 남겨 주세요.");
  checkoutStock(id,db.queryForObject("select sum(quantity) from cart_item where cart_group_id=?",Integer.class,gid));
  var ids=db.queryForList("select ci.cart_item_id from cart_item ci join cart_group cg on cg.cart_group_id=ci.cart_group_id where ci.cart_group_id=? and cg.consumer_id=?",gid,id);
  for(var row:ids){var change=new UpdateCartItemRequest();change.setChecked(true);carts.updateItem(id,((Number)row.get("cart_item_id")).longValue(),change);}
  int balance=db.queryForObject("select point_balance from consumer where consumer_id=?",Integer.class,id);return orders.checkout(id,gid,Math.min(balance,100),List.of(sku));
 }
 @PostMapping("/repurchase") @Transactional
 public Map<String,Object> repurchase(@CurrentConsumer Long id){owner(id);lock(id);
  if(db.queryForObject("select count(*) from notification where consumer_id=? and type='REPURCHASE' and created_at>=DATE(UTC_TIMESTAMP()+interval 9 hour)",Integer.class,id)>0)return Map.of("message","오늘의 소비주기 알림이 이미 알림함에 있습니다.");
  HttpHeaders h=new HttpHeaders();h.setContentType(MediaType.APPLICATION_JSON);h.set("X-Internal-Service-Key",key);
  Map response=http.postForObject(agent+"/api/ai/repurchase-candidates",new HttpEntity<>(Map.of("consumerId",id),h),Map.class);
  List<Map> items=(List<Map>)response.get("items");if(items==null||items.isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"현재 소비주기 알림 후보가 없습니다.");
  for(Map it:items)notifications.createNotification(id,"REPURCHASE","다시 살 시기를 확인해 보세요",it.get("name")+" · 마지막 구매 후 "+it.get("days_since_last")+"일, 구매 이력 기준 간격 약 "+it.get("typical_cycle_days")+"일입니다. 필요한지 확인해 주세요.","/product/"+it.get("sku_id"));
  return Map.of("message","소비주기 알림을 알림함에 보관했습니다.","count",items.size());
 }
 @PostMapping("/promotion") @Transactional
 public Map<String,Object> promotion(@CurrentConsumer Long id){owner(id);lock(id);
  // A targeted preview of real upcoming promotions; never broadcast to all accounts.
  var rows=db.queryForList("select p.sku_id,p.discount_krw,date_format(p.starts_at,'%Y-%m-%dT%H:%i:%s') as starts_utc,x.name from promotions p join products x on x.sku_id=p.sku_id where p.starts_at>UTC_TIMESTAMP() and p.promo_type='GOLDEN_DEMO' and p.sku_id=200001 order by p.starts_at limit 1");
  if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"예정된 행사가 없습니다.");var p=rows.get(0);
  String when=LocalDateTime.parse((String)p.get("starts_utc")).atOffset(ZoneOffset.UTC).atZoneSameInstant(ZoneId.of("Asia/Seoul")).format(java.time.format.DateTimeFormatter.ofPattern("M월 d일 HH:mm"));
  String message=p.get("name")+" · "+when+"(한국시간)부터 "+p.get("discount_krw")+"원 할인 예정입니다.";
  var today=db.queryForList("select notification_id from notification where consumer_id=? and type='PROMOTION' and title='다가오는 할인 안내' and created_at>=DATE(UTC_TIMESTAMP()+interval 9 hour) order by notification_id desc limit 1",id);
  if(today.isEmpty())notifications.createNotification(id,"PROMOTION","다가오는 할인 안내",message,"/product/"+p.get("sku_id"));
  else db.update("update notification set message=?,link_url=? where notification_id=? and consumer_id=?",message,"/product/"+p.get("sku_id"),today.get(0).get("notification_id"),id);
  return Map.of("message","실제 예정된 행사의 알림을 보관했습니다.");
 }
}
