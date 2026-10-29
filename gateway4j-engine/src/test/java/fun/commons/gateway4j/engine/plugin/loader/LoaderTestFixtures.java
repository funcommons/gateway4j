package fun.commons.gateway4j.engine.plugin.loader;

/**
 * Shared fixtures for the plugin-loader tests.
 */
final class LoaderTestFixtures {

    private LoaderTestFixtures() {
    }

    /**
     * A legitimate Groovy plugin script: implements GatewayPlugin, reads a request
     * header, writes an exchange attribute, delegates through the chain.
     */
    static final String LEGIT_SCRIPT = """
            import fun.commons.gateway4j.plugin.api.*
            import org.springframework.web.server.ServerWebExchange
            import reactor.core.publisher.Mono

            class HeaderEchoPlugin implements GatewayPlugin {
                String pluginId() { 'groovy.echo' }
                String pluginName() { 'Header Echo' }
                String phase() { 'PRE' }
                int order() { 0 }
                Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
                    def value = exchange.getRequest().getHeaders().getFirst('X-Demo')
                    if (value != null) {
                        exchange.getAttributes().put('gw4j:groovyEcho', value.toUpperCase())
                    }
                    return chain.execute(exchange)
                }
            }
            """;

    static final String LEGIT_SCRIPT_MD5 = GroovyPluginLoader.md5Hex(LEGIT_SCRIPT);
}
