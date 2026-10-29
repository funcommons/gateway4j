package fun.commons.gateway4j.engine.route.dispatcher;

import fun.commons.gateway4j.common.model.Route;import fun.commons.gateway4j.common.model.RouteCondition;
import fun.commons.gateway4j.engine.route.matcher.RouteConditionMatcher;
import fun.commons.gateway4j.engine.route.matcher.RoutePathMatcher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.test.StepVerifier;

import java.util.ArrayList;
import java.util.List;
import java.util.SplittableRandom;

import static org.junit.jupiter.api.Assertions.*;

/**
 * P2-4 权重分流（WEIGHT 条件）语义与分布验证。
 *
 * <p>选定口径：WEIGHT 条件不是请求谓词；仅当同一分发路由下没有任何非 WEIGHT
 * 条件匹配时进入加权随机通道；权重取 {@code condition_key} 正整数字符串，
 * 非法权重候选记 0（不参与加权但保留参与全 0 兜底）；权重和为 0 →
 * 既有默认选择（priority 升序首个目标可解析候选）。</p>
 */
class RouteDispatcherWeightTest {

    private RoutePathMatcher pathMatcher;
    private RouteConditionMatcher conditionMatcher;
    private List<Route> routes;
    private List<RouteCondition> conditions;

    @BeforeEach
    void setUp() {
        pathMatcher = new RoutePathMatcher();
        conditionMatcher = new RouteConditionMatcher();
        routes = new ArrayList<>();
        conditions = new ArrayList<>();
    }

    private RouteDispatcher newSeededDispatcher(long seed) {
        RouteDispatcher dispatcher = new RouteDispatcher(pathMatcher, conditionMatcher, new SplittableRandom(seed));
        dispatcher.updateRoutes(List.copyOf(routes), List.copyOf(conditions));
        return dispatcher;
    }

    private Route dispatchRoute(long id, String path) {
        return Route.builder().id(id).routeName("d" + id).routeType("DISPATCH").path(path).build();
    }

    private Route backendRoute(long id, String upstream) {
        return Route.builder().id(id).routeName("b" + id).routeType("BACKEND").upstreamUrl(upstream).build();
    }

    private RouteCondition weight(long routeId, long targetId, String weight, int priority) {
        return RouteCondition.builder().routeId(routeId).targetRouteId(targetId)
                .conditionType("WEIGHT").operator("EXISTS")
                .conditionKey(weight).conditionValue(null).priority(priority).build();
    }

    private MockServerWebExchange exchange(String path) {
        return MockServerWebExchange.builder(MockServerHttpRequest.get(path).build()).build();
    }

    private Long resolve(RouteDispatcher dispatcher, String path) {
        return dispatcher.dispatch(exchange(path)).block().routeId();
    }

    @Test
    void weight20vs80DistributionWithin16To24PercentOver2000Draws() {
        routes.add(dispatchRoute(1L, "/api/**"));
        routes.add(backendRoute(2L, "http://canary:8080"));
        routes.add(backendRoute(3L, "http://stable:8080"));
        conditions.add(weight(1L, 2L, "20", 0));
        conditions.add(weight(1L, 3L, "80", 0));
        RouteDispatcher dispatcher = newSeededDispatcher(42L);

        int canary = 0;
        int stable = 0;
        int draws = 2000;
        for (int i = 0; i < draws; i++) {
            long picked = resolve(dispatcher, "/api/ping");
            if (picked == 2L) {
                canary++;
            } else if (picked == 3L) {
                stable++;
            } else {
                fail("unexpected target " + picked + " — must resolve to a weighted candidate");
            }
        }
        // 20% ± 4pt: [16%, 24%] → [320, 480]; the 80% candidate takes the rest
        assertTrue(canary >= 320 && canary <= 480,
                "20% weight candidate must land in [320,480] over 2000 draws, was " + canary);
        assertEquals(draws, canary + stable, "every draw must resolve to one of the two weighted candidates");
        assertEquals(draws - canary, stable);
    }

