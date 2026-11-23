package fun.commons.gateway4j.plugin.builtins.watermark;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 水印插件补强契约测试（契约 §9，S11-2 T 步 RED 先行；S11-4e 调整为晚绑定桥语义）。
 *
 * <p>断言口径：JS 内容用「特征包含」（MutationObserver/postMessage/CRC/脱敏特征等
 * 语义关键字），不逐字符全串比对，允许 C 步自由组织脚本。</p>
 *
 * <p>覆盖面：</p>
 * <ul>
 *   <li>S11-4e attribute 契约 2：execute 置装饰工厂且透传原始 exchange（不 mutate）/
 *       config null 或 disabled 不置工厂且透传</li>
 *   <li>脚本特征 5：用户化 JWT 读取与 payload 解析（参数化 cookie 名，缺省对齐钉钉插件
 *       fu-gw-token）、sessionCookieName 参数化传导、脱敏+CRC16 文案、MutationObserver 防删、
 *       iframe 协同 postMessage 自毁 + resize 重绘</li>
 *   <li>decorator 分支 4：writeAndFlushWith 缓冲注入 / 多分片缓冲 / 非 HTML 透传 / 超限透传</li>
 *   <li>CSP 按需 2：缺省 stripCsp=false 不删头（现状全局删头为 RED）；stripCsp=true 才删</li>
 *   <li>SSE 透传锚 1：text/event-stream 不注入透传</li>
 *   <li>既有锚 3+1：writeWith HTML 注入（</body> 前）/ 非 HTML 透传 / 1MB 上限透传 /
 *       无 </body> 尾部追加</li>
 * </ul>
 *
 * <p><b>S11-4e 语义变更</b>：插件 execute 不再 mutate().response()（SCG 写回闭包在
 * 插件链运行前已绑定原始 exchange，装饰结构上不可达），改为把装饰工厂置入 attributes
 * （{@link GatewayConstants#RESPONSE_DECORATOR_FACTORY_KEY}），由 order=-2 的
 * PluginResponseDecorationBridgeFilter 在写回时晚绑定应用。本测试的
 * {@code writeWith}/{@code writeAndFlushWith} 链即模拟该桥的写回语义：解析工厂 →
 * 应用 → 写 body。</p>
 */
class WatermarkPluginUpgradeTest {

    private static final String CSP_HEADER = "Content-Security-Policy";
    /** 对齐 DingTalkPluginConfig 默认会话 cookie 名（fu-gw-token）。 */
    private static final String DINGTALK_SESSION_COOKIE = "fu-gw-token";

    private WatermarkPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new WatermarkPlugin();
    }

    private void setConfigJson(String json) {
        plugin.onConfigChange(new PluginConfig("watermark", json, 1L));
    }

    private void setDefaultConfig() {
        setConfigJson("{}");
    }

    private MockServerWebExchange createExchange(MediaType contentType) {
        MockServerWebExchange exchange = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/page").build()).build();
        exchange.getResponse().getHeaders().setContentType(contentType);
        return exchange;
    }

    /**
     * 模拟 order=-2 晚绑定桥的写回语义（S11-4e）：从 exchange attributes 解析装饰
     * 工厂 → 应用到当前 response → 写 body。工厂缺失即断言失败（execute 必须置入）。
     */
    private PluginChain writeWith(Flux<String> chunks) {
        return ex -> {
            Function<ServerHttpResponse, ServerHttpResponse> factory =
                    (Function<ServerHttpResponse, ServerHttpResponse>) ex.getAttributes()
                            .get(GatewayConstants.RESPONSE_DECORATOR_FACTORY_KEY);
            assertNotNull(factory,
                    "execute 后 attributes 必须置入装饰工厂（晚绑定桥契约 "
                            + GatewayConstants.RESPONSE_DECORATOR_FACTORY_KEY + "）");
            ServerHttpResponse decorated = factory.apply(ex.getResponse());
            return decorated.writeWith(
                    chunks.map(s -> ex.getResponse().bufferFactory()
                            .wrap(s.getBytes(StandardCharsets.UTF_8))));
        };
    }

    /** 模拟晚绑定桥的 writeAndFlushWith 写回语义（每个子 Flux 为一次 flush 窗口）。 */
    private PluginChain writeAndFlushWith(Flux<Flux<String>> windows) {
        return ex -> {
            Function<ServerHttpResponse, ServerHttpResponse> factory =
                    (Function<ServerHttpResponse, ServerHttpResponse>) ex.getAttributes()
                            .get(GatewayConstants.RESPONSE_DECORATOR_FACTORY_KEY);
            assertNotNull(factory,
                    "execute 后 attributes 必须置入装饰工厂（晚绑定桥契约 "
                            + GatewayConstants.RESPONSE_DECORATOR_FACTORY_KEY + "）");
            ServerHttpResponse decorated = factory.apply(ex.getResponse());
            return decorated.writeAndFlushWith(
                    windows.map(window -> window.map(s -> ex.getResponse().bufferFactory()
                            .wrap(s.getBytes(StandardCharsets.UTF_8)))));
        };
    }

    private String bodyOf(MockServerWebExchange exchange) {
        return exchange.getResponse().getBodyAsString().block();
    }

    // ------------------------------------------------------------------
    // S11-4e：晚绑定桥 attribute 契约（2）
    // ------------------------------------------------------------------

    @Test
    void executePutsDecoratorFactoryIntoAttributesInsteadOfMutating() {
        setDefaultConfig();
        MockServerWebExchange exchange = createExchange(MediaType.TEXT_HTML);
        AtomicReference<ServerWebExchange> chainSaw = new AtomicReference<>();
        plugin.execute(exchange, ex -> {
            chainSaw.set(ex);
            return Mono.empty();
        }).block();

        assertSame(exchange, chainSaw.get(),
                "execute 必须透传原始 exchange——装饰不再走 mutate().response()"
                        + "（SCG 写回闭包在插件链运行前已绑定原始 exchange，mutate 结构上不可达）");
        Function<ServerHttpResponse, ServerHttpResponse> factory =
                (Function<ServerHttpResponse, ServerHttpResponse>) exchange.getAttributes()
                        .get(GatewayConstants.RESPONSE_DECORATOR_FACTORY_KEY);
        assertNotNull(factory, "enabled 时必须在 attributes 置入装饰工厂（晚绑定桥契约）");

        // 工厂应用到裸 response 的产物即注入装饰器：writeWith 注入 </body> 前脚本
        MockServerWebExchange bare = createExchange(MediaType.TEXT_HTML);
        ServerHttpResponse decorated = factory.apply(bare.getResponse());
        StepVerifier.create(decorated.writeWith(Mono.just(
                        decorated.bufferFactory().wrap(
                                "<html><body>x</body></html>".getBytes(StandardCharsets.UTF_8)))))
                .verifyComplete();
        String body = bare.getResponse().getBodyAsString().block();
        assertTrue(body.contains("<script>"), "工厂应用产物应注入水印脚本");
        assertTrue(body.indexOf("<script>") < body.lastIndexOf("</body>"), "脚本应插在 </body> 之前");
    }

    @Test
    void configNullOrDisabledSetsNoFactoryAttributeAndPassesThrough() {
        // config null（未订阅任何配置）
        WatermarkPlugin noConfig = new WatermarkPlugin();
        MockServerWebExchange noCfgExchange = createExchange(MediaType.TEXT_HTML);
        noConfig.execute(noCfgExchange, ex -> Mono.empty()).block();
        assertNull(noCfgExchange.getAttributes().get(GatewayConstants.RESPONSE_DECORATOR_FACTORY_KEY),
                "config null 必须透传且不置装饰工厂（桥对普通请求零影响）");

        // config disabled
        WatermarkPlugin disabled = new WatermarkPlugin();
        WatermarkPluginConfig cfg = new WatermarkPluginConfig();
        cfg.setEnabled(false);
        disabled.onConfigChange(new PluginConfig("watermark",
                fun.commons.gateway4j.common.util.JsonUtils.toCompactJson(cfg), 1L));
        MockServerWebExchange disabledExchange = createExchange(MediaType.TEXT_HTML);
        disabled.execute(disabledExchange, ex -> Mono.empty()).block();
        assertNull(disabledExchange.getAttributes().get(GatewayConstants.RESPONSE_DECORATOR_FACTORY_KEY),
                "disabled 必须透传且不置装饰工厂");

        // 无工厂 → 桥透传，直接写 body 不注入
        StepVerifier.create(disabledExchange.getResponse().writeWith(Mono.just(
                        disabledExchange.getResponse().bufferFactory().wrap(
                                "<html><body>y</body></html>".getBytes(StandardCharsets.UTF_8)))))
                .verifyComplete();
        assertFalse(disabledExchange.getResponse().getBodyAsString().block().contains("<script>"),
                "透传路径不注入");
    }

    // ------------------------------------------------------------------
    // 脚本特征（5）
    // ------------------------------------------------------------------

    @Test
    void scriptPersonalizesFromJwtPayloadInSessionCookie() {
        setDefaultConfig();
        String script = plugin.buildScriptTag().toLowerCase();
        // ① 读会话 cookie（缺省对齐钉钉插件 fu-gw-token）② 解 JWT payload（base64，无验签）
        assertTrue(script.contains(DINGTALK_SESSION_COOKIE),
                "缺省应读取钉钉插件会话 cookie " + DINGTALK_SESSION_COOKIE);
        assertTrue(script.contains("document.cookie"), "应读 document.cookie");
        assertTrue(script.contains("atob"), "应 base64 解 payload 段");
        assertTrue(script.contains("split('.')"), "应按 . 切出 JWT payload 段");
        // ③ payload 取 nick / mobile
        assertTrue(script.contains("nick"), "应取 payload.nick");
        assertTrue(script.contains("mobile"), "应取 payload.mobile");
        // ④ 无 nick 时回落默认静态主文案（兼容既有 org+内部系统 口径）
        assertTrue(script.contains("内部系统"), "无 nick 时应回落默认主文案");
    }

    @Test
    void sessionCookieNameIsParameterizedNotHardcoded() {
        setConfigJson("{\"sessionCookieName\":\"gw-session-id\"}");
        String inline = plugin.buildScriptTag();
        assertTrue(inline.contains("gw-session-id"),
                "内联脚本应使用 config.sessionCookieName 而非硬编码 cookie 名");

        // scriptUrl 外链模式同样要传导参数化 cookie 名（引导 new 时的 options）
        setConfigJson("{\"scriptUrl\":\"/static/wm.js\",\"sessionCookieName\":\"gw-session-id\"}");
        String external = plugin.buildScriptTag();
        assertTrue(external.contains("src='/static/wm.js'"), "外链模式保留 src 引导");
        assertTrue(external.contains("gw-session-id"),
                "外链引导 options 也应携带 sessionCookieName");
    }

    @Test
    void scriptContainsMaskedIdentityAndCrc16AntiTamper() {
        setDefaultConfig();
        String script = plugin.buildScriptTag().toLowerCase();
        // 脱敏特征：姓名首字 + '*'（payload.nick 脱敏），手机号前3 + **** + 后4
        assertTrue(script.contains("****"), "手机号脱敏应含 **** 掩码");
        assertTrue(script.contains("slice("), "姓名/手机号脱敏应含字符串切片保留首尾特征");
        // CRC16 防篡改校验码（源脚本 crc16/0xA001 口径，允许实现自由命名，锚 crc16 关键字）
        assertTrue(script.contains("crc16"), "应含 CRC16 防篡改校验码特征");
        // 天数（自起始日期累计天数，允许不同算术写法）
        assertTrue(script.contains("math.floor") || script.contains("86400000")
                        || script.contains("24 * 60 * 60"),
                "应含按天差值计算特征");
    }

    @Test
    void scriptMutatesObserverRestoresRemovedWatermark() {
        setDefaultConfig();
        String script = plugin.buildScriptTag();
        assertTrue(script.contains("MutationObserver"), "应含 MutationObserver 防删");
        assertTrue(script.contains("removedNodes"), "应监听 removedNodes 移除即重绘");
    }

    @Test
    void scriptIframeCollaboratesAndRedrawsOnResize() {
        setDefaultConfig();
        String script = plugin.buildScriptTag();
        // iframe 协同：子页轮询父页水印，父页应答后子页自毁
        assertTrue(script.contains("postMessage"), "应含 postMessage 协同");
        assertTrue(script.contains("watermarkCheck"), "应含 watermarkCheck 询问消息");
        assertTrue(script.contains("hasWatermark"), "应含 hasWatermark 应答消息");
        assertTrue(script.contains("window.top"), "应区分父页/子页（window.top）");
        assertTrue(script.contains("setInterval"), "子页应轮询父页水印状态");
        // resize 重绘
        assertTrue(script.contains("resize"), "应监听 resize 重绘");
        assertTrue(script.contains("canvas") || script.contains("toDataURL"),
                "重绘应基于 canvas 平铺图案");
    }

    // ------------------------------------------------------------------
    // decorator 分支（4）
    // ------------------------------------------------------------------

    @Test
    void writeAndFlushWithHtmlGetsInjection() {
        setDefaultConfig();
        MockServerWebExchange exchange = createExchange(MediaType.TEXT_HTML);
        StepVerifier.create(plugin.execute(exchange,
                writeAndFlushWith(Flux.just(Flux.just(
                        "<html><body>hello</body></html>"))))).verifyComplete();
        String body = bodyOf(exchange);
        assertTrue(body.contains("<script>"), "writeAndFlushWith 路径也应注入水印脚本");
        assertTrue(body.contains("hello"), "原 body 保留");
    }

    @Test
    void writeAndFlushWithMultiChunkHtmlBufferedAcrossWindows() {
        setDefaultConfig();
        MockServerWebExchange exchange = createExchange(MediaType.TEXT_HTML);
        // 脚本插入点 </body> 被切在两个 flush 窗口之间，验证缓冲后再注入
        StepVerifier.create(plugin.execute(exchange,
                writeAndFlushWith(Flux.just(
                        Flux.just("<html><bo"),
                        Flux.just("dy>chunked</bo"),
                        Flux.just("dy></html>"))))).verifyComplete();
        String body = bodyOf(exchange);
        assertTrue(body.contains("<script>"), "跨窗口分片的 HTML 仍应缓冲后注入");
        assertTrue(body.contains("chunked"), "原 body 保留");
        assertTrue(body.indexOf("<script>") < body.lastIndexOf("</body>"),
                "脚本应插在 </body> 之前");
    }

    @Test
    void writeAndFlushWithNonHtmlPassthrough() {
        setDefaultConfig();
        MockServerWebExchange exchange = createExchange(MediaType.APPLICATION_JSON);
        StepVerifier.create(plugin.execute(exchange,
                writeAndFlushWith(Flux.just(Flux.just("{\"ok\":true}")))))
                .verifyComplete();
        assertEquals("{\"ok\":true}", bodyOf(exchange), "非 HTML 应透传不注入");
    }

    @Test
    void writeAndFlushWithOversizedPassthrough() {
        setDefaultConfig();
        MockServerWebExchange exchange = createExchange(MediaType.TEXT_HTML);
        exchange.getResponse().getHeaders().setContentLength(2L * 1024 * 1024);
        StepVerifier.create(plugin.execute(exchange,
                writeAndFlushWith(Flux.just(Flux.just(
                        "<html><body>big</body></html>"))))).verifyComplete();
        String body = bodyOf(exchange);
        assertFalse(body.contains("<script>"), "超过 maxBodyLength 的 writeAndFlushWith 应透传不注入");
        assertTrue(body.contains("big"), "原 body 保留");
    }

    // ------------------------------------------------------------------
    // CSP 按需（2）
    // ------------------------------------------------------------------

    @Test
    void cspHeaderKeptByDefault() {
        setDefaultConfig();
        MockServerWebExchange exchange = createExchange(MediaType.TEXT_HTML);
        exchange.getResponse().getHeaders().add(CSP_HEADER, "default-src 'self'");
        StepVerifier.create(plugin.execute(exchange,
                writeWith(Flux.just("<html><body>csp</body></html>")))).verifyComplete();
        assertTrue(bodyOf(exchange).contains("<script>"), "HTML 正常注入（证明走到了注入路径）");
        assertNotNull(exchange.getResponse().getHeaders().getFirst(CSP_HEADER),
                "缺省 stripCsp=false 不应删 CSP 头（删头必须显式开启）");
    }

    @Test
    void cspHeaderStrippedOnlyWhenStripCspTrue() {
        setConfigJson("{\"stripCsp\":true}");
        MockServerWebExchange exchange = createExchange(MediaType.TEXT_HTML);
        exchange.getResponse().getHeaders().add(CSP_HEADER, "default-src 'self'");
        StepVerifier.create(plugin.execute(exchange,
                writeWith(Flux.just("<html><body>csp</body></html>")))).verifyComplete();
        assertTrue(bodyOf(exchange).contains("<script>"), "HTML 正常注入");
        assertNull(exchange.getResponse().getHeaders().getFirst(CSP_HEADER),
                "stripCsp=true 时才删 CSP 头");
    }

    // ------------------------------------------------------------------
    // SSE 透传锚（1）
    // ------------------------------------------------------------------

    @Test
    void sseEventStreamNotInjectedPassthrough() {
        setDefaultConfig();
        MockServerWebExchange exchange = createExchange(MediaType.TEXT_EVENT_STREAM);
        String sseBody = "data: hello\n\ndata: world\n\n";
        StepVerifier.create(plugin.execute(exchange,
                writeAndFlushWith(Flux.just(Flux.just(sseBody))))).verifyComplete();
        assertEquals(sseBody, bodyOf(exchange), "SSE 必须逐字透传不注入");
    }

    // ------------------------------------------------------------------
    // 既有锚（3+1）
    // ------------------------------------------------------------------

    @Test
    void writeWithHtmlInjectsBeforeBodyClose() {
        setDefaultConfig();
        MockServerWebExchange exchange = createExchange(MediaType.TEXT_HTML);
        StepVerifier.create(plugin.execute(exchange,
                writeWith(Flux.just("<html><body>anchor</body></html>"))))
                .verifyComplete();
        String body = bodyOf(exchange);
        assertTrue(body.contains("<script>"), "text/html 注入脚本");
        assertTrue(body.contains("anchor"), "原 body 保留");
        assertTrue(body.indexOf("<script>") < body.lastIndexOf("</body>"),
                "脚本应插在 </body> 之前");
        assertTrue(body.endsWith("</body></html>"), "</body> 之后内容保持原样");
    }

    @Test
    void writeWithNonHtmlPassthrough() {
        setDefaultConfig();
        MockServerWebExchange exchange = createExchange(MediaType.APPLICATION_JSON);
        StepVerifier.create(plugin.execute(exchange,
                writeWith(Flux.just("{\"ok\":true}")))).verifyComplete();
        assertEquals("{\"ok\":true}", bodyOf(exchange), "非 HTML 透传不注入");
    }

    @Test
    void writeWithOversizedPassthrough() {
        setDefaultConfig();
        MockServerWebExchange exchange = createExchange(MediaType.TEXT_HTML);
        exchange.getResponse().getHeaders().setContentLength(2L * 1024 * 1024);
        exchange.getResponse().getHeaders().add(CSP_HEADER, "default-src 'self'");
        StepVerifier.create(plugin.execute(exchange,
                writeWith(Flux.just("<html><body>big</body></html>")))).verifyComplete();
        String body = bodyOf(exchange);
        assertFalse(body.contains("<script>"), "超过 1MB 上限透传不注入");
        assertTrue(body.contains("big"), "原 body 保留");
        assertNotNull(exchange.getResponse().getHeaders().getFirst(CSP_HEADER),
                "透传路径不动 CSP 头");
    }

    @Test
    void writeWithHtmlWithoutBodyTagAppendsScript() {
        setDefaultConfig();
        MockServerWebExchange exchange = createExchange(MediaType.TEXT_HTML);
        StepVerifier.create(plugin.execute(exchange,
                writeWith(Flux.just("<html><head></head><p>tail</p></html>"))))
                .verifyComplete();
        String body = bodyOf(exchange);
        assertTrue(body.contains("<script>"), "无 </body> 时仍应注入");
        assertTrue(body.endsWith("</script>"), "无 </body> 时脚本应追加在尾部");
    }
}
