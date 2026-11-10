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
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * V1.5.2__audit_log_timestamptz_fix.sql 迁移测试（S11 时区债票 F，
 * Testcontainers postgres:17 临时库）。
 *
 * <p>缺陷背景（契约 S11 实测）：V1.4.0 将 audit_log."timestamp"/created_at 建成
 * TIMESTAMP（无时区），+08 会话下 sink 写入与列缺省 CURRENT_TIMESTAMP 均截存
 * 本地挂钟（16:19:08），读侧按 UTC 解释 → 全站审计时间显示 +8h；同事件
 * gw_route_version.published_at（TIMESTAMPTZ）正确存 08:19:08+00。</p>
 *
 * <p>覆盖语义：
 * <ol>
 *   <li>存量订正：V1.5.1 缺陷形态种子行（naive 16:19:08 = +08 挂钟）经
 *       V1.5.2 订正后读回 UTC 绝对时刻 08:19:08Z（"timestamp" 与 created_at 两列）；</li>
 *   <li>双表对照：同事件 audit_log.created_at 与 gw_route_version.published_at
 *       时差为 0（修复目标的本义）；</li>
 *   <li>防二次偏移：迁移后新行走 sink 同款 setTimestamp 写入 + created_at 列缺省，
 *       在复刻缺陷的 +08 会话时区下时刻不得偏移；</li>
 *   <li>列类型钉住：两列 data_type = timestamp with time zone（防回归再建 TIMESTAMP）。</li>
 * </ol>
 *
 * <p>同 PluginGlobalDeprecationMigrationTest 先例：分段 Flyway（先 target 1.5.1
 * 种缺陷行再放行到最新）；Testcontainers 需要本机 Docker，暂不挂入 CI backend
 * job，单独运行：
 * <pre>mvn -pl gateway4j-admin-boot -am test -Dtest=AuditLogTimezoneMigrationTest -Dsurefire.failIfNoSpecifiedTests=false</pre>
 */