    @Test
    void fixedSeedReproducesExactSequence() {
        routes.add(dispatchRoute(1L, "/api/**"));
        routes.add(backendRoute(2L, "http://a:8080"));
        routes.add(backendRoute(3L, "http://b:8080"));
        conditions.add(weight(1L, 2L, "20", 0));
        conditions.add(weight(1L, 3L, "80", 0));

        RouteDispatcher run1 = newSeededDispatcher(7L);
        RouteDispatcher run2 = newSeededDispatcher(7L);
        List<Long> seq1 = new ArrayList<>();
        List<Long> seq2 = new ArrayList<>();
        for (int i = 0; i < 50; i++) {
            seq1.add(resolve(run1, "/api/ping"));
            seq2.add(resolve(run2, "/api/ping"));
        }
        assertEquals(seq1, seq2, "same seed must reproduce the exact selection sequence");

        // independent re-derivation: cumulative weight intervals on SplittableRandom(7),
        // total = 20 + 80; candidate 2 owns [0,20), candidate 3 owns [20,100)
        SplittableRandom reference = new SplittableRandom(7L);
        List<Long> expected = new ArrayList<>();
        for (int i = 0; i < 50; i++) {
            double r = reference.nextDouble() * 100d;
            expected.add(r < 20d ? 2L : 3L);
        }
        assertEquals(expected, seq1, "seeded sequence must match the weight-interval reference algorithm");
    }

    @Test
    void zeroWeightCandidateNeverChosenWhenPositiveWeightsExist() {
        routes.add(dispatchRoute(1L, "/api/**"));
        routes.add(backendRoute(2L, "http://zero:8080"));
        routes.add(backendRoute(3L, "http://half1:8080"));
        routes.add(backendRoute(4L, "http://half2:8080"));
        conditions.add(weight(1L, 2L, "0", 1));
        conditions.add(weight(1L, 3L, "50", 2));
        conditions.add(weight(1L, 4L, "50", 3));
        RouteDispatcher dispatcher = newSeededDispatcher(2024L);

        for (int i = 0; i < 500; i++) {
            long picked = resolve(dispatcher, "/api/ping");
            assertNotEquals(2L, picked, "zero-weight candidate must never be picked while positive weights exist");
        }
    }

    @Test
    void allZeroWeightsFallBackToPriorityFirstCandidate() {
        routes.add(dispatchRoute(1L, "/api/**"));
        routes.add(backendRoute(2L, "http://first:8080"));
        routes.add(backendRoute(3L, "http://second:8080"));
        conditions.add(weight(1L, 2L, "0", 1));
        conditions.add(weight(1L, 3L, "0", 2));
        RouteDispatcher dispatcher = newSeededDispatcher(99L);

        for (int i = 0; i < 20; i++) {
            assertEquals(2L, resolve(dispatcher, "/api/ping"),
                    "zero total weight must fall back to priority-first resolvable candidate");
        }
    }

    @Test
    void allInvalidWeightsFallBackToPriorityFirstCandidate() {
        routes.add(dispatchRoute(1L, "/api/**"));
        routes.add(backendRoute(2L, "http://first:8080"));
        routes.add(backendRoute(3L, "http://second:8080"));
        conditions.add(weight(1L, 2L, "abc", 1));
        conditions.add(weight(1L, 3L, "-3", 2));
        RouteDispatcher dispatcher = newSeededDispatcher(99L);

        for (int i = 0; i < 20; i++) {
            assertEquals(2L, resolve(dispatcher, "/api/ping"),
                    "non-numeric/negative weights are invalid (0) → priority-first fallback");
        }
    }

