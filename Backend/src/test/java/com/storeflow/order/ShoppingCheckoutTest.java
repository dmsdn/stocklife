package com.storeflow.order;

import com.storeflow.cart.entity.CartGroup;
import com.storeflow.cart.entity.CartItem;
import com.storeflow.cart.repository.CartGroupRepository;
import com.storeflow.cart.repository.CartItemRepository;
import com.storeflow.consumer.repository.ConsumerRepository;
import com.storeflow.inventory.service.InventoryService;
import com.storeflow.order.service.OrderService;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 결제 직전 선택 경계만 검사한다. 실제 재고/포인트/구매 기록 변경까지 가지 않는다. */
class ShoppingCheckoutTest {
    private final Map<Class<?>,Object> mocks=new HashMap<>();
    private final OrderService service;
    ShoppingCheckoutTest() throws Exception {
        var ctor=OrderService.class.getConstructors()[0];
        Object[] deps=Arrays.stream(ctor.getParameterTypes()).map(t->{Object m=mock(t);mocks.put(t,m);return m;}).toArray();
        service=(OrderService)ctor.newInstance(deps);
        when(dep(CartGroupRepository.class).findByCartGroupIdAndConsumerId(10L,7L)).thenReturn(Optional.of(mock(CartGroup.class)));
        List<CartItem> items=new ArrayList<>();
        for(int sku:List.of(1,2)){
            CartItem item=mock(CartItem.class);when(item.getSkuId()).thenReturn(sku);
            when(item.getCartGroupId()).thenReturn(10L);when(item.isChecked()).thenReturn(true);items.add(item);
        }
        when(dep(CartItemRepository.class).findByConsumerId(7L)).thenReturn(items);
        when(dep(ConsumerRepository.class).findById(7L)).thenThrow(new IllegalStateException("selected-before-payment"));
    }
    private <T>T dep(Class<T> type){return type.cast(mocks.get(type));}
    @Test void onlyScannedSkuPassesSelectionEvenWhenUnscannedItemIsChecked(){
        var e=assertThrows(IllegalStateException.class,()->service.checkout(7L,10L,null,List.of(1)));
        assertEquals("selected-before-payment",e.getMessage());
        verify(dep(ConsumerRepository.class)).findById(7L);
        verifyNoInteractions(dep(InventoryService.class));
    }
    @Test void missingOrForeignSkuCannotReachPayment(){
        var e=assertThrows(IllegalStateException.class,()->service.checkout(7L,10L,null,List.of(999)));
        assertTrue(e.getMessage().contains("스캔 상품이 바뀌었어요"));
        verifyNoInteractions(dep(ConsumerRepository.class),dep(InventoryService.class));
    }
}