@Testcontainers
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AuditLogTimezoneMigrationTest {

    /** 缺陷事件时刻（契约 S11 样本）：本地 +08 16:19:08 = UTC 08:19:08。 */
    private static final Instant EVENT_AT_UTC = Instant.parse("2026-11-10T08:19:08Z");

    /** 缺陷形态存量行的挂钟字面量（+08 本地时间误存 naive TIMESTAMP）。 */
    private static final String EVENT_NAIVE_PLUS8 = "2026-11-10 16:19:08";

    private static final String BUG_ROW_HASH = "seed-bug-form-hash";
    private static final String POST_MIGRATION_ROW_HASH = "seed-post-migration-hash";
    private static final long SEED_ROUTE_ID = 990001L;

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17")
            .withDatabaseName("gateway4j_audit_tz_test")
            .withUsername("admin")
            .withPassword("test@2026");

    private Connection connection;

    @BeforeAll
    void migrateSeedBugRowsThenMigrateToLatest() throws SQLException {
        // 分段迁移：停在 V1.5.1（缺陷形态库）→ 种 bug 行 + 对照行 → 放行 V1.5.2 订正
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .target("1.5.1")
                .load()
                .migrate();
        connection = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        seedBugFormRows();
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();
    }

    /**
     * V1.5.1 缺陷形态种子：audit_log 挂钟 naive 字面量（sink 写入/列缺省在
     * +08 会话下截存的最终形态，与写入机制无关地钉住存量行形态）；
     * gw_route_version 同事件正确形态（TIMESTAMPTZ 绝对时刻）作双表对照。
     */
    private void seedBugFormRows() throws SQLException {
        try (Statement st = connection.createStatement()) {
            st.execute("INSERT INTO audit_log (action, actor, result, hash, \"timestamp\", created_at) VALUES ("
                    + "'PUBLISH_ROUTE', 'tester', 'SUCCESS', '" + BUG_ROW_HASH + "', "
                    + "'" + EVENT_NAIVE_PLUS8 + "', '" + EVENT_NAIVE_PLUS8 + "')");
            st.execute("INSERT INTO gw_route_version (route_id, config_version, change_type,"
                    + " snapshot_data, actor, published_at) VALUES ("
                    + SEED_ROUTE_ID + ", 1, 'PUBLISH', '{}'::jsonb, 'tester',"
                    + " '" + EVENT_AT_UTC + "')");
        }
    }

    private int count(String sql) throws SQLException {
        try (Statement st = connection.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getInt(1);
        }
    }

    private OffsetDateTime readAt(String sql) throws SQLException {
        try (Statement st = connection.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getObject(1, OffsetDateTime.class);
        }
    }

    @Test
    void auditCreatedAtCorrectedToUtcInstant() throws SQLException {
        assertThat(readAt("SELECT created_at FROM audit_log WHERE hash = '" + BUG_ROW_HASH + "'").toInstant())
                .as("audit_log.created_at 存量订正：+08 挂钟 16:19:08 → UTC 绝对时刻 08:19:08Z")
                .isEqualTo(EVENT_AT_UTC);
    }

    @Test
    void auditTimestampColumnCorrectedToUtcInstant() throws SQLException {
        assertThat(readAt("SELECT \"timestamp\" FROM audit_log WHERE hash = '" + BUG_ROW_HASH + "'").toInstant())
                .as("audit_log.\"timestamp\" 存量订正：+08 挂钟 16:19:08 → UTC 绝对时刻 08:19:08Z")
                .isEqualTo(EVENT_AT_UTC);
    }

    @Test
    void sameEventAcrossTwoTablesDiffersByZero() throws SQLException {
        OffsetDateTime auditCreated =
                readAt("SELECT created_at FROM audit_log WHERE hash = '" + BUG_ROW_HASH + "'");
        OffsetDateTime versionPublished = readAt(
                "SELECT published_at FROM gw_route_version WHERE route_id = " + SEED_ROUTE_ID
                        + " AND change_type = 'PUBLISH'");
        assertThat(Duration.between(auditCreated.toInstant(), versionPublished.toInstant()))
                .as("双表对照：同事件 audit_log.created_at 与 gw_route_version.published_at 时差为 0")
                .isZero();
    }

    @Test
    void columnsConvertedToTimestamptz() throws SQLException {
        assertThat(count("SELECT count(*) FROM information_schema.columns"
                + " WHERE table_name = 'audit_log'"
                + " AND column_name IN ('timestamp', 'created_at')"
                + " AND data_type = 'timestamp with time zone'"))
                .as("audit_log 两时间列均已转为 TIMESTAMPTZ（防回归）")
                .isEqualTo(2);
    }

    @Test
    void postMigrationWritesKeepInstantRegardlessOfSessionZone() throws SQLException {
        // 迁移后写路径防二次偏移：sink 同款 setTimestamp 写 "timestamp"、created_at 走列缺省，
        // 会话时区钉 Asia/Shanghai 复刻缺陷环境——TIMESTAMPTZ 下时刻必须不偏移
        try (Statement st = connection.createStatement()) {
            st.execute("SET TimeZone = 'Asia/Shanghai'");
        }
        Instant writeAt = Instant.parse("2026-11-10T09:30:00Z");
        try (PreparedStatement ps = connection.prepareStatement(
                "INSERT INTO audit_log (action, actor, result, hash, \"timestamp\")"
                        + " VALUES (?, ?, 'SUCCESS', ?, ?)")) {
            ps.setString(1, "AUDIT_TZ_PROBE");
            ps.setString(2, "tester");
            ps.setString(3, POST_MIGRATION_ROW_HASH);
            ps.setTimestamp(4, Timestamp.from(writeAt));
            ps.executeUpdate();
        }
        try (Statement st = connection.createStatement();
             ResultSet rs = st.executeQuery("SELECT \"timestamp\", created_at FROM audit_log"
                     + " WHERE hash = '" + POST_MIGRATION_ROW_HASH + "'")) {
            rs.next();
            assertThat(rs.getObject(1, OffsetDateTime.class).toInstant())
                    .as("迁移后 sink 写路径（java.sql.Timestamp → TIMESTAMPTZ）时刻不被会话时区偏移")
                    .isEqualTo(writeAt);
            assertThat(rs.getObject(2, OffsetDateTime.class).toInstant())
                    .as("迁移后 created_at 列缺省（CURRENT_TIMESTAMP）= 落库当时绝对时刻")
                    .isCloseTo(Instant.now(), within(60, ChronoUnit.SECONDS));
        }
    }
}
