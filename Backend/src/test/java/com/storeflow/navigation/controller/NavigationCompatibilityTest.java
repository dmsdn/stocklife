package com.storeflow.navigation.controller;

import com.storeflow.global.jwt.ConsumerJwtUtil;
import com.storeflow.navigation.dto.NavigationRequest;
import com.storeflow.navigation.dto.NavigationResponse;
import com.storeflow.navigation.dto.RouteRequest;
import com.storeflow.navigation.dto.RouteResponse;
import com.storeflow.navigation.service.CartRouteService;
import com.storeflow.navigation.service.NavigationService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class NavigationCompatibilityTest {
    private static final String ROUTE = "{\"startFloor\":1,\"startX\":10,\"startY\":71,\"stops\":[{\"skuId\":7}],\"escalatorsOnly\":true}";
    private static final String CART = "{\"floor\":1,\"x\":10,\"y\":71,\"groupId\":25}";

    @Test void mergedControllersExposeAllThreeApisAndPreserveConsumerAndGroup() throws Exception {
        var nav = mock(NavigationService.class);
        var cart = mock(CartRouteService.class);
        var jwt = mock(ConsumerJwtUtil.class);
        when(jwt.validateToken("test")).thenReturn(true);
        when(jwt.getConsumerIdFromToken("test")).thenReturn(7L);
        when(cart.buildCartRoute(eq(7L), any(NavigationRequest.class))).thenReturn(new NavigationResponse(25L, 9, List.of(), List.of()));
        when(nav.buildMatrix(any(RouteRequest.class))).thenReturn(Map.of("distances", List.of(List.of(0, 9), List.of(9, 0))));
        when(nav.buildRoute(any(RouteRequest.class))).thenReturn(new RouteResponse(List.of(), 9));
        var mvc = MockMvcBuilders.standaloneSetup(new NavigationController(cart, jwt, nav), new RouteController(nav)).build();
        mvc.perform(post("/api/navigation/cart-route").header("Authorization", "Bearer test").contentType(MediaType.APPLICATION_JSON).content(CART)).andExpect(status().isOk()).andExpect(jsonPath("$.cartGroupId").value(25));
        mvc.perform(post("/api/navigation/route").contentType(MediaType.APPLICATION_JSON).content(ROUTE)).andExpect(status().isOk()).andExpect(jsonPath("$.totalDistance").value(9));
        mvc.perform(post("/api/navigation/matrix").contentType(MediaType.APPLICATION_JSON).content(ROUTE)).andExpect(status().isOk()).andExpect(jsonPath("$.distances[0][1]").value(9));
        verify(cart).buildCartRoute(eq(7L), argThat(r -> r.getGroupId().equals(25L) && r.getX() == 10 && r.getY() == 71 && r.getFloor() == 1));
        verify(nav).buildRoute(argThat(RouteRequest::isEscalatorsOnly));
        verify(nav).buildMatrix(argThat(RouteRequest::isEscalatorsOnly));
    }

    @Test void restoredCartApiStillRequiresAuthorizationHeader() throws Exception {
        var cart = mock(CartRouteService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new NavigationController(cart, mock(ConsumerJwtUtil.class), mock(NavigationService.class))).build();
        mvc.perform(post("/api/navigation/cart-route").contentType(MediaType.APPLICATION_JSON).content(CART)).andExpect(status().isBadRequest());
        verifyNoInteractions(cart);
    }

    @Test void matrixStillValidatesInputBeforeCallingService() throws Exception {
        var nav = mock(NavigationService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new NavigationController(mock(CartRouteService.class), mock(ConsumerJwtUtil.class), nav)).build();
        mvc.perform(post("/api/navigation/matrix").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
        verifyNoInteractions(nav);
    }
}
