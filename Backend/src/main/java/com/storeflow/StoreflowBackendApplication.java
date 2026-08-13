package com.storeflow;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling

public class StoreflowBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(StoreflowBackendApplication.class, args);
    }
}
