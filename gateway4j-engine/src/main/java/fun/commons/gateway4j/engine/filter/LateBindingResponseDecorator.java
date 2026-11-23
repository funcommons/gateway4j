package fun.commons.gateway4j.engine.filter;

import fun.commons.gateway4j.common.constant.GatewayConstants;
import org.reactivestreams.Publisher;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.http.server.reactive.ServerHttpResponseDecorator;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.function.Function;

/**
 * 透明晚绑定响应装饰器（S11-4e 桥的内置件）。
 *
 * <p>桥（{@link PluginResponseDecorationBridgeFilter}，order=-2）在下行把每个 exchange
 * 的 response 换成本装饰器——它因此成为 SCG NettyWriteResponseFilter（order=-1）写回
 * 闭包捕获的对象。writeWith/writeAndFlushWith 时才从 exchange attributes 解析装饰工厂
 * （{@link GatewayConstants#RESPONSE_DECORATOR_FACTORY_KEY}，类型
 * {@code Function<ServerHttpResponse, ServerHttpResponse>}，由插件链运行时的 PRE 插件
 * 置入）：命中则 {@code factory.apply(this)} 得到最终装饰 response 并委托写入（工厂收到
 * 的被装饰对象是本装饰器自身，保证多插件装饰叠加在桥链而非裸原始 response 上）；未命中
 * 则 super 透传（逐字节等价，仅多一层委托）。其余方法（getHeaders/setStatusCode 等）
 * 不覆写，天然透传。</p>
 *
 * <p><b>为什么必须晚绑定</b>：插件链（PluginExecutionFilter，order 10020）晚于
 * NettyWriteResponseFilter（order -1）被调，SCG 写回闭包在插件链运行前已捕获装配时的
 * exchange——工厂必须在写回时（而非装配时）解析才能穿透写回闭包。装饰器持有 exchange
 * 引用：DefaultServerWebExchange.Builder 持有原 exchange attributes map 引用
 * （mutate 不拷贝），因此无论下游哪个 mutated exchange 置入工厂，这里都能读到。</p>
 *
 * <p><b>再入护栏</b>：工厂产物（如 WatermarkDecorator）通常包装本装饰器（delegate
 * 回指本桥），其 {@code super.writeWith} 会沿 delegate 链再入本类 write 方法、再次解析
 * 工厂——无限递归。护栏标记「正在委托工厂产物」：装配期（工厂委托链是同步下行的）的
 * 再入直接落到底层原始 response，打断 解析→包装→再入 循环；工厂返回本装饰器自身
 * （恒等）同样直接透传。</p>
 */
class LateBindingResponseDecorator extends ServerHttpResponseDecorator {

    private final ServerWebExchange exchange;

    /** 再入护栏（见类 javadoc）：仅装配期同步递归链内为 true。 */
    private boolean delegating;

    LateBindingResponseDecorator(ServerWebExchange exchange) {
        super(exchange.getResponse());
        this.exchange = exchange;
    }

    @Override
    public Mono<Void> writeWith(Publisher<? extends DataBuffer> body) {
        if (delegating) {
            return super.writeWith(body);
        }
        ServerHttpResponse decorated = resolveDecorated();
        if (decorated == null || decorated == this) {
            return super.writeWith(body);
        }
        delegating = true;
        try {
            return decorated.writeWith(body);
        } finally {
            delegating = false;
        }
    }

    @Override
    public Mono<Void> writeAndFlushWith(Publisher<? extends Publisher<? extends DataBuffer>> body) {
        if (delegating) {
            return super.writeAndFlushWith(body);
        }
        ServerHttpResponse decorated = resolveDecorated();
        if (decorated == null || decorated == this) {
            return super.writeAndFlushWith(body);
        }
        delegating = true;
        try {
            return decorated.writeAndFlushWith(body);
        } finally {
            delegating = false;
        }
    }

    /** 写回时刻解析装饰工厂：未置入返回 null（透传），命中则应用于本装饰器自身。 */
    private ServerHttpResponse resolveDecorated() {
        Function<ServerHttpResponse, ServerHttpResponse> factory =
                (Function<ServerHttpResponse, ServerHttpResponse>) exchange.getAttributes()
                        .get(GatewayConstants.RESPONSE_DECORATOR_FACTORY_KEY);
        return factory != null ? factory.apply(this) : null;
    }
}
