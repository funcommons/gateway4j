package fun.commons.gateway4j.engine.filter;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import org.junit.jupiter.api.Test;
import org.reactivestreams.Publisher;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.NettyWriteResponseFilter;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.http.server.reactive.ServerHttpResponseDecorator;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 响应装饰晚绑定桥契约测试（S11-4e，T 步 RED 先行）。
 *
 * <p>桥的核心使命：PluginExecutionFilter（order 10020）晚于 SCG
 * NettyWriteResponseFilter（order -1）被调，SCG 写回闭包在插件链运行前就已捕获
 * 装配时的 exchange——PRE 插件 mutate().response() 的装饰结构上不可达。桥挂
 * order=-2（先于写过滤器被调、晚绑定装饰器成为写过滤器闭包捕获的 response），
 * writeWith/writeAndFlushWith 时才从 attributes 解析装饰工厂，把「插件链运行时
 * 才置入的装饰」延迟到「写回时」应用。</p>
 *
 * <p>用例口径（MockServerWebExchange/MockServerHttpResponse，无 Spring 上下文）：
 * ①②无工厂透传（防桥破坏普通请求的 passthrough 契约）；③晚绑定核心契约
 * （filter 先发生、attribute 后置入、写回时工厂才被应用）；④工厂收到的是桥装饰器
 * 自身（裸原始 response 会丢桥层）；⑤order 锚；⑥headers/statusCode 透传。</p>
 */
class PluginResponseDecorationBridgeFilterTest {

    private final PluginResponseDecorationBridgeFilter filter = new PluginResponseDecorationBridgeFilter();

    private MockServerWebExchange exchange() {
        return MockServerWebExchange.builder(MockServerHttpRequest.get("/bridge/x").build()).build();
    }

    /** 模拟（延迟发生的）转发写 body。 */
    private static Mono<Void> writeBody(org.springframework.web.server.ServerWebExchange exchange, String body) {
        return exchange.getResponse().writeWith(Mono.just(
                exchange.getResponse().bufferFactory().wrap(body.getBytes(StandardCharsets.UTF_8))));
    }

    // ------------------------------------------------------------------
    // ①② 无工厂 attribute：逐字节透传（防桥破坏普通请求）
    // ------------------------------------------------------------------

    @Test
    void writeWithPassesThroughToRawResponseWhenNoFactoryAttribute() {
        MockServerWebExchange exchange = exchange();
        GatewayFilterChain chain = ex -> writeBody(ex, "plain-body");

        filter.filter(exchange, chain).block();

        assertEquals("plain-body", exchange.getResponse().getBodyAsString().block(),
                "无装饰工厂时 writeWith 必须透传到原始 response（passthrough 契约）");
    }

    @Test
    void writeAndFlushWithPassesThroughToRawResponseWhenNoFactoryAttribute() {
        MockServerWebExchange exchange = exchange();
        GatewayFilterChain chain = ex -> ex.getResponse().writeAndFlushWith(Flux.just(Mono.just(
                ex.getResponse().bufferFactory().wrap("flushed-body".getBytes(StandardCharsets.UTF_8)))));

        filter.filter(exchange, chain).block();

        assertEquals("flushed-body", exchange.getResponse().getBodyAsString().block(),
                "无装饰工厂时 writeAndFlushWith 必须透传（保持逐窗口 flush 语义）");
    }

    // ------------------------------------------------------------------
    // ③ 晚绑定核心契约：filter 先发生、attribute 后置入、写回时工厂才应用
    // ------------------------------------------------------------------

