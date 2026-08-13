package com.storeflow.global.config;

import com.storeflow.global.security.CurrentConsumerArgumentResolver;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final CurrentConsumerArgumentResolver currentConsumerArgumentResolver;

    public WebMvcConfig(CurrentConsumerArgumentResolver currentConsumerArgumentResolver) {
        this.currentConsumerArgumentResolver = currentConsumerArgumentResolver;
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(currentConsumerArgumentResolver);
    }
}
