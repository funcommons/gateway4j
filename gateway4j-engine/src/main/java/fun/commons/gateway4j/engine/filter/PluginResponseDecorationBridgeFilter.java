package fun.commons.gateway4j.engine.filter;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.cloud.gateway.filter.NettyWriteResponseFilter;
import org.springframework.core.Ordered;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * 响应装饰晚绑定桥（S11-4e）。
 *
 * <p><b>问题</b>：SCG NettyWriteResponseFilter（order=-1，下行最早段被调）的写回闭包
 * {@code chain.filter(exchange).then(Mono.defer(...))} 捕获的是 <b>它自己被调时的
 * exchange</b>；而插件链 {@link PluginExecutionFilter}（order=10020）依赖分发路由
 * （DispatchRoutingFilter，order=10010）必须晚跑——PRE 插件
 * {@code exchange.mutate().response(decorator)} 只向下游传播（NettyRoutingFilter 收到
 * mutated 做上游调用没问题），写回发生在 NettyWriteResponseFilter 的 .then() 里、用的
 * 仍是它 order=-1 被调时捕获的原始 response——插件运行前写回装配已绑定原始 response，
 * 插件的 response 装饰结构上不可达（真实流量实测：装饰器包上了但 writeWith 全程零调用）。
 * 这就是著名的 SCG 响应装饰模式必须挂在 order&lt;-1 的原因，与插件链必须晚跑直接矛盾。</p>
 *
 * <p><b>解法（晚绑定装饰桥）</b>：本过滤器挂
 * {@code NettyWriteResponseFilter.WRITE_RESPONSE_FILTER_ORDER - 1}（=-2，先于写过滤器
 * 被调），无条件把 response 换成透明的 {@link LateBindingResponseDecorator}——它成为
 * 写过滤器闭包捕获的 response；插件链运行时 PRE 插件把装饰工厂置入 exchange attributes
 * （{@link fun.commons.gateway4j.common.constant.GatewayConstants#RESPONSE_DECORATOR_FACTORY_KEY}，
 * attribute map 原始/mutated exchange 共享），装饰器在 <b>写回时</b>（writeWith/writeAndFlushWith）
 * 才解析工厂并应用——把「插件链运行时才可用的装饰」延迟到「写回装配时刻」注入，穿透 SCG 写回闭包。
 * 无工厂时逐字节透传（仅多一层委托），普通请求零影响。</p>
 *
 * <p>响应装饰类 PRE 插件的新用法：置 attribute 工厂，<b>勿 mutate().response()</b>，详见
 * {@link fun.commons.gateway4j.common.constant.GatewayConstants#RESPONSE_DECORATOR_FACTORY_KEY}
 * javadoc。</p>
 */
public class PluginResponseDecorationBridgeFilter implements GlobalFilter, Ordered {

    @Override
    public int getOrder() {
        return NettyWriteResponseFilter.WRITE_RESPONSE_FILTER_ORDER - 1;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        return chain.filter(exchange.mutate()
                .response(new LateBindingResponseDecorator(exchange))
                .build());
    }
}
