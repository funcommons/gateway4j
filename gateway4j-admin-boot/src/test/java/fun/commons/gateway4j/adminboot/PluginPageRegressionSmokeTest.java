package fun.commons.gateway4j.adminboot;

import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.InnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import fun.commons.gateway4j.admin.service.PluginService;
import fun.commons.gateway4j.common.model.Plugin;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * P3-f 分页回归冒烟钉（真库真链路，锚定 fix 1399d99 不回退）。
 *
 * <p>背景：FW 升级时 MybatisPlusInterceptor 曾被双注册——framework4j 自装配
 * （SqlSessionFactory.setPlugins）+ admin-boot 兜底 applier
 * （{@code AdminAutoConfiguration#mybatisPlusInterceptorApplier}）无条件补插，
 * 而 MyBatis InterceptorChain 无去重，PaginationInnerInterceptor 因此挂两份，
 * Page 查询被追加两个 LIMIT（LIMIT ? LIMIT ?）→ PG syntax error → 10001
 * 数据库操作异常。修复 = applier 按 {@code getInterceptors().contains(interceptor)}
 * 判等幂等补插（链上已有则跳过，老版本框架未装配时仍兜底生效）。
 *
 * <p>为什么必须是真库真链路：既有单测全是 mapper-mock 型，SqlSessionFactory 是
 * mock/替换件，拦截器挂几份根本测不出——只有真 SqlSessionFactory + 真 PG 才会让
 * 双 LIMIT 以语法错误的形态炸出来。因此本类起完整 Spring 容器（含 framework4j
 * 多数据源装配 + 兜底 applier）+ Testcontainers postgres:17，分页走
 * PluginService.listPlugins 全链路，不 mock 任何 mapper。
 *
 * <p>钉两件事：
 * <ol>
 *   <li><b>行为钉</b>：种子 3 行 gw_plugin 后 {@code listPlugins(page=1, size=2)}
 *       必须返回恰 2 行、total=3——若拦截器再次双注册，此查询因双 LIMIT 语法
 *       错误直接抛异常 = 红；若拦截器漏挂（老坑反向：total 恒 0、不分页），
 *       records/total 断言同样 = 红；</li>
 *   <li><b>机制钉</b>：读 {@code SqlSessionFactory.getConfiguration()
 *       .getInterceptors()}，MybatisPlusInterceptor 在 InterceptorChain 上
 *       恰注册一次（且即 Spring 容器里那颗 bean），其内层链上
 *       PaginationInnerInterceptor 恰挂一份——直接钉双重注册本身，比 SQL
 *       断言更精准。</li>
 * </ol>
 *
 * <p>同 AdminBootApplicationSmokeTest 先例：Testcontainers 需要本机 Docker，
 * 暂未挂入 ci.yml，单独运行：
 * <pre>mvn -pl gateway4j-admin-boot -am test -Dtest=PluginPageRegressionSmokeTest -Dsurefire.failIfNoSpecifiedTests=false</pre>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class PluginPageRegressionSmokeTest {

    /** 种子行标识前缀：keyword 按它过滤，与迁移种子行（security/cache/…）完全隔离，total 才可断言。 */
    private static final String MARKER = "p3f-limit-pin";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17")
            .withDatabaseName("gateway4j_page_pin")
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

    @Autowired
    PluginService pluginService;

    @Autowired
    SqlSessionFactory sqlSessionFactory;

    @Autowired
    MybatisPlusInterceptor mybatisPlusInterceptor;

    /**
     * 行为钉：真 SqlSessionFactory + 真 PG 上的分页查询。
     * 双注册 → LIMIT ? LIMIT ? → PSQLException syntax error，本用例直接红；
     * 漏挂 → 不分页且 total 恒 0，records/total 断言同样红。
     */
    @Test
    void pageQueryReturnsExactlyOneLimitSliceAndCorrectTotal() {
        seedMarkerPlugins(3);

        Page<Plugin> page1 = pluginService.listPlugins(1, 2, null, null, null, null, MARKER);
        assertThat(page1.getTotal())
                .as("keyword=%s 过滤后 total 必须等于种子行数（total 恒 0 = 拦截器漏挂）", MARKER)
                .isEqualTo(3L);
        assertThat(page1.getRecords())
                .as("page=1&size=2 必须恰返回 2 行（不分页 = 拦截器漏挂，双 LIMIT = 双注册）")
                .hasSize(2);
        assertThat(page1.getRecords().stream().map(Plugin::getPluginId).toList())
                .as("第 1 页应为 sort_order 升序前两行")
                .containsExactly(MARKER + "-1", MARKER + "-2");

        Page<Plugin> page2 = pluginService.listPlugins(2, 2, null, null, null, null, MARKER);
        assertThat(page2.getTotal())
                .as("翻页后 total 仍须正确")
                .isEqualTo(3L);
        assertThat(page2.getRecords().stream().map(Plugin::getPluginId).toList())
                .as("第 2 页恰剩第 3 行")
                .containsExactly(MARKER + "-3");
    }

    /**
     * 机制钉：直接断言 InterceptorChain 上 MybatisPlusInterceptor 恰一份。
     * 若再有人加无条件 addInterceptor 兜底，这条比 SQL 断言更早、更准地红。
     */
    @Test
    void mybatisPlusInterceptorRegisteredExactlyOnceInInterceptorChain() {
        List<Interceptor> chain = sqlSessionFactory.getConfiguration().getInterceptors();
        List<MybatisPlusInterceptor> mpInterceptors = chain.stream()
                .filter(MybatisPlusInterceptor.class::isInstance)
                .map(MybatisPlusInterceptor.class::cast)
                .toList();
        assertThat(mpInterceptors)
                .as("InterceptorChain 上 MybatisPlusInterceptor 必须恰注册一次"
                        + "（挂两份 = Page 查询被追加两个 LIMIT → PG syntax error）")
                .hasSize(1);
        assertThat(mpInterceptors)
                .as("链上那颗必须是 Spring 容器里的同一实例（framework4j 自装配 + "
                        + "AdminAutoConfiguration contains 幂等补插的装配契约）")
                .contains(mybatisPlusInterceptor);

        List<InnerInterceptor> inners = mybatisPlusInterceptor.getInterceptors();
        long paginationCount = inners.stream()
                .filter(PaginationInnerInterceptor.class::isInstance)
                .count();
        assertThat(paginationCount)
                .as("内层链上 PaginationInnerInterceptor（实际追加 LIMIT 的那颗）必须恰挂一份")
                .isEqualTo(1L);
    }

    /** 种子 N 行带 MARKER 标识的 gw_plugin（走 PluginService.save 真链路落库）。 */
    private void seedMarkerPlugins(int count) {
        for (int i = 1; i <= count; i++) {
            Plugin plugin = Plugin.builder()
                    .pluginId(MARKER + "-" + i)
                    .pluginName("分页回归钉插件 " + i)
                    .pluginType("BUILTIN")
                    .pluginPhase("PRE")
                    .scope("ROUTE")
                    .status("DISABLED")
                    .sortOrder(i)
                    .config("{}")
                    .remark("P3-f 分页回归冒烟钉种子行（plugin_id 带 " + MARKER + " 标识）")
                    .build();
            assertThat(pluginService.save(plugin))
                    .as("种子行 %s-%d 落库成功", MARKER, i)
                    .isTrue();
        }
    }
}
