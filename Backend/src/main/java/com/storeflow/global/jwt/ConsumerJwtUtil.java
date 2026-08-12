package com.storeflow.global.jwt;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.security.Key;
import java.util.Date;

@Component
public class ConsumerJwtUtil {

    // 소비자 전용 서명키. staff/admin 토큰과 분리 (JwtUtil 주석 원칙과 동일).
    @Value("${jwt.consumer-secret}")
    private String secret;

    @Value("${jwt.consumer-access-expiration}")
    private long accessExpiration;

    @Value("${jwt.consumer-refresh-expiration}")
    private long refreshExpiration;

    private Key getSigningKey() {
        return Keys.hmacShaKeyFor(secret.getBytes());
    }

    public String generateAccessToken(Long consumerId) {
        return generateToken(consumerId, accessExpiration, "ACCESS");
    }

    public String generateRefreshToken(Long consumerId) {
        return generateToken(consumerId, refreshExpiration, "REFRESH");
    }

    private String generateToken(Long consumerId, long expiration, String tokenType) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + expiration);

        return Jwts.builder()
                .setSubject(String.valueOf(consumerId))
                .claim("tokenType", tokenType)
                .setIssuedAt(now)
                .setExpiration(expiry)
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    public Long getConsumerIdFromToken(String token) {
        String subject = Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody()
                .getSubject();
        return Long.valueOf(subject);
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parserBuilder().setSigningKey(getSigningKey()).build().parseClaimsJws(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
}