    @Test
    void invalidWeightCandidatesExcludedFromRandomPool() {
        routes.add(dispatchRoute(1L, "/api/**"));
        routes.add(backendRoute(2L, "http://nan:8080"));
        routes.add(backendRoute(3L, "http://negative:8080"));
        routes.add(backendRoute(4L, "http://blank:8080"));
        routes.add(backendRoute(5L, "http://valid:8080"));
        conditions.add(weight(1L, 2L, "abc", 1));
        conditions.add(weight(1L, 3L, "-5", 2));
        conditions.add(weight(1L, 4L, "  ", 3));
        conditions.add(weight(1L, 5L, "100", 4));
        RouteDispatcher dispatcher = newSeededDispatcher(123L);

        for (int i = 0; i < 30; i++) {
            assertEquals(5L, resolve(dispatcher, "/api/ping"),
                    "the only valid-weight candidate (100) must always win");
        }
    }

    @Test
    void blankKeyWeightCandidateIsInvalidToo() {
        routes.add(dispatchRoute(1L, "/api/**"));
        routes.add(backendRoute(2L, "http://nullkey:8080"));
        routes.add(backendRoute(3L, "http://valid:8080"));
        conditions.add(RouteCondition.builder().routeId(1L).targetRouteId(2L)
                .conditionType("WEIGHT").operator("EXISTS")
                .conditionKey(null).conditionValue("80").priority(0).build());
        conditions.add(weight(1L, 3L, "20", 1));
        RouteDispatcher dispatcher = newSeededDispatcher(5L);

        // weight lives in condition_key only (condition_value ignored per contract);
        // candidate 2 is invalid → candidate 3 (weight 20) is the sole weighted pool entry
        for (int i = 0; i < 20; i++) {
            assertEquals(3L, resolve(dispatcher, "/api/ping"));
        }
    }

    @Test
    void mixedCandidatesNonWeightMatchTakesPrecedenceOverWeightedPool() {
        routes.add(dispatchRoute(1L, "/api/**"));
        routes.add(backendRoute(2L, "http://header:8080"));
        routes.add(backendRoute(3L, "http://w80:8080"));
        routes.add(backendRoute(4L, "http://w20:8080"));
        conditions.add(RouteCondition.builder().routeId(1L).targetRouteId(2L)
                .conditionType("HEADER").operator("EQ")
                .conditionKey("x-ver").conditionValue("v1").priority(0).build());
        conditions.add(weight(1L, 3L, "80", 1));
        conditions.add(weight(1L, 4L, "20", 2));
        RouteDispatcher dispatcher = newSeededDispatcher(11L);

        // non-WEIGHT match keeps existing first-match precedence: header target always wins
        for (int i = 0; i < 20; i++) {
            MockServerWebExchange matched = MockServerWebExchange.builder(
                    MockServerHttpRequest.get("/api/ping").header("x-ver", "v1").build()).build();
            assertEquals(2L, dispatcher.dispatch(matched).block().routeId(),
                    "a matching non-WEIGHT condition must beat the weighted pool");
        }

        // no non-WEIGHT match → weighted pool engaged (deterministic with the fixed seed)
        int w20 = 0;
        for (int i = 0; i < 500; i++) {
            long picked = resolve(dispatcher, "/api/ping");
            assertTrue(picked == 3L || picked == 4L);
            if (picked == 4L) {
                w20++;
            }
        }
        assertTrue(w20 >= 60 && w20 <= 140, "20% weighted candidate must land in [60,140] over 500 draws, was " + w20);
    }

    @Test
    void missingTargetWeightCandidateIsSkipped() {
        routes.add(dispatchRoute(1L, "/api/**"));
        routes.add(backendRoute(3L, "http://alive:8080"));
        conditions.add(weight(1L, 99L, "50", 0));
        conditions.add(weight(1L, 3L, "50", 1));
        RouteDispatcher dispatcher = newSeededDispatcher(77L);

        for (int i = 0; i < 20; i++) {
            assertEquals(3L, resolve(dispatcher, "/api/ping"),
                    "candidate targeting an unpublished route must be dropped from the pool");
        }
    }

    @Test
    void allWeightTargetsMissingResolvesEmpty() {
        routes.add(dispatchRoute(1L, "/api/**"));
        routes.add(backendRoute(3L, "http://alive:8080"));
        conditions.add(weight(1L, 99L, "50", 0));
        conditions.add(weight(1L, 98L, "50", 1));
        RouteDispatcher dispatcher = newSeededDispatcher(77L);

        StepVerifier.create(dispatcher.dispatch(exchange("/api/ping")))
                .verifyComplete();
    }

