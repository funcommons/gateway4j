package fun.commons.gateway4j.engine.plugin.group;

import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class GroupPluginTest {

    private MockServerWebExchange createExchange() {
        return MockServerWebExchange.builder(MockServerHttpRequest.get("/test").build()).build();
    }

    static class TrackingPlugin implements GatewayPlugin {
        private final String id;
        private final List<String> log;

        TrackingPlugin(String id, List<String> log) {
            this.id = id;
            this.log = log;
        }

        @Override public String pluginId() { return id; }
        @Override public String pluginName() { return id; }
        @Override public String phase() { return "PRE"; }
        @Override public int order() { return 0; }

        @Override
        public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
            log.add(id);
            return chain.execute(exchange);
        }
    }

    @Test
    void groupExecutesMembersThenContinuesParent() {
        List<String> log = new ArrayList<>();

        GatewayPlugin member1 = new TrackingPlugin("member1", log);
        GatewayPlugin member2 = new TrackingPlugin("member2", log);
        GroupPlugin group = new GroupPlugin("group", "组插件", "PRE", 0, List.of(member1, member2));

        GatewayPlugin afterGroup = new TrackingPlugin("after", log);

        PluginChain parentChain = new PluginChain() {
            private boolean groupCalled = false;

            @Override
            public Mono<Void> execute(ServerWebExchange exchange) {
                if (!groupCalled) {
                    groupCalled = true;
                    return group.execute(exchange, this);
                }
                return afterGroup.execute(exchange, new PluginChain() {
                    @Override
                    public Mono<Void> execute(ServerWebExchange exchange) {
                        return Mono.empty();
                    }
                });
            }
        };

        StepVerifier.create(parentChain.execute(createExchange())).verifyComplete();
        assertEquals(List.of("member1", "member2", "after"), log);
    }

    @Test
    void membersReturnsList() {
        TrackingPlugin m1 = new TrackingPlugin("m1", new ArrayList<>());
        TrackingPlugin m2 = new TrackingPlugin("m2", new ArrayList<>());
        GroupPlugin group = new GroupPlugin("g", "组", "PRE", 0, List.of(m1, m2));
        assertEquals(2, group.members().size());
    }
}
