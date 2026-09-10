package com.storeflow.demo;

import com.storeflow.global.security.CurrentConsumer;
import com.storeflow.inventory.entity.ShelfEvent;
import com.storeflow.inventory.service.InventoryService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

/** Simulation의 실제 매대 보충. 내부키를 브라우저에 전달하지 않는다. */
@RestController
@RequestMapping("/api/simulation")
public class SimulationRestockController {
    private final JdbcTemplate db;
    private final InventoryService inventory;
    @Value("${storeflow.golden-demo-enabled:false}") private boolean enabled;
    public SimulationRestockController(JdbcTemplate db, InventoryService inventory) {
        this.db=db; this.inventory=inventory;
    }
    public record Request(Integer skuId, String locationId, Integer qty) {}
    @PostMapping("/restock")
    @Transactional
    public Map<String,Object> restock(@CurrentConsumer Long id, @RequestBody Request request) {
        if (!enabled || id==null) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"골든 계정으로 로그인 후 보충해 주세요.");
        String phone=db.queryForObject("select phone_number from consumer where consumer_id=?",String.class,id);
        if (phone==null || !GoldenDemoPlan.PHONES.contains(phone)) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"보충 권한이 없습니다.");
        if (request.skuId()==null || request.locationId()==null || !Integer.valueOf(5).equals(request.qty()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"매대와 상품을 지정해 5개씩 보충해 주세요.");
        // 같은 SKU의 PICK/BULK를 같은 순서로 잠가 동시 보충의 초과 차감을 막는다.
        var rows=db.queryForList("select s.location_id,s.qty,l.tier_role from stocks s join locations l on l.location_id=s.location_id where s.sku_id=? order by s.location_id for update",request.skuId());
        var pick=rows.stream().filter(r->request.locationId().equals(r.get("location_id")) && "PICK".equals(r.get("tier_role"))).findFirst()
            .orElseThrow(()->new ResponseStatusException(HttpStatus.CONFLICT,"선택한 상품의 매대가 변경됐습니다. 팝업을 다시 열어 주세요."));
        var bulk=rows.stream().filter(r->"BULK".equals(r.get("tier_role")) && ((Number)r.get("qty")).intValue()>=5).findFirst()
            .orElseThrow(()->new ResponseStatusException(HttpStatus.CONFLICT,"창고 재고가 5개 미만이어서 보충할 수 없습니다."));
        String task=UUID.randomUUID().toString();
        inventory.applyChange(request.skuId(),(String)bulk.get("location_id"),-5,ShelfEvent.EventType.ITEM_CONFIRMED,task);
        inventory.applyChange(request.skuId(),request.locationId(),5,ShelfEvent.EventType.RESTOCK_IN,task);
        return Map.of("skuId",request.skuId(),"locationId",request.locationId(),"qty",5,"stock",((Number)pick.get("qty")).intValue()+5);
    }
}
