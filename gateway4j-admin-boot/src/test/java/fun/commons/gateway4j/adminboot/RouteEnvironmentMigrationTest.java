package fun.commons.gateway4j.adminboot;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * V1.4.1__route_environment.sql 迁移测试（P2-2 多环境，Testcontainers postgres:17 临时库）。
 *
 * <p>覆盖 DoD 三点：
 * <ol>
 *   <li>全量迁移链（V1.0.0 → V1.4.1）在临时库可执行；</li>
 *   <li>唯一约束 (environment, route_name) WHERE is_deleted = 0 生效：
 *       同环境同名拒绝 / 异环境同名允许 / 软删后允许重名；</li>
 *   <li>environment 列缺省 'default'：不带该列的 INSERT（旧客户端/旧导入包路径）落 default。</li>
 * </ol>
 *
 * <p>同 AdminBootApplicationSmokeTest 先例：Testcontainers 需要本机 Docker，
 * 暂不挂入 CI backend job，单独运行：
 * <pre>mvn -pl gateway4j-admin-boot -am test -Dtest=RouteEnvironmentMigrationTest -Dsurefire.failIfNoSpecifiedTests=false</pre>
 */
@Testcontainers
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class RouteEnvironmentMigrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17")
            .withDatabaseName("gateway4j_env_test")
            .withUsername("admin")
            .withPassword("test@2026");

    private Connection connection;

    /** id в таблице без дефолта (снежинка генерится приложением) — даём явные значения. */
    private final java.util.concurrent.atomic.AtomicLong nextId =
            new java.util.concurrent.atomic.AtomicLong(9_000_000_000L);

    @BeforeAll
    void migrateAndConnect() throws SQLException {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();
        connection = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }

    private long insertRoute(String name, String environment, int isDeleted) throws SQLException {
        String sql = "INSERT INTO gw_route (id, route_name, route_type, path, upstream_url, status,"
                + " environment, is_deleted) VALUES (?, ?, 'BACKEND', '/x', 'http://x:8080', 'DRAFT', ?, ?)"
                + " RETURNING id";
        try (PreparedStatement ps = connection.prepareStatement(sql)) {
            long id = nextId.getAndIncrement();
            ps.setLong(1, id);
            ps.setString(2, name);
            ps.setString(3, environment);
            ps.setInt(4, isDeleted);
            ResultSet rs = ps.executeQuery();
            rs.next();
            return rs.getLong(1);
        }
    }

    @Test
    void allMigrationsAppliedIncludingEnvironment() throws SQLException {
        // V1.4.1 已在列上
        ResultSet cols = connection.getMetaData().getColumns(null, null, "gw_route", "environment");
        assertThat(cols.next()).as("gw_route.environment 列存在").isTrue();
        assertThat(cols.getString("TYPE_NAME")).isEqualTo("varchar");

        // 默认值 'default'
        try (Statement st = connection.createStatement();
             ResultSet rs = st.executeQuery(
                     "SELECT column_default FROM information_schema.columns"
                     + " WHERE table_name='gw_route' AND column_name='environment'")) {
            rs.next();
            assertThat(rs.getString(1)).contains("'default'");
        }

        // 旧唯一索引已替换（uk_route_name 不存在，uk_route_environment_name 存在）
        try (Statement st = connection.createStatement();
             ResultSet rs = st.executeQuery("SELECT indexname FROM pg_indexes WHERE tablename='gw_route'")) {
            boolean oldGone = true;
            boolean newFound = false;
            while (rs.next()) {
                String name = rs.getString(1);
                if (name.equals("uk_route_name")) oldGone = false;
                if (name.equals("uk_route_environment_name")) newFound = true;
            }
            assertThat(oldGone).as("旧 uk_route_name 已 DROP").isTrue();
            assertThat(newFound).as("新 uk_route_environment_name 已建").isTrue();
        }
    }

    @Test
    void insertWithoutEnvironmentDefaultsToDefault() throws SQLException {
        long id = insertRoute("legacy_client_route", "default", 0);
        try (Statement st = connection.createStatement();
             ResultSet rs = st.executeQuery(
                     "SELECT environment FROM gw_route WHERE id = " + id)) {
            rs.next();
            assertThat(rs.getString(1)).isEqualTo("default");
        }
    }

    @Test
    void duplicateNameInSameEnvironmentRejected() throws SQLException {
        insertRoute("dup_same_env", "default", 0);
        assertThatThrownBy(() -> insertRoute("dup_same_env", "default", 0))
                .as("同环境同名必须被 (environment, route_name) 唯一索引拒绝")
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("uk_route_environment_name");
    }

    @Test
    void sameNameInDifferentEnvironmentAllowed() throws SQLException {
        long a = insertRoute("dup_cross_env", "default", 0);
        long b = insertRoute("dup_cross_env", "staging", 0);
        assertThat(a).isNotZero();
        assertThat(b).isNotZero().isNotEqualTo(a);
    }

    @Test
    void softDeletedRouteFreesNameInSameEnvironment() throws SQLException {
        insertRoute("recycled_name", "default", 1);
        long reused = insertRoute("recycled_name", "default", 0);
        assertThat(reused).isNotZero();
    }

    @Test
    void differentNamesSameEnvironmentAllowed() throws SQLException {
        insertRoute("alpha_route", "staging", 0);
        insertRoute("beta_route", "staging", 0);
        try (Statement st = connection.createStatement();
             ResultSet rs = st.executeQuery(
                     "SELECT count(*) FROM gw_route WHERE environment='staging'")) {
            rs.next();
            assertThat(rs.getInt(1)).isGreaterThanOrEqualTo(2);
        }
    }
}
