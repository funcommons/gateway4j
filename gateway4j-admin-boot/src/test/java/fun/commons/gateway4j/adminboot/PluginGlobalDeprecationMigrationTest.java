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

/**
 * V1.5.1__deprecate_plugin_global_permission.sql 迁移测试（P4f-D 拆旧清理，
 * Testcontainers postgres:17 临时库）。
 *
 * <p>覆盖语义：
 * <ol>
 *   <li>全量迁移链（V1.0.0 → V1.5.1）在临时库可执行；</li>
 *   <li>gw_permission 中 plugin:global 已删除，且删除范围恰好限定该码
 *       （plugin:read / plugin:edit / plugin:upload-jar 姊妹码完好）；</li>
 *   <li>gw_role_permission_rel 中 plugin:global 授权已回收——非空验证：
 *       V1.1.0 曾将全量权限授予 ROLE_ADMIN，若关联清理缺失则此处必然残留；</li>
 *   <li>幸存权限码的授权不受影响（ROLE_ADMIN 仍持有 plugin:read）。</li>
 * </ol>
 *
 * <p>同 RouteEnvironmentMigrationTest 先例：Testcontainers 需要本机 Docker，
 * 暂不挂入 CI backend job，单独运行：
 * <pre>mvn -pl gateway4j-admin-boot -am test -Dtest=PluginGlobalDeprecationMigrationTest -Dsurefire.failIfNoSpecifiedTests=false</pre>
 */
@Testcontainers
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PluginGlobalDeprecationMigrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17")
            .withDatabaseName("gateway4j_perm_test")
            .withUsername("admin")
            .withPassword("test@2026");

    private Connection connection;

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

    private int count(String sql) throws SQLException {
        try (Statement st = connection.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getInt(1);
        }
    }

    private boolean exists(String sql) throws SQLException {
        return count(sql) > 0;
    }

    @Test
    void pluginGlobalAbsentFromPermissionDictionary() throws SQLException {
        assertThat(count("SELECT count(*) FROM gw_permission WHERE permission_code = 'plugin:global'"))
                .as("gw_permission 中 plugin:global 种子行已删除")
                .isZero();
    }

    @Test
    void pluginGlobalGrantsRecycledFromAllRoles() throws SQLException {
        // V1.1.0 曾 INSERT SELECT 全量权限授予 ROLE_ADMIN（含 plugin:global），
        // 本断言非空转：若迁移缺第 1 步关联清理，此处必残留
        assertThat(count("SELECT count(*) FROM gw_role_permission_rel WHERE permission_code = 'plugin:global'"))
                .as("gw_role_permission_rel 中 plugin:global 授权已回收")
                .isZero();
    }

    @Test
    void deletionScopedExactlyToPluginGlobal() throws SQLException {
        assertThat(count("SELECT count(*) FROM gw_permission WHERE permission_code LIKE 'plugin:%'"))
                .as("plugin:* 姊妹码恰好剩 3 个（read/edit/upload-jar）")
                .isEqualTo(3);
        assertThat(exists("SELECT 1 FROM gw_permission WHERE permission_code = 'plugin:read'"))
                .as("plugin:read 完好").isTrue();
        assertThat(exists("SELECT 1 FROM gw_permission WHERE permission_code = 'plugin:edit'"))
                .as("plugin:edit 完好").isTrue();
        assertThat(exists("SELECT 1 FROM gw_permission WHERE permission_code = 'plugin:upload-jar'"))
                .as("plugin:upload-jar 完好").isTrue();
    }

    @Test
    void survivingGrantsUntouched() throws SQLException {
        assertThat(exists("SELECT 1 FROM gw_role_permission_rel"
                + " WHERE role_code = 'ROLE_ADMIN' AND permission_code = 'plugin:read'"))
                .as("幸存码的 ROLE_ADMIN 授权不受影响")
                .isTrue();
    }

    @Test
    void permissionDictionaryCountPinned() throws SQLException {
        // V1.0.0 种 11 + V1.2.1 补 6 − 废弃 1 = 16；后续迁移加码时同步更新本值
        assertThat(count("SELECT count(*) FROM gw_permission"))
                .as("权限词表总数 = 16")
                .isEqualTo(16);
    }
}
