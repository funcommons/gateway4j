package fun.commons.gateway4j.plugin.builtins.cache;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

import java.io.Serializable;

public class CachedResponse implements Serializable {

    private final long createdAt;
    private final int ttlSeconds;
    private final byte[] body;
    private final HttpHeaders headers;
    private final HttpStatus statusCode;

    public CachedResponse(long createdAt, int ttlSeconds, byte[] body,
                          HttpHeaders headers, HttpStatus statusCode) {
        this.createdAt = createdAt;
        this.ttlSeconds = ttlSeconds;
        this.body = body;
        this.headers = headers;
        this.statusCode = statusCode;
    }

    public boolean isExpired() {
        return System.currentTimeMillis() - createdAt > ttlSeconds * 1000L;
    }

    public byte[] getBody() { return body; }
    public HttpHeaders getHeaders() { return headers; }
    public HttpStatus getStatusCode() { return statusCode; }
    public long getCreatedAt() { return createdAt; }
    public int getTtlSeconds() { return ttlSeconds; }
}
