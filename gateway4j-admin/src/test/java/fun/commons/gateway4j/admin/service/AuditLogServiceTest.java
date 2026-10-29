package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import fun.commons.gateway4j.admin.mapper.AuditLogMapper;
import fun.commons.gateway4j.admin.model.AuditLog;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * P2-6 变更记录升级单测：时间边界解析 + 分页查询委托。
 */
@ExtendWith(MockitoExtension.class)
class AuditLogServiceTest {

    @Mock private AuditLogMapper auditLogMapper;

    private AuditLogService service;

    @BeforeEach
    void setUp() throws Exception {
        service = new AuditLogService();
        Field field = findField(service.getClass(), "baseMapper");
        field.setAccessible(true);
        field.set(service, auditLogMapper);
    }

    private Field findField(Class<?> clazz, String name) {
        for (Class<?> c = clazz; c != null; c = c.getSuperclass()) {
            try { return c.getDeclaredField(name); } catch (NoSuchFieldException e) { /* continue */ }
        }
        throw new RuntimeException("Field not found: " + name);
    }

    @Test
    void parseTimeBoundDateOnlySpansWholeDay() {
        OffsetDateTime from = AuditLogService.parseTimeBound("2026-10-29", false);
        OffsetDateTime to = AuditLogService.parseTimeBound("2026-10-29", true);
        assertEquals(LocalDate.of(2026, 10, 29).atStartOfDay(ZoneId.systemDefault()).toOffsetDateTime(), from);
        assertEquals(23, to.getHour());
        assertEquals(59, to.getMinute());
        assertTrue(to.isAfter(from));
    }

    @Test
    void parseTimeBoundAcceptsIso8601() {
        OffsetDateTime parsed = AuditLogService.parseTimeBound("2026-10-29T08:30:00+08:00", false);
        assertEquals(8, parsed.getHour());
    }

    @Test
    void parseTimeBoundNullAndBlankAreNull() {
        assertNull(AuditLogService.parseTimeBound(null, false));
        assertNull(AuditLogService.parseTimeBound("  ", true));
    }

    @Test
    void parseTimeBoundGarbageThrows() {
        assertThrows(IllegalArgumentException.class,
                () -> AuditLogService.parseTimeBound("not-a-time", false));
    }

    @Test
    void listLogsDelegatesPagedQuery() {
        Page<AuditLog> page = new Page<>(1, 20);
        page.setRecords(List.of(AuditLog.builder().id(7L).action("CREATE_ROUTE")
                .actor("admin").result("SUCCESS").build()));
        page.setTotal(1);
        when(auditLogMapper.selectPage(any(Page.class), any(LambdaQueryWrapper.class))).thenReturn(page);

        Page<AuditLog> result = service.listLogs(1, 20, "CREATE_ROUTE", "admin", "42",
                AuditLogService.parseTimeBound("2026-10-01", false),
                AuditLogService.parseTimeBound("2026-10-29", true));

        assertEquals(1, result.getRecords().size());
        assertEquals(1, result.getTotal());
        assertEquals("CREATE_ROUTE", result.getRecords().get(0).getAction());
    }

    @Test
    void listLogsCapsPageSizeAt100() {
        when(auditLogMapper.selectPage(any(Page.class), any(LambdaQueryWrapper.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        Page<AuditLog> result = service.listLogs(1, 500, null, null, null, null, null);

        assertEquals(100, result.getSize(), "pageSize 护栏与全站一致（≤100）");
    }
}
