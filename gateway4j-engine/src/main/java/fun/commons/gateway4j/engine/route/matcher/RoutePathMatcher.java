package fun.commons.gateway4j.engine.route.matcher;

import fun.commons.gateway4j.common.util.RoutePathUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.server.PathContainer;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * 路由 path 匹配器（S12-2：改用 Spring {@link PathPattern}，与 SCG 注册层同源同语义）。
 *
 * <p><b>为什么换掉自研匹配器</b>：S12-1 把路由级谓词换成 SCG 原生语义后，path 这一层
 * 仍是自研实现（只认 {@code /**} / {@code /*} / 全等三种），导致：</p>
 * <ul>
 *   <li>缺陷①：{@code /foo/{segment}} 这类 SCG 变量路由在注册层能匹配、在分发层匹配不到
 *       → {@code RouteDispatcher.dispatch} 返回 empty → 静默 404；</li>
 *   <li>缺陷②：DISPATCH 与 BACKEND 全部路由塞进同一个扁平匹配器，仲裁依赖注册顺序，
 *       而注册顺序来自无 ORDER BY 的 DB 查询 → 结果不确定；</li>
 *   <li>缺陷③：尾斜杠口径与注册层（SCG 默认 {@code matchTrailingSlash=true}）不一致。</li>
 * </ul>
 *
 * <p><b>语义口径（与 SCG 完全一致）</b>：</p>
 * <ul>
 *   <li>pattern 解析器 = {@code new PathPatternParser()} +
 *       {@code setMatchOptionalTrailingSeparator(true)}——照抄 SCG
 *       {@code PathRoutePredicateFactory#apply} 的做法（其
 *       {@code Config.matchTrailingSlash} 默认 true）；</li>
 *   <li>pattern 字符串 = {@link RoutePathUtils#normalizePath}（配置侧归一：补前导 "/"、
 *       剥尾斜杠）；request 字符串 = {@link RoutePathUtils#normalizeRequestPath}
 *       （匹配侧归一：只补前导 "/"，<b>不</b>剥尾斜杠）；</li>
 *   <li>因此 {@code /api} 命中 {@code /api/}（SCG 默认口径），{@code /api/*} 命中
 *       {@code /api/}，{@code /foo/{seg}} 命中 {@code /foo/bar}。</li>
 * </ul>
 *
 * <p><b>仲裁规则（显式化，消除缺陷②的顺序依赖）</b>：命中候选按下列优先级取胜者——
 * ① 精确（无通配/变量语法）优先于通配；② 同为通配时 DISPATCH 优先于 BACKEND
 * （与 SCG 注册层「DISPATCH order=-1_000_000 排前」一致）；③ 再按注册顺序取首个
 * （注册顺序由 {@code RouteDispatcher#updateRoutes} 显式排序保证确定性）。</p>
 *
 * <p>本类同时是 engine / SCG 注册层 / admin 模拟器三层共享的 path 语义唯一来源
 * （静态方法 {@link #parsePattern} / {@link #matches}）。</p>
 */
public class RoutePathMatcher {

    private static final Logger log = LoggerFactory.getLogger(RoutePathMatcher.class);

    /**
     * 与 SCG {@code PathRoutePredicateFactory} 同口径的解析器。
     *
     * <p>SCG 的写法是 {@code new PathPatternParser()}（不是 {@code defaultInstance}）并在
     * 每次 bind 前 {@code setMatchOptionalTrailingSeparator(config.isMatchTrailingSlash())}；
     * SCG 的 {@code Config.matchTrailingSlash} 默认 {@code true}。这里固定为 true 后不再变更
     * （{@code PathPatternParser#parse} 每次新建内部 parser，构造后不再 mutate 即线程安全）。</p>
     */
    private static final PathPatternParser PATH_PATTERN_PARSER = createParser();

    private static PathPatternParser createParser() {
        PathPatternParser parser = new PathPatternParser();
        parser.setMatchOptionalTrailingSeparator(true);
        return parser;
    }

    private final List<RouteEntry> entries = new ArrayList<>();

    /**
     * @param routeId  路由 id
     * @param pattern  编译后的 path pattern
     * @param exact    是否为精确匹配（无通配/变量语法）
     * @param dispatch 是否为 DISPATCH 路由（分发父路由）
     * @param seq      注册序号（注册顺序兜底仲裁）
     */
    private record RouteEntry(Long routeId, PathPattern pattern, boolean exact, boolean dispatch, int seq) {}

    /** 注册一条路由（不区分路由类型）。 */
    public void addRoute(Long routeId, String path) {
        addRoute(routeId, path, null);
    }

    /**
     * 注册一条路由（带路由类型，供仲裁区分 DISPATCH / BACKEND）。
     *
     * <p>非法 pattern（如中间段 {@code **}）跳过注册并告警（fail-open，与
     * {@code DynamicRouteLocator} 的跳过口径一致），不拖垮其它路由。</p>
     */
    public void addRoute(Long routeId, String path, String routeType) {
        PathPattern pattern;
        try {
            pattern = parsePattern(path);
        } catch (Exception e) {
            log.warn("Skip route {} path '{}': invalid path pattern: {}", routeId, path, e.getMessage());
            return;
        }
        entries.add(new RouteEntry(routeId, pattern, !pattern.hasPatternSyntax(),
                "DISPATCH".equals(routeType), entries.size()));
    }

    /**
     * 匹配请求路径 → 命中的路由 id（无命中返回 empty）。
     *
     * <p>仲裁：精确优先 → DISPATCH 优先 → 注册顺序。</p>
     */
    public Optional<Long> match(String requestPath) {
        PathContainer path;
        try {
            path = PathContainer.parsePath(RoutePathUtils.normalizeRequestPath(requestPath));
        } catch (Exception e) {
            log.warn("Cannot parse request path '{}' for route matching: {}", requestPath, e.getMessage());
            return Optional.empty();
        }

        RouteEntry best = null;
        for (RouteEntry entry : entries) {
            if (!entry.pattern().matches(path)) {
                continue;
            }
            if (best == null || isBetter(entry, best)) {
                best = entry;
            }
        }
        return best == null ? Optional.empty() : Optional.of(best.routeId());
    }

    /** 仲裁比较：精确优先 → DISPATCH 优先 → 注册序号升序。 */
    private static boolean isBetter(RouteEntry candidate, RouteEntry current) {
        if (candidate.exact() != current.exact()) {
            return candidate.exact();
        }
        if (candidate.dispatch() != current.dispatch()) {
            return candidate.dispatch();
        }
        return candidate.seq() < current.seq();
    }

    public void clear() {
        entries.clear();
    }

    public int size() {
        return entries.size();
    }

    // ===== 三层共享的 path 语义（注册层 / 分发层 / admin 模拟器）=====

    /**
     * 编译路由 path → {@link PathPattern}（配置侧归一 + SCG 同口径解析器）。
     *
     * <p>非法 pattern 抛 {@code PatternParseException}（由调用方决定跳过或告警）。</p>
     */
    public static PathPattern parsePattern(String routePath) {
        return PATH_PATTERN_PARSER.parse(RoutePathUtils.normalizePath(routePath));
    }

    /**
     * 路由 path 是否命中请求 path（共享判定口径）。
     *
     * <p>非法 pattern 或非法请求 path 一律判否（fail-open）。</p>
     */
    public static boolean matches(String routePath, String requestPath) {
        try {
            return parsePattern(routePath).matches(
                    PathContainer.parsePath(RoutePathUtils.normalizeRequestPath(requestPath)));
        } catch (Exception e) {
            log.warn("Route path '{}' vs request path '{}' not matchable: {}",
                    routePath, requestPath, e.getMessage());
            return false;
        }
    }
}
