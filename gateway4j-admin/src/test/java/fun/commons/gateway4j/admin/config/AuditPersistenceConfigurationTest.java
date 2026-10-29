package fun.commons.gateway4j.admin.config;

import fun.commons.framework4j.audit.config.AuditProperties;
import fun.commons.framework4j.audit.service.AuditSink;
import fun.commons.framework4j.audit.service.InMemoryAuditSink;
import fun.commons.framework4j.audit.service.JdbcAuditSink;
import fun.commons.framework4j.datasource.manager.MultiDataSourceManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuditPersistenceConfigurationTest {

    @Mock private ObjectProvider<MultiDataSourceManager> managerProvider;
    @Mock private MultiDataSourceManager dataSourceManager;
    @Mock private DataSource dataSource;
    @Mock private JdbcTemplate jdbcTemplate;

    private AuditPersistenceConfiguration configuration = new AuditPersistenceConfiguration();

    private AuditProperties properties() {
        AuditProperties properties = new AuditProperties();
        properties.setTableName("audit_log");
        return properties;
    }

    /** 数据源在（生产 admin-boot）→ JdbcAuditSink（审计落 DB）。 */
    @Test
    void auditSinkUsesJdbcSinkWhenManagerAvailable() {
        when(managerProvider.getIfAvailable()).thenReturn(dataSourceManager);
        when(dataSourceManager.getDefaultDataSource()).thenReturn(dataSource);

        AuditSink sink = configuration.auditSink(managerProvider, properties());

        assertInstanceOf(JdbcAuditSink.class, sink);
    }

    /** 数据源缺失（单测场景）→ 显性回落 InMemoryAuditSink，不抛异常。 */
    @Test
    void auditSinkFallsBackToInMemoryWhenManagerMissing() {
        when(managerProvider.getIfAvailable()).thenReturn(null);

        AuditSink sink = configuration.auditSink(managerProvider, properties());

        assertInstanceOf(InMemoryAuditSink.class, sink);
    }

    /** 探针成功：INSERT + DELETE 各一次，返回 true。 */
    @Test
    void probeInsertsThenCleansUpAndReturnsTrue() {
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        AuditPersistenceConfiguration.AuditStartupProbe probe =
                new AuditPersistenceConfiguration.AuditStartupProbe(jdbcTemplate, "audit_log");

        boolean ok = assertDoesNotThrow(probe::probe);

        assertTrue(ok);
        verify(jdbcTemplate).update(contains("INSERT INTO audit_log"), eq("AUDIT_STARTUP_PROBE"));
        verify(jdbcTemplate).update(contains("DELETE FROM audit_log"), eq("AUDIT_STARTUP_PROBE"));
    }

    /** 探针失败（表缺失/库不可写）→ 返回 false 且不阻断启动，异常不外抛。 */
    @Test
    void probeFailureReturnsFalseWithoutThrowing() {
        when(jdbcTemplate.update(anyString(), any(Object[].class)))
                .thenThrow(new DataAccessResourceFailureException("relation \"audit_log\" does not exist"));
        AuditPersistenceConfiguration.AuditStartupProbe probe =
                new AuditPersistenceConfiguration.AuditStartupProbe(jdbcTemplate, "audit_log");

        boolean ok = assertDoesNotThrow(probe::probe);

        assertFalse(ok);
    }

    /** 数据源未装配 → 显性 false（启动日志 ERROR 路径）。 */
    @Test
    void probeWithoutDataSourceReturnsFalse() {
        AuditPersistenceConfiguration.AuditStartupProbe probe =
                new AuditPersistenceConfiguration.AuditStartupProbe((JdbcTemplate) null, "audit_log");

        assertFalse(probe.probe());
    }
}
