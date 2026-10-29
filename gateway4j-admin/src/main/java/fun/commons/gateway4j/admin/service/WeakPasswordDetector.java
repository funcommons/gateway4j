package fun.commons.gateway4j.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import fun.commons.gateway4j.admin.mapper.UserMapper;
import fun.commons.gateway4j.common.model.User;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * 首启弱口令检测（P2-9）。
 *
 * <p><b>检测口径</b>：出厂种子用户（admin 等）的口令 hash 若仍等于
 * bcrypt({@link #SEED_WEAK_PASSWORD})（即 admin123，见 V1.3.4 种子修正迁移），
 * 视为「弱口令未改」。</p>
 *
 * <p><b>非阻断提示（申报的关键取舍）</b>：检测只产出 {@code password_stale} 布尔
 * 标志，随登录响应平铺返回，由前端展示改密横幅。<b>不强制改密、不拦截任何流程</b>——
 * 阻断式强制改密会破坏既有 e2e 回归（登录即 302 改密页）、也会把首次部署/
 * 自动化脚本的管理入口锁死，偏离「提示不阻断」的任务口径，故不做。</p>
 *
 * <p>启动即检（ApplicationRunner）：把 admin 用户状态写入内存标志，供运维侧
 * 日志/接口排查；登录时的逐用户检测走 {@link #isPasswordStale(User)}（实时按
 * hash 判断，改密后下一次登录即恢复 false）。</p>
 */
@Slf4j
@Service
public class WeakPasswordDetector implements ApplicationRunner {

    /** 出厂种子弱口令（V1.1.0/V1.3.4 种子迁移的 admin 初始口令）。 */
    public static final String SEED_WEAK_PASSWORD = "admin123";

    private final UserMapper userMapper;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    /** admin 用户弱口令标志（启动检测写入；DB 不可达时保持 false 并记 WARN）。 */
    private volatile boolean adminPasswordStale = false;

    public WeakPasswordDetector(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    @Override
    public void run(ApplicationArguments args) {
        detectAdminOnStartup();
    }

    /** 启动检测 admin 种子口令；任何异常吞掉（检测失败绝不阻断启动）。 */
    void detectAdminOnStartup() {
        try {
            User admin = userMapper.selectOne(new LambdaQueryWrapper<User>()
                    .eq(User::getUsername, "admin"));
            if (admin == null) {
                log.info("[弱口令检测] admin 用户不存在，跳过首启弱口令检测");
                return;
            }
            adminPasswordStale = isPasswordStale(admin);
            if (adminPasswordStale) {
                log.warn("[弱口令检测] admin 用户仍在使用出厂弱口令（{}）——请尽快修改！"
                        + "（提示不阻断：登录响应 password_stale=true，可用 "
                        + "POST /v1/users/{id}/reset-password 或 PATCH /v1/users/{id} 改密）",
                        SEED_WEAK_PASSWORD);
            } else {
                log.info("[弱口令检测] admin 用户口令已非出厂弱口令");
            }
        } catch (Exception e) {
            adminPasswordStale = false;
            log.warn("[弱口令检测] 首启检测失败（DB 不可达？），弱口令标志置 false: {}", e.getMessage());
        }
    }

    /**
     * 判定某用户口令是否仍为出厂弱口令（按 hash 比对，实时）。
     * 任何异常（用户/hash 为空等）一律返回 false——提示能力不反向阻断登录。
     */
    public boolean isPasswordStale(User user) {
        if (user == null || user.getPassword() == null || user.getPassword().isBlank()) {
            return false;
        }
        try {
            return passwordEncoder.matches(SEED_WEAK_PASSWORD, user.getPassword());
        } catch (IllegalArgumentException e) {
            // hash 非法（非 bcrypt 格式）：不算弱口令，也不抛出
            return false;
        }
    }

    /** admin 用户首启检测结果的内存标志。 */
    public boolean isAdminPasswordStale() {
        return adminPasswordStale;
    }
}