    @Test
    void cyclicWeightTargetExcludedInsteadOfRandomCycleError() {
        routes.add(dispatchRoute(1L, "/api/**"));
        routes.add(dispatchRoute(2L, null));
        conditions.add(weight(1L, 2L, "100", 0));
        conditions.add(weight(2L, 1L, "100", 0));
        RouteDispatcher dispatcher = newSeededDispatcher(31L);

        // entry → d2 (weighted); d2's only candidate loops back to visited d1 → excluded → empty
        assertDoesNotThrow(() -> dispatcher.dispatch(exchange("/api/ping")).block());
        StepVerifier.create(dispatcher.dispatch(exchange("/api/ping")))
                .verifyComplete();
    }

    @Test
    void weightedCandidateCanTargetNestedDispatch() {
        routes.add(dispatchRoute(1L, "/api/**"));
        routes.add(dispatchRoute(2L, null));
        routes.add(backendRoute(3L, "http://nested:8080"));
        conditions.add(weight(1L, 2L, "100", 0));
        conditions.add(RouteCondition.builder().routeId(2L).targetRouteId(3L)
                .conditionType("HEADER").operator("EQ")
                .conditionKey("x-env").conditionValue("prod").priority(0).build());
        RouteDispatcher dispatcher = newSeededDispatcher(13L);

        MockServerWebExchange ex = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/ping").header("x-env", "prod").build()).build();
        StepVerifier.create(dispatcher.dispatch(ex))
                .assertNext(resolved -> {
                    assertEquals(3L, resolved.routeId());
                    assertEquals(List.of(1L, 2L, 3L), resolved.dispatchPath());
                })
                .verifyComplete();
    }

    @Test
    void singleValidWeightCandidateAlwaysResolves() {
        routes.add(dispatchRoute(1L, "/api/**"));
        routes.add(backendRoute(2L, "http://only:8080"));
        conditions.add(weight(1L, 2L, "100", 0));
        // even with a seeded generator the single valid candidate must resolve every time
        RouteDispatcher dispatcher = newSeededDispatcher(1L);
        for (int i = 0; i < 10; i++) {
            assertEquals(2L, resolve(dispatcher, "/api/ping"));
        }
    }

    @Test
    void legacyRoutesWithoutWeightKeepExactLegacyBehavior() {
        routes.add(dispatchRoute(1L, "/api/**"));
        routes.add(backendRoute(2L, "http://v2:8080"));
        routes.add(backendRoute(3L, "http://v1:8080"));
        conditions.add(RouteCondition.builder().routeId(1L).targetRouteId(2L)
                .conditionType("HEADER").operator("EQ")
                .conditionKey("X-Version").conditionValue("v2").priority(0).build());
        conditions.add(RouteCondition.builder().routeId(1L).targetRouteId(3L)
                .conditionType("HEADER").operator("EQ")
                .conditionKey("X-Version").conditionValue("v1").priority(1).build());
        RouteDispatcher dispatcher = newSeededDispatcher(3L);

        MockServerWebExchange v2 = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/u").header("X-Version", "v2").build()).build();
        MockServerWebExchange v1 = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/u").header("X-Version", "v1").build()).build();
        assertEquals(2L, dispatcher.dispatch(v2).block().routeId());
        assertEquals(3L, dispatcher.dispatch(v1).block().routeId());

        // priority wins over later match: v2 condition (prio 0) not matched by "v1" header
        MockServerWebExchange both = MockServerWebExchange.builder(
                MockServerHttpRequest.get("/api/u").header("X-Version", "v2").build()).build();
        assertEquals(2L, dispatcher.dispatch(both).block().routeId());
    }

    // NOTE: legacy non-WEIGHT cycle → CyclicReferenceException stays covered, unchanged,
    // by RouteDispatcherTest.cyclicReferenceThrows (both candidates HEADER conditions).
}
