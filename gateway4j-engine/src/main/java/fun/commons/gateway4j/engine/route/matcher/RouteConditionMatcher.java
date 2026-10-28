package fun.commons.gateway4j.engine.route.matcher;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.common.model.RouteCondition;
import groovy.lang.Binding;
import groovy.lang.GroovyShell;
import org.codehaus.groovy.control.CompilerConfiguration;
import org.codehaus.groovy.control.customizers.SecureASTCustomizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.web.server.ServerWebExchange;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

public class RouteConditionMatcher {

    private static final Logger log = LoggerFactory.getLogger(RouteConditionMatcher.class);

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

    private boolean matchOperator(String operator, String actual, String expected) {
        return switch (operator) {
            case "EQ" -> actual.equals(expected);
            case "NE" -> !actual.equals(expected);
            case "CONTAINS" -> actual.contains(expected);
            case "REGEX" -> Pattern.compile(expected).matcher(actual).find();
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
