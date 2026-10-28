package fun.commons.gateway4j.plugin.builtins.logging;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class LogDesensitizer {

    private final List<LoggingPluginConfig.DesensitizeRule> rules;

    public LogDesensitizer(List<LoggingPluginConfig.DesensitizeRule> rules) {
        this.rules = rules;
    }

    public String desensitize(String text) {
        if (text == null || rules == null || rules.isEmpty()) return text;

        String result = text;
        for (LoggingPluginConfig.DesensitizeRule rule : rules) {
            if (rule.getField() == null || rule.getStrategy() == null) continue;
            result = applyRule(result, rule);
        }
        return result;
    }

    private String applyRule(String text, LoggingPluginConfig.DesensitizeRule rule) {
        String field = rule.getField();
        String strategy = rule.getStrategy().toUpperCase();

        Pattern pattern = Pattern.compile(
                "(\"\\Q" + field + "\\E\"\\s*:\\s*\")([^\"]*)(\")",
                Pattern.CASE_INSENSITIVE);
        Matcher matcher = pattern.matcher(text);

        StringBuffer sb = new StringBuffer();
        while (matcher.find()) {
            String replacement = switch (strategy) {
                case "MASK" -> maskValue(matcher.group(2));
                case "MD5" -> md5Value(matcher.group(2));
                case "EMPTY" -> "";
                case "REPLACE" -> "***";
                default -> "***";
            };
            matcher.appendReplacement(sb, Matcher.quoteReplacement(matcher.group(1) + replacement + matcher.group(3)));
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    private String maskValue(String value) {
        if (value == null || value.length() <= 2) return "***";
        int len = value.length();
        int showFront = Math.min(1, len / 3);
        int showBack = Math.min(1, len / 3);
        return value.substring(0, showFront) + "***" + value.substring(len - showBack);
    }

    private String md5Value(String value) {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return "***";
        }
    }
}
