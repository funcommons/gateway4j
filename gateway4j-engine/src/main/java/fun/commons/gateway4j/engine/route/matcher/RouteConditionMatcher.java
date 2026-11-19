package fun.commons.gateway4j.engine.route.matcher;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.common.model.RouteCondition;
import groovy.lang.Binding;
import groovy.lang.GroovyShell;
import org.codehaus.groovy.control.CompilerConfiguration;
import org.codehaus.groovy.control.customizers.SecureASTCustomizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpCookie;
import org.springframework.http.HttpHeaders;
import org.springframework.web.server.ServerWebExchange;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.regex.Pattern;

public class RouteConditionMatcher {

    private static final Logger log = LoggerFactory.getLogger(RouteConditionMatcher.class);

    /**
     * REGEX 预编译缓存：键为 pattern 原文，同 pattern 不重复 compile。
     * matcher(actual).find() 语义不变；各 operator（HEADER/QUERY/…）的相同
     * pattern 共享本缓存安全（编译结果确定且无状态）。
     */
    private static final ConcurrentMap<String, Pattern> REGEX_CACHE = new ConcurrentHashMap<>();

    /**
     * HOST pattern（SCG HostPredicate 口径）→ 正则的翻译预编译缓存。
     * 键为 pattern 原文，与 REGEX_CACHE 分离：同一字符串按 SCG pattern 翻译
     * 与按裸正则编译语义不同，禁止混用同一键空间。
     */
    private static final ConcurrentMap<String, Pattern> HOST_PATTERN_CACHE = new ConcurrentHashMap<>();

    public boolean match(ServerWebExchange exchange, RouteCondition condition) {
        String type = condition.getConditionType();
        String operator = condition.getOperator();
        String key = condition.getConditionKey();
        String value = condition.getConditionValue();

        return switch (type) {
            case "HEADER" -> matchHeader(exchange, operator, key, value);
            case "PATH" -> matchPath(exchange, operator, key, value);
            case "QUERY" -> matchQuery(exchange, operator, key, value);
            case "BODY" -> matchBody(exchange, operator, key, value);
            case "GROOVY" -> matchGroovy(exchange, value);
            case "HOST" -> matchHost(exchange, operator, value);
            case "METHOD" -> matchMethod(exchange, operator, value);
            case "COOKIE" -> matchCookie(exchange, operator, key, value);
            case "REMOTE_ADDR" -> matchRemoteAddr(exchange, value);
            case "AFTER" -> matchAfter(value);
            case "BEFORE" -> matchBefore(value);
            case "BETWEEN" -> matchBetween(value);
            default -> false;
        };
    }

    private boolean matchHeader(ServerWebExchange exchange, String operator, String key, String value) {
        HttpHeaders headers = exchange.getRequest().getHeaders();
        List<String> headerValues = headers.get(key);
        if (headerValues == null || headerValues.isEmpty()) {
            return "EXISTS".equals(operator) ? false : "NE".equals(operator);
        }
        String headerValue = headerValues.get(0);
        return matchOperator(operator, headerValue, value);
    }

    private boolean matchPath(ServerWebExchange exchange, String operator, String key, String value) {
        String requestPath = exchange.getRequest().getPath().value();
        return matchOperator(operator, requestPath, value);
    }

    private boolean matchQuery(ServerWebExchange exchange, String operator, String key, String value) {
        Map<String, List<String>> queryParams = exchange.getRequest().getQueryParams();
        List<String> paramValues = queryParams.get(key);
        if (paramValues == null || paramValues.isEmpty()) {
            return "EXISTS".equals(operator) ? false : "NE".equals(operator);
        }
        String paramValue = paramValues.get(0);
        return matchOperator(operator, paramValue, value);
    }

    private boolean matchBody(ServerWebExchange exchange, String operator, String key, String value) {
        Object cached = exchange.getAttribute(GatewayConstants.CACHED_REQUEST_BODY_KEY);
        if (!(cached instanceof String body) || body.isEmpty()) {
            return false;
        }
        if ("EXISTS".equals(operator)) {
            return extractJsonValue(body, key) != null;
        }
        Object extracted = extractJsonValue(body, key);
        if (extracted == null) {
            return "NE".equals(operator);
        }
        return matchOperator(operator, String.valueOf(extracted), value);
    }

    private Object extractJsonValue(String json, String path) {
        if (json == null || path == null || path.isEmpty()) {
            return null;
        }
        try {
            String jsonPath = path.startsWith("$") ? path : "$." + path;
            return com.jayway.jsonpath.JsonPath.read(json, jsonPath);
        } catch (Exception e) {
            log.debug("BODY JsonPath extraction failed for path {}: {}", path, e.getMessage());
            return null;
        }
    }

