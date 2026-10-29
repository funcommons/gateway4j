package fun.commons.gateway4j.adminboot;

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
 * <p>运行方式（需要本机 Docker）：
 * <pre>mvn -pl gateway4j-admin-boot -am test -Dtest=AdminBootApplicationSmokeTest -Dsurefire.failIfNoSpecifiedTests=false</pre>
 * 目前未挂入 ci.yml（backend job 只构建 gateway4j-admin -am，不编译 admin-boot），
 * 待 CI 上验证 Testcontainers 稳定后可单独加 job。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class AdminBootApplicationSmokeTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17")
            .withDatabaseName("gateway4j")
            .withUsername("admin")
            .withPassword("test@2026");

    @Container
    static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7")
            .withExposedPorts(6379);

    @DynamicPropertySource
    static void overrideFramework4jConnections(DynamicPropertyRegistry registry) {
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
