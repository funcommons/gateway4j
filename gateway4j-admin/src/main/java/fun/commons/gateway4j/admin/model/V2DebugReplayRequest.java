package fun.commons.gateway4j.admin.model;

import java.util.Map;

/**
 * S11a 调试回放请求体（POST /v1/v2/debug/replay 的 JSON body，UI v2 契约
 * docs/ui-v2/实施契约.md S11）。五个分量的名称/顺序/类型是 S11b 前端调试台与
 * {@code RouteSimulateService#simulate(path, method, headers, query)} 入参透传
 * 的契约：method/headers/query/body 原样转发到网关影子链路，path 拼接到
 * gateway-base-url 后。routeId 不在 body 里——走查询参数 {@code route_id}
 * （V2DebugController 绑定）。
 *
 * @param path    回放请求路径（如 /api/users），必填
 * @param method  HTTP 方法（GET/POST/…，空/缺省按 GET）
 * @param headers 回放请求头（原样转发，可空 Map）
 * @param query   回放查询参数（拼接为查询串，键值对顺序不敏感，可空 Map）
 * @param body    请求体原文（GET 回放通常为 null）
 */
public record V2DebugReplayRequest(String path,
                                   String method,
                                   Map<String, String> headers,
                                   Map<String, String> query,
                                   String body) {
}