    private boolean matchGroovy(ServerWebExchange exchange, String script) {
        if (script == null || script.isBlank()) {
            return false;
        }
        try {
            CompilerConfiguration config = new CompilerConfiguration();
            SecureASTCustomizer secure = new SecureASTCustomizer();
            secure.setClosuresAllowed(true);
            secure.setMethodDefinitionAllowed(false);
            config.addCompilationCustomizers(secure);

            Binding binding = new Binding();
            binding.setVariable("exchange", exchange);
            binding.setVariable("method", exchange.getRequest().getMethod().name());
            binding.setVariable("path", exchange.getRequest().getPath().value());
            binding.setVariable("headers", exchange.getRequest().getHeaders());
            binding.setVariable("queryParams", exchange.getRequest().getQueryParams());
            Object bodyAttr = exchange.getAttribute(GatewayConstants.CACHED_REQUEST_BODY_KEY);
            binding.setVariable("body", bodyAttr instanceof String s ? s : "");

            Object result = new GroovyShell(binding, config).evaluate(script);
            return Boolean.TRUE.equals(result) || "true".equals(String.valueOf(result));
        } catch (Exception e) {
            log.warn("GROOVY condition script failed: {}", e.getMessage());
            return false;
        }
    }

    /**
     * HOST 条件（SCG HostPredicate 口径）：condition_key 一律忽略；匹配目标为
     * Host 头（缺失即 false，禁止回落 RemoteAddress），大小写不敏感（Host 先
     * toLowerCase 再匹配）。value 含通配符（{@code **}/{@code *}）时独立于
     * operator 按 SCG pattern 语义翻译为正则并整串匹配（{@code matches}）；
     * 无通配符时按 operator 语义（EQ=精确域名）走 matchOperator。
     */
    private boolean matchHost(ServerWebExchange exchange, String operator, String value) {
        String host = exchange.getRequest().getHeaders().getFirst(HttpHeaders.HOST);
        if (host == null || host.isBlank() || value == null || value.isBlank()) {
            log.debug("HOST condition not matched: host header or condition value missing");
            return false;
        }
        String normalizedHost = host.trim().toLowerCase(Locale.ROOT);
        if (value.indexOf('*') >= 0) {
            return hostPatternCache(value).matcher(normalizedHost).matches();
        }
        return matchOperator(operator, normalizedHost, value);
    }

    /** HOST pattern 翻译预编译：同 pattern 不重复翻译+compile。 */
    private Pattern hostPatternCache(String pattern) {
        return HOST_PATTERN_CACHE.computeIfAbsent(pattern, RouteConditionMatcher::hostPatternToRegex);
    }

    /**
     * SCG HostPredicate pattern → 正则（点号分段口径）：{@code **} 至少一段任意
     * 子域（故裸域不命中）、{@code *} 恰好单段；字面段按 Pattern.quote 转义。
     */
    private static Pattern hostPatternToRegex(String pattern) {
        String[] segments = pattern.split("\\.", -1);
        StringBuilder regex = new StringBuilder();
        for (int i = 0; i < segments.length; i++) {
            String segment = segments[i];
            boolean last = i == segments.length - 1;
            if ("**".equals(segment)) {
                if (last) {
                    regex.append("[^.]+(?:\\.[^.]+)*");
                } else {
                    // 段分隔点已并入重复单元，后面无需再补 "\\."
                    regex.append("(?:[^.]+\\.)+");
                }
            } else if ("*".equals(segment)) {
                regex.append("[^.]+");
            } else {
                regex.append(Pattern.quote(segment));
            }
            if (!last && !"**".equals(segment)) {
                regex.append("\\.");
            }
        }
        return Pattern.compile(regex.toString());
    }

    /**
     * METHOD 条件（SCG MethodPredicate 口径）：实际方法名恒为大写（HttpMethod.name()），
     * expected 统一大写后走 matchOperator → EQ/NE 大小写不敏感。
     */
    private boolean matchMethod(ServerWebExchange exchange, String operator, String value) {
        String actual = exchange.getRequest().getMethod().name();
        return matchOperator(operator, actual, value == null ? null : value.toUpperCase(Locale.ROOT));
    }

    /**
     * COOKIE 条件（SCG CookiePredicate 口径）：condition_key=cookie 名，取首个同名
     * cookie 的 value 走 matchOperator；cookie 缺失时语义同 HEADER（EXISTS=false /
     * NE=true）。
     */
    private boolean matchCookie(ServerWebExchange exchange, String operator, String key, String value) {
        HttpCookie cookie = exchange.getRequest().getCookies().getFirst(key);
        if (cookie == null) {
            log.debug("COOKIE condition not matched: cookie {} missing", key);
            return "EXISTS".equals(operator) ? false : "NE".equals(operator);
        }
        return matchOperator(operator, cookie.getValue(), value);
    }

