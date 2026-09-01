package com.storeflow.chat.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

import java.net.URI;

/**
 * NCP Object Storage는 S3 호환 API라 AWS SDK v2의 S3Client를 그대로 쓰되,
 * endpointOverride만 NCP 주소로 바꿔서 붙인다. 리전은 NCP 자체 리전이 SDK의
 * AWS 리전 목록에 없어서 Region.of(String)로 임의 리전명을 등록해서 쓴다.
 */
@Configuration
public class ObjectStorageConfig {

    @Value("${ncp.object-storage.endpoint}")
    private String endpoint;

    @Value("${ncp.object-storage.region}")
    private String region;

    @Value("${ncp.object-storage.access-key}")
    private String accessKey;

    @Value("${ncp.object-storage.secret-key}")
    private String secretKey;

    @Bean
    public S3Client ncpObjectStorageClient() {
        return S3Client.builder()
                .endpointOverride(URI.create(endpoint))
                .region(Region.of(region))
                .credentialsProvider(
                        StaticCredentialsProvider.create(
                                AwsBasicCredentials.create(accessKey, secretKey)
                        )
                )
                // NCP Object Storage는 path-style(가상 host-style이 아닌) 접근을 권장한다.
                .forcePathStyle(true)
                .build();
    }
}