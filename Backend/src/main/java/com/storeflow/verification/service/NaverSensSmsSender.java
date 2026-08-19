package com.storeflow.verification.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;

/**
 * NAVER Cloud Platform SENS(Simple & Easy Notification Service)로 실제 SMS를 발송한다.
 * 서명 방식은 NCP API Gateway 표준(HMAC-SHA256, "METHOD 공백 URL\n타임스탬프\naccessKey")을 따른다.
 *
 * 필요 환경변수: NCP_SMS_ACCESS_KEY, NCP_SMS_SECRET_KEY, NCP_SMS_SERVICE_ID, NCP_SMS_FROM
 * (application-mysql.yml의 ncp.sms.* 로 매핑 — 아래쪽 config 참고)
 *
 * 본문이 90바이트(EUC-KR 기준)를 넘으면 자동으로 LMS로 전환해서 보낸다.
 * 인증번호 메시지 정도 길이면 보통 SMS로 나가지만, 문구를 늘리는 경우를 대비한 안전장치.
 */
@Component
public class NaverSensSmsSender implements SmsSender {

    private static final String API_HOST = "https://sens.apigw.ntruss.com";
    private static final int SMS_BYTE_LIMIT = 90;

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${ncp.sms.access-key}")
    private String accessKey;

    @Value("${ncp.sms.secret-key}")
    private String secretKey;

    @Value("${ncp.sms.service-id}")
    private String serviceId;

    @Value("${ncp.sms.from}")
    private String fromNumber;

    public NaverSensSmsSender(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @Override
    public void send(String toPhoneNumber, String content) {
        String path = "/sms/v2/services/" + serviceId + "/messages";
        String timestamp = String.valueOf(System.currentTimeMillis());
        String signature = makeSignature(path, timestamp);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.add("x-ncp-apigw-timestamp", timestamp);
        headers.add("x-ncp-iam-access-key", accessKey);
        headers.add("x-ncp-apigw-signature-v2", signature);

        Map<String, Object> body = Map.of(
                "type", byteLength(content) > SMS_BYTE_LIMIT ? "LMS" : "SMS",
                "contentType", "COMM",
                "countryCode", "82",
                "from", fromNumber,
                "content", content,
                "messages", List.of(Map.of("to", toPhoneNumber))
        );

        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

        try {
            restTemplate.postForEntity(API_HOST + path, request, String.class);
        } catch (Exception e) {
            throw new SmsSendFailedException("SMS 발송에 실패했습니다.", e);
        }
    }

    private String makeSignature(String path, String timestamp) {
        try {
            String message = "POST" + " " + path + "\n" + timestamp + "\n" + accessKey;
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secretKey.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] rawHmac = mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(rawHmac);
        } catch (Exception e) {
            throw new IllegalStateException("SENS 서명 생성에 실패했습니다.", e);
        }
    }

    private int byteLength(String content) {
        // NCP는 EUC-KR 기준 바이트 수로 SMS/LMS를 구분한다(한글 2바이트).
        try {
            return content.getBytes(Charset.forName("EUC-KR")).length;
        } catch (Exception e) {
            return content.getBytes(StandardCharsets.UTF_8).length;
        }
    }

    public static class SmsSendFailedException extends RuntimeException {
        public SmsSendFailedException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}