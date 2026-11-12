package fun.commons.gateway4j.gateway;

import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.PortBinding;
import com.github.dockerjava.api.model.Ports;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.ContainerState;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * gateway-boot 启动冒烟测试（Testcontainers：postgres:17 + redis:7，镜像与
 * {@code AdminBootApplicationSmokeTest} / nightly 回归环境对齐）。
 *
 * <p>覆盖四件事：
 * <ol>
 *   <li>Spring 容器加载成功（reactive/Netty 上下文，主配置类 bean 存在）；</li>
 *   <li>启动完成：随机端口已被监听（裸 socket 探活），/actuator/health 返回
 *       200 且 status=UP；</li>
 *   <li><b>P0-1 护栏</b>：管理面路径 {@code /v1/users}、{@code /v1/routes}
 *       在 9300 数据面必须 404/401（不得 200）——这是「9300 摘除管理面」
 *       （gateway-boot 与 admin 模块解耦）的固化守卫，一旦回归立刻红灯；</li>
 *   <li>未匹配路径 404 兜底存活：{@code GatewayErrorAdvice} 返回 404 + 统一
 *       信封 + {@code X-Trace-Id}（而非被吞成 500）。</li>
 * </ol>
 *
 * <p>与 admin-boot 冒烟测试的两点差异：
 * <ul>
 *   <li>gateway-boot 不内嵌 Flyway（管理面能力），这里以 test 依赖引入 Flyway，
 *       借 {@code @DynamicPropertySource} 回调（发生在上下文 refresh 之前、容器
 *       连接串已就绪之后，先于任何 bean 初始化）对 Testcontainers Postgres 应用
 *       admin-boot 的迁移脚本 —— {@code filesystem:} 直接引用原目录，单一事实
 *       来源，不复制 SQL。之所以必须建 schema：{@code ServerAutoConfiguration}
 *       的 {@code configInitializer} 在 SmartInitializingSingleton 阶段无条件调
 *       {@code ConfigService.loadAllConfig()} 查 gw_route/gw_plugin，表不存在会
 *       直接炸掉启动；</li>
 *   <li>admin-boot 用 TestRestTemplate（Servlet 栈），网关是 reactive，这里显式
 *       构建 {@code WebTestClient.bindToServer()}（不依赖自动装配，更稳）+
 *       裸 socket 探活。</li>
 * </ul>
 *
 * <p>连接串通过 {@code @DynamicPropertySource} 覆盖 framework4j 多数据源/多 Redis
 * 配置（application.yml 默认指向 localhost:5432 / localhost:6379）。网关启动会
 * 订阅 {@code gateway4j:config:changed} pub/sub、写 {@code gateway4j:plugin:runtime}
 * 等键 —— 全部落到 Testcontainers 实例，不碰本机真库。
 *
 * <p>宿主映射端口用 Docker 端口段绑定（{@code -p start-end:container}）约束到
 * 临时端口段之外的安全区（postgres 15432-15531 / redis 16379-16478），由守护进程
 * 在段内原子挑空闲端口 —— 根治 macOS 随机映射撞上本机服务（如 IntelliJ 内置
 * 63342）导致 lettuce 连错服务、四例全灭的偶发 flake，详见安全段常量处注释。
 *
 * <p>运行方式（需要本机 Docker）：
 * <pre>mvn -pl gateway4j-gateway-boot -am test -Dtest=GatewayBootApplicationSmokeTest</pre>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class GatewayBootApplicationSmokeTest {

    /**
     * Testcontainers 宿主映射端口安全段（根治端口碰撞 flake）：Docker 默认把容器
     * 端口随机映射到宿主临时端口段（macOS 49152-65535），与本机常驻服务偶发碰撞
     * ——典型如 IntelliJ 内置服务器 127.0.0.1:63342。因 IDE 绑定回环、Docker 绑定
     * 通配，OS 层可共存不报错，但客户端连到的是 IDE 的 HTTP 服务，握手即断
     * （RedisConnectionException: Connection closed prematurely），冒烟四例全灭
     * 且难复现。
     *
     * <p>修法：把映射端口约束到临时段之外的低段安全区，由 Docker 守护进程在段内
     * <b>原子</b>挑选空闲端口（{@code -p start-end:container} 绑定语义，段内端口
     * 被本机进程或残留容器占用时自动顺延），从根上消灭随机碰撞面。启动后由
     * {@link #assertMappedPortWithinSafeRange} 兜底校验：若 Docker 引擎对端口段
     * 绑定的支持失效，立即给出明确诊断，而不是把静默连错的风险放回。
     */
    static final int POSTGRES_HOST_PORT_RANGE_START = 15432;
    static final int POSTGRES_HOST_PORT_RANGE_END = 15531;
    static final int REDIS_HOST_PORT_RANGE_START = 16379;
    static final int REDIS_HOST_PORT_RANGE_END = 16478;

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17")
            .withDatabaseName("gateway4j")
            .withUsername("admin")
            .withPassword("test@2026")
            .withCreateContainerCmdModifier(cmd -> cmd.withPortBindings(new PortBinding(
                    Ports.Binding.bindPortRange(POSTGRES_HOST_PORT_RANGE_START, POSTGRES_HOST_PORT_RANGE_END),
                    new ExposedPort(5432))));

    @Container
    static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7")
            .withExposedPorts(6379)
            .withCreateContainerCmdModifier(cmd -> cmd.withPortBindings(new PortBinding(
                    Ports.Binding.bindPortRange(REDIS_HOST_PORT_RANGE_START, REDIS_HOST_PORT_RANGE_END),
                    new ExposedPort(6379))));

    /**
     * 兜底校验：容器启动后实际映射端口必须落在安全段内。
     */
    private static void assertMappedPortWithinSafeRange(ContainerState container, int containerPort,
                                                        int rangeStart, int rangeEnd, String name) {
        Integer mapped = container.getMappedPort(containerPort);
        if (mapped == null || mapped < rangeStart || mapped > rangeEnd) {
            throw new IllegalStateException(String.format(
                    "%s 容器宿主映射端口越界：期望 %d-%d（安全段，避开 macOS 临时端口段与 IDE 端口），实际 %s"
                            + " —— Testcontainers 端口段绑定未生效，请检查 Docker 引擎对"
                            + " -p start-end:port 绑定的支持",
                    name, rangeStart, rangeEnd, mapped));
        }
    }

    private static final AtomicBoolean SCHEMA_MIGRATED = new AtomicBoolean(false);

    @DynamicPropertySource
    static void overrideFramework4jConnections(DynamicPropertyRegistry registry) {
        // 端口碰撞兜底：确认容器映射端口确实落在安全段（见常量注释），越界即快败
        assertMappedPortWithinSafeRange(POSTGRES, 5432,
                POSTGRES_HOST_PORT_RANGE_START, POSTGRES_HOST_PORT_RANGE_END, "postgres");
        assertMappedPortWithinSafeRange(REDIS, 6379,
                REDIS_HOST_PORT_RANGE_START, REDIS_HOST_PORT_RANGE_END, "redis");

        // flyway-core 只在 test classpath 上，Boot 的 FlywayAutoConfiguration 会据
        // DataSource bean 自动激活并以 classpath:db/migration 为默认位置，对本测试
        // 的 filesystem 迁移报"resolved 不到"的 ERROR；网关本身不内嵌 Flyway，关掉。
        registry.add("spring.flyway.enabled", () -> false);
        registry.add("framework4j.datasource.datasources.default.url", POSTGRES::getJdbcUrl);
        registry.add("framework4j.datasource.datasources.default.username", POSTGRES::getUsername);
        registry.add("framework4j.datasource.datasources.default.password", POSTGRES::getPassword);
        registry.add("framework4j.redis.datasources.default.host", REDIS::getHost);
        registry.add("framework4j.redis.datasources.default.port", () -> REDIS.getMappedPort(6379));

        // schema 必须先于任何 bean 初始化存在（configInitializer 启动即查库）。
        // getJdbcUrl() 会强制容器启动，保证这里执行时 Postgres 已就绪。
        if (SCHEMA_MIGRATED.compareAndSet(false, true)) {
            Flyway.configure()
                    .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                    .locations("filesystem:" + resolveAdminMigrationsDir().toAbsolutePath())
                    .load()
                    .migrate();
        }
    }

    /**
     * 定位 admin-boot 的 Flyway 迁移目录（单一事实来源，按文件系统相对路径解析，
     * 兼容 surefire 模块 basedir 与仓库根两种工作目录）。
     */
    private static Path resolveAdminMigrationsDir() {
        List<Path> candidates = List.of(
                Path.of("../gateway4j-admin-boot/src/main/resources/db/migration"),
                Path.of("gateway4j-admin-boot/src/main/resources/db/migration"));
        return candidates.stream()
                .filter(Files::isDirectory)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "找不到 admin-boot 迁移目录（gateway4j-admin-boot/src/main/resources/db/migration），"
                                + "gateway 冒烟测试依赖它建 schema；工作目录=" + Path.of("").toAbsolutePath()));
    }

    @LocalServerPort
    int port;

    @Autowired
    ApplicationContext context;

    private WebTestClient client;

    @BeforeEach
    void setUpClient() {
        client = WebTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .responseTimeout(Duration.ofSeconds(10))
                .build();
    }

    @Test
    void contextLoads() {
        assertThat(context).isNotNull();
        assertThat(context.getBean(Gateway4jGatewayApplication.class)).isNotNull();
    }

    @Test
    void gatewayPortListeningAndStartupCompleted() throws Exception {
        assertThat(port).isPositive();
        // 裸 socket 探活：Netty 已在随机端口监听并接受 TCP 连接
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", port), 3000);
            assertThat(socket.isConnected()).isTrue();
        }
        // HTTP 已可服务：actuator 健康检查 200 且 UP（隐含 DB/Redis 连接就绪）
        client.get().uri("/actuator/health").exchange()
                .expectStatus().isOk()
                .expectBody(String.class)
                .value(body -> assertThat(body).contains("\"status\":\"UP\""));
    }

    /**
     * P0-1 护栏：9300 数据面不得暴露管理面接口（H4 摘除管理面的固化守卫）。
     * /v1/users、/v1/routes 是 admin-boot 的管理 API，网关上必须 404（或被安全
     * 拦截 401），一旦出现 200 即视为回归。
     */
    @Test
    void adminEndpointsNotExposedOnDataPlane() {
        for (String adminPath : List.of("/v1/users", "/v1/routes")) {
            client.get().uri(adminPath).exchange()
                    .expectStatus()
                    .value(status -> assertThat(status)
                            .as("P0-1 护栏：数据面 %s 应返回 404/401，不得 200（实际 %d）", adminPath, status)
                            .isIn(401, 404));
        }
    }

    @Test
    void unmatchedPathFallsBackTo404Envelope() {
        client.get().uri("/gateway4j-smoke/unmatched-" + UUID.randomUUID()).exchange()
                .expectStatus().isNotFound()
                .expectHeader().exists("X-Trace-Id")
                .expectBody()
                .jsonPath("$.code").isEqualTo(404)
                .jsonPath("$.success").isEqualTo(false);
    }
}