    /**
     * REMOTE_ADDR 条件（IpSubnetFilterRule 口径）：condition_value=CIDR 网段，
     * 无斜杠纯 IP 视为 /32 单值；匹配目标为 getRemoteAddress()，operator 不参与。
     * InetAddress byte[] 前缀比较，不引新依赖；地址族（v4/v6）不一致或前缀长度
     * 越界不命中，解析失败返回 false。
     */
    private boolean matchRemoteAddr(ServerWebExchange exchange, String value) {
        InetSocketAddress remoteAddress = exchange.getRequest().getRemoteAddress();
        if (remoteAddress == null || remoteAddress.getAddress() == null
                || value == null || value.isBlank()) {
            log.debug("REMOTE_ADDR condition not matched: remote address or condition value missing");
            return false;
        }
        String cidr = value.trim();
        int slashIndex = cidr.indexOf('/');
        try {
            byte[] addressBytes = remoteAddress.getAddress().getAddress();
            byte[] prefixBytes = InetAddress
                    .getByName(slashIndex < 0 ? cidr : cidr.substring(0, slashIndex))
                    .getAddress();
            int prefixLength = slashIndex < 0
                    ? prefixBytes.length * 8
                    : Integer.parseInt(cidr.substring(slashIndex + 1));
            return cidrMatches(addressBytes, prefixBytes, prefixLength);
        } catch (Exception e) {
            log.debug("REMOTE_ADDR condition parse failed for value {}: {}", value, e.getMessage());
            return false;
        }
    }

    /** CIDR 前缀比较：整字节段 + 余数位段掩码比较。 */
    private static boolean cidrMatches(byte[] addressBytes, byte[] prefixBytes, int prefixLength) {
        if (addressBytes.length != prefixBytes.length) {
            return false;
        }
        if (prefixLength < 0 || prefixLength > prefixBytes.length * 8) {
            return false;
        }
        int fullBytes = prefixLength / 8;
        for (int i = 0; i < fullBytes; i++) {
            if (addressBytes[i] != prefixBytes[i]) {
                return false;
            }
        }
        int remainderBits = prefixLength % 8;
        if (remainderBits > 0) {
            int mask = (0xFF << (8 - remainderBits)) & 0xFF;
            if ((addressBytes[fullBytes] & mask) != (prefixBytes[fullBytes] & mask)) {
                return false;
            }
        }
        return true;
    }

    /** AFTER 条件（SCG AfterPredicate 口径）：now 严格晚于 threshold 即命中；不走 matchOperator。 */
    private boolean matchAfter(String value) {
        Instant threshold = parseInstantValue(value);
        return threshold != null && Instant.now().isAfter(threshold);
    }

    /** BEFORE 条件（SCG BeforePredicate 口径）：now 严格早于 threshold 即命中；不走 matchOperator。 */
    private boolean matchBefore(String value) {
        Instant threshold = parseInstantValue(value);
        return threshold != null && Instant.now().isBefore(threshold);
    }

    /**
     * BETWEEN 条件（闭开区间 [start, end)）：value 为 {@code start,end} 逗号分隔两段
     * ISO-8601；start 含端（now 不早于 start 即命中）、end 含端不命中；不走
     * matchOperator；畸形（非两段/任一段解析失败）返回 false。
     */
    private boolean matchBetween(String value) {
        if (value == null || value.isBlank()) {
            return false;
        }
        String[] parts = value.split(",", -1);
        if (parts.length != 2) {
            log.debug("BETWEEN condition value expects exactly 2 comma-separated parts: {}", value);
            return false;
        }
        Instant start = parseInstantValue(parts[0]);
        Instant end = parseInstantValue(parts[1]);
        if (start == null || end == null) {
            return false;
        }
        Instant now = Instant.now();
        return !now.isBefore(start) && now.isBefore(end);
    }

    /** ISO-8601 容错解析：优先 OffsetDateTime（带时区偏移），回落 Instant（Z 结尾）；失败返回 null。 */
    private Instant parseInstantValue(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        try {
            return OffsetDateTime.parse(trimmed).toInstant();
        } catch (DateTimeParseException e) {
            try {
                return Instant.parse(trimmed);
            } catch (DateTimeParseException e2) {
                log.debug("time condition parse failed for value {}: {}", value, e2.getMessage());
                return null;
            }
        }
    }

    private boolean matchOperator(String operator, String actual, String expected) {
        return switch (operator) {
            case "EQ" -> actual.equals(expected);
            case "NE" -> !actual.equals(expected);
            case "CONTAINS" -> actual.contains(expected);
            case "REGEX" -> REGEX_CACHE.computeIfAbsent(expected, Pattern::compile).matcher(actual).find();
            case "EXISTS" -> actual != null && !actual.isEmpty();
            case "GT" -> compareNumeric(actual, expected) > 0;
            case "LT" -> compareNumeric(actual, expected) < 0;
            default -> false;
        };
    }

    private int compareNumeric(String actual, String expected) {
        try {
            double a = Double.parseDouble(actual);
            double b = Double.parseDouble(expected);
            return Double.compare(a, b);
        } catch (NumberFormatException e) {
            return actual.compareTo(expected);
        }
    }
}
