package com.storeflow.global.security;

import com.storeflow.global.jwt.ConsumerJwtUtil;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

@Component
public class CurrentConsumerArgumentResolver implements HandlerMethodArgumentResolver {

    private final ConsumerJwtUtil jwtUtil;

    public CurrentConsumerArgumentResolver(ConsumerJwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(CurrentConsumer.class);
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
                                  NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
        HttpServletRequest request = (HttpServletRequest) webRequest.getNativeRequest();
        String header = request.getHeader("Authorization");

        if (header == null || !header.startsWith("Bearer ")) {
            throw new MissingOrInvalidTokenException("인증 토큰이 없습니다.");
        }

        String token = header.substring(7);

        if (!jwtUtil.validateToken(token)) {
            throw new MissingOrInvalidTokenException("유효하지 않은 토큰입니다.");
        }

        return jwtUtil.getConsumerIdFromToken(token);
    }
}