    @Test
    void factoryAttributeSetAfterTheFilterStillDecoratesTheWriteBack() {
        MockServerWebExchange exchange = exchange();
        AtomicBoolean factoryApplied = new AtomicBoolean(false);
        // 桥先被调（filter），之后（模拟插件链 order 10020 晚于桥 order -2 被调）
        // 才把装饰工厂置入 attributes——写回时工厂必须仍然被解析并应用。
        GatewayFilterChain chain = ex -> {
            ex.getAttributes().put(GatewayConstants.RESPONSE_DECORATOR_FACTORY_KEY,
                    (Function<ServerHttpResponse, ServerHttpResponse>) response -> {
                        factoryApplied.set(true);
                        return new ServerHttpResponseDecorator(response) {
                            @Override
                            public Mono<Void> writeWith(Publisher<? extends DataBuffer> body) {
                                // 装饰语义：前缀 "decorated:" 后委托
                                return super.writeWith(Flux.from(body).map(buf -> {
                                    byte[] decorated = ("decorated:" + buf.toString(StandardCharsets.UTF_8))
                                            .getBytes(StandardCharsets.UTF_8);
                                    return response.bufferFactory().wrap(decorated);
                                }));
                            }
                        };
                    });
            return writeBody(ex, "upstream-body");
        };

        filter.filter(exchange, chain).block();

        assertTrue(factoryApplied.get(), "写回时必须解析并应用 attribute 里的装饰工厂");
        assertEquals("decorated:upstream-body", exchange.getResponse().getBodyAsString().block(),
                "装饰 response 必须收到（并改写）写回 body——晚绑定桥的最终交付物");
    }

    // ------------------------------------------------------------------
    // ④ 工厂收到的被装饰对象是桥装饰器自身（裸装饰会丢桥层）
    // ------------------------------------------------------------------

    @Test
    void factoryReceivesTheBridgeDecoratorItselfNotTheRawResponse() {
        MockServerWebExchange exchange = exchange();
        AtomicReference<ServerHttpResponse> chainSaw = new AtomicReference<>();
        AtomicReference<ServerHttpResponse> factoryReceived = new AtomicReference<>();
        GatewayFilterChain chain = ex -> {
            chainSaw.set(ex.getResponse());
            ex.getAttributes().put(GatewayConstants.RESPONSE_DECORATOR_FACTORY_KEY,
                    (Function<ServerHttpResponse, ServerHttpResponse>) response -> {
                        factoryReceived.set(response);
                        return response;
                    });
            return writeBody(ex, "x");
        };

        filter.filter(exchange, chain).block();

        assertNotNull(chainSaw.get());
        assertNotNull(factoryReceived.get(), "工厂必须被应用");
        assertSame(chainSaw.get(), factoryReceived.get(),
                "工厂必须装饰桥装饰器自身（装饰裸原始 response 会丢桥层，破坏后续叠加装饰）");
        assertNotSame(exchange.getResponse(), factoryReceived.get(),
                "工厂绝不能拿到裸原始 response");
    }

    // ------------------------------------------------------------------
    // ⑤ order 锚：先于写过滤器被调
    // ------------------------------------------------------------------

    @Test
    void orderIsImmediatelyBeforeTheWriteResponseFilter() {
        assertEquals(NettyWriteResponseFilter.WRITE_RESPONSE_FILTER_ORDER - 1, filter.getOrder(),
                "桥必须挂 order=-2：先于写过滤器（-1）被调，其装饰后的 exchange 才是"
                        + "写过滤器闭包捕获的对象");
        assertTrue(filter.getOrder() < NettyWriteResponseFilter.WRITE_RESPONSE_FILTER_ORDER,
                "先于写过滤器");
    }

    // ------------------------------------------------------------------
    // ⑥ headers/statusCode 等非 write 方法透传（桥对元数据零影响）
    // ------------------------------------------------------------------

    @Test
    void headersAndStatusCodeDelegateToTheRawResponse() {
        MockServerWebExchange exchange = exchange();
        GatewayFilterChain chain = ex -> {
            ServerHttpResponse response = ex.getResponse();
            response.getHeaders().add("X-Bridge-Probe", "1");
            response.setStatusCode(HttpStatus.ACCEPTED);
            return Mono.empty();
        };

        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.ACCEPTED, exchange.getResponse().getStatusCode(),
                "setStatusCode 必须透传到原始 response");
        assertEquals("1", exchange.getResponse().getHeaders().getFirst("X-Bridge-Probe"),
                "headers 操作必须透传到原始 response");
    }
}
