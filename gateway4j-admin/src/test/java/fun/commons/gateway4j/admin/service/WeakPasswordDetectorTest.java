package fun.commons.gateway4j.admin.service;

import fun.commons.gateway4j.admin.mapper.UserMapper;
import fun.commons.gateway4j.common.model.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * P2-9 首启弱口令检测单测（真实 BCryptPasswordEncoder，不 mock 编码器）。
 */
@ExtendWith(MockitoExtension.class)
class WeakPasswordDetectorTest {

    @Mock private UserMapper userMapper;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    @Test
    void seedHashOfAdmin123IsStale() {
        WeakPasswordDetector detector = new WeakPasswordDetector(userMapper);
        User user = User.builder().username("admin")
                .password(encoder.encode("admin123")).build();
        assertTrue(detector.isPasswordStale(user));
    }

    @Test
    void seedHashWith2yPrefixIsStale() {
        // V1.3.4 种子迁移写入的 $2y$ 前缀 hash（BCryptPasswordEncoder 同族兼容）
        WeakPasswordDetector detector = new WeakPasswordDetector(userMapper);
        User user = User.builder().username("admin")
                .password("$2y$10$QU2Ak2ITzyVjcBiGBM7ks.R6iNZshmePa8e2TETpKjJ.XHBAZJ8ym").build();
        assertTrue(detector.isPasswordStale(user));
    }

    @Test
    void changedPasswordIsNotStale() {
        WeakPasswordDetector detector = new WeakPasswordDetector(userMapper);
        User user = User.builder().username("admin")
                .password(encoder.encode("S3cure!2026")).build();
        assertFalse(detector.isPasswordStale(user));
    }

    @Test
    void nullOrBlankHashIsNotStale() {
        WeakPasswordDetector detector = new WeakPasswordDetector(userMapper);
        assertFalse(detector.isPasswordStale(null));
        assertFalse(detector.isPasswordStale(User.builder().username("x").build()));
        assertFalse(detector.isPasswordStale(User.builder().username("x").password("").build()));
    }

    @Test
    void malformedHashIsNotStaleAndDoesNotThrow() {
        WeakPasswordDetector detector = new WeakPasswordDetector(userMapper);
        assertFalse(detector.isPasswordStale(User.builder().username("x").password("not-bcrypt").build()));
    }

    @Test
    void startupDetectionSetsAdminFlag() {
        when(userMapper.selectOne(any())).thenReturn(User.builder().username("admin")
                .password(encoder.encode("admin123")).build());
        WeakPasswordDetector detector = new WeakPasswordDetector(userMapper);
        detector.run(null);
        assertTrue(detector.isAdminPasswordStale());
    }

    @Test
    void startupDetectionClearsFlagWhenChanged() {
        when(userMapper.selectOne(any())).thenReturn(User.builder().username("admin")
                .password(encoder.encode("S3cure!2026")).build());
        WeakPasswordDetector detector = new WeakPasswordDetector(userMapper);
        detector.run(null);
        assertFalse(detector.isAdminPasswordStale());
    }

    @Test
    void startupDetectionSwallowsDbFailure() {
        when(userMapper.selectOne(any())).thenThrow(new RuntimeException("db down"));
        WeakPasswordDetector detector = new WeakPasswordDetector(userMapper);
        assertDoesNotThrow(() -> detector.run(null));
        assertFalse(detector.isAdminPasswordStale());
    }

    @Test
    void startupDetectionSkipsWhenAdminMissing() {
        when(userMapper.selectOne(any())).thenReturn(null);
        WeakPasswordDetector detector = new WeakPasswordDetector(userMapper);
        assertDoesNotThrow(() -> detector.run(null));
        assertFalse(detector.isAdminPasswordStale());
    }
}
