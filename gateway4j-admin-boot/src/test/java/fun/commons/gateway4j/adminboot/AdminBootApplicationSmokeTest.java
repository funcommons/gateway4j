package fun.commons.gateway4j.adminboot;

import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.PortBinding;
import com.github.dockerjava.api.model.Ports;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationContext;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.ContainerState;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * admin-boot 启动冒烟测试（Testcontainers：postgres:17 + redis:7，对齐
 * .github/workflows/nightly-regression.yml 的 service 容器镜像）。
 *
 * <p>覆盖三件事：
 * <ol>
 *   <li>Spring 容器加载成功（context loads）；</li>
 *   <li>SpringApplication 启动完成 —— 内嵌 Tomcat 在随机端口上响应，
 *       /actuator/health 返回 200 且 status=UP，主配置类 bean 存在；</li>
 *   <li>Flyway 全部迁移已 applied —— classpath:db/migration 下解析到的每个
 *       版本都必须出现在 applied 列表中，且没有 pending 迁移。</li>
 * </ol>
 *
 * <p>连接串通过 @DynamicPropertySource 覆盖 framework4j 多数据源配置
 * （application.yml 默认指向 localhost:5432 / localhost:6379），避免与本机
 * 常驻容器/开发库互相污染。
 *
 * <p>宿主映射端口用 Docker 端口段绑定（{@code -p start-end:container}）约束到
 * 临时端口段之外的安全区（postgres 15432-15531 / redis 16379-16478），由守护进程
 * 在段内原子挑空闲端口 —— 根治 macOS 随机映射撞上本机服务（如 IntelliJ 内置
 * 63342）导致 lettuce 连错服务、冒烟全灭的偶发 flake，详见安全段常量处注释。
 * 与 gateway-boot 冒烟测试共用同一安全段：两模块测试票间串行执行，同段无冲突。
 *
 * <p>运行方式（需要本机 Docker）：
 * <pre>mvn -pl gateway4j-admin-boot -am test -Dtest=AdminBootApplicationSmokeTest -Dsurefire.failIfNoSpecifiedTests=false</pre>
 * 目前未挂入 ci.yml（backend job 只构建 gateway4j-admin -am，不编译 admin-boot），
 * 待 CI 上验证 Testcontainers 稳定后可单独加 job。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class AdminBootApplicationSmokeTest {

    /**
     * Testcontainers 宿主映射端口安全段（根治端口碰撞 flake）：Docker 默认把容器
     * 端口随机映射到宿主临时端口段（macOS 49152-65535），与本机常驻服务偶发碰撞
     * ——典型如 IntelliJ 内置服务器 127.0.0.1:63342。因 IDE 绑定回环、Docker 绑定
     * 通配，OS 层可共存不报错，但客户端连到的是 IDE 的 HTTP 服务，握手即断
     * （RedisConnectionException: Connection closed prematurely），冒烟用例全灭
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

    @DynamicPropertySource
    static void overrideFramework4jConnections(DynamicPropertyRegistry registry) {
        // 端口碰撞兜底：确认容器映射端口确实落在安全段（见常量注释），越界即快败
        assertMappedPortWithinSafeRange(POSTGRES, 5432,
                POSTGRES_HOST_PORT_RANGE_START, POSTGRES_HOST_PORT_RANGE_END, "postgres");
        assertMappedPortWithinSafeRange(REDIS, 6379,
                REDIS_HOST_PORT_RANGE_START, REDIS_HOST_PORT_RANGE_END, "redis");

        registry.add("framework4j.datasource.datasources.default.url", POSTGRES::getJdbcUrl);
        registry.add("framework4j.datasource.datasources.default.username", POSTGRES::getUsername);
        registry.add("framework4j.datasource.datasources.default.password", POSTGRES::getPassword);
        registry.add("framework4j.redis.datasources.default.host", REDIS::getHost);
        registry.add("framework4j.redis.datasources.default.port", () -> REDIS.getMappedPort(6379));
    }

    @LocalServerPort
    int port;

    @Autowired
    ApplicationContext context;

    @Autowired
    TestRestTemplate restTemplate;

    @Autowired
    Flyway flyway;

    @Test
    void contextLoads() {
        assertThat(context).isNotNull();
        assertThat(context.getBean(Gateway4jAdminBootApplication.class)).isNotNull();
    }

    @Test
    void springApplicationStartupCompleted() {
        assertThat(port).isPositive();
        // Tomcat 已监听：actuator 健康检查 200 且 UP（同时隐含 DB/Redis 连接就绪）
        ResponseEntity<String> health = restTemplate.getForEntity("/actuator/health", String.class);
        assertThat(health.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(health.getBody()).isNotNull();
        assertThat(health.getBody()).contains("\"status\":\"UP\"");
    }

    @Test
    void flywayAllMigrationsApplied() throws IOException {
        Set<String> appliedVersions = new HashSet<>();
        List<MigrationInfo> applied = Arrays.asList(flyway.info().applied());
        for (MigrationInfo migration : applied) {
            if (migration.getVersion() != null) {
                appliedVersions.add(migration.getVersion().getVersion());
            }
        }
        assertThat(applied).isNotEmpty();

        // classpath 上声明的每个迁移版本都必须已 applied
        List<String> classpathVersions = listClasspathMigrationVersions();
        assertThat(classpathVersions)
                .as("classpath:db/migration 下必须至少解析到一个迁移脚本")
                .isNotEmpty();
        assertThat(appliedVersions)
                .as("Flyway 已应用的迁移必须覆盖 classpath 上全部版本")
                .containsAll(classpathVersions);

        // 不允许存在未应用的 pending 迁移
        assertThat(flyway.info().pending())
                .as("不允许存在 pending 迁移")
                .isEmpty();
    }

    private static final Pattern VERSION_PATTERN =
            Pattern.compile("^V(\\d+(?:\\.\\d+)+)__");

    /** 从 classpath 的 db/migration 目录解析全部迁移版本号（形如 V1.0.0__init_schema.sql） */
    private static List<String> listClasspathMigrationVersions() throws IOException {
        ClassLoader cl = AdminBootApplicationSmokeTest.class.getClassLoader();
        URI dir = URI.create(cl.getResource("db/migration").toString());
        // surefire 下 classes 目录在文件系统上，直接目录遍历
        try (Stream<Path> files = Files.list(Path.of(dir))) {
            return files
                    .map(p -> p.getFileName().toString())
                    .filter(name -> name.endsWith(".sql"))
                    .map(name -> {
                        Matcher m = VERSION_PATTERN.matcher(name);
                        return m.find() ? m.group(1) : null;
                    })
                    .filter(v -> v != null)
                    .toList();
        }
    }
}
