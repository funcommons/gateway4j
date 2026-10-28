package fun.commons.gateway4j.plugin.api;

import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

public interface PluginChain {

    Mono<Void> execute(ServerWebExchange exchange);
}
