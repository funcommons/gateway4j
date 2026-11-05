package fun.commons.gateway4j.common.constant;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * S11a 影子转发跨 JVM 契约（docs/ui-v2/实施契约.md S11 裁决细则①）。
 *
 * <p>admin 侧 DebugReplayService 以 {@code X-Gw4j-Shadow} 头携带共享口令
 * （{@code gateway4j.debug.shadow-token}）转发到网关；引擎侧
 * PluginExecutionFilter 读同名头判定影子请求，并以 exchange attr 供下游
 * 插件（MetricsPlugin 早退、PluginExecutionStats 守卫）读取。头名与 attr
 * 键是跨模块字面量契约，改名即静默断链，这里逐字锁定。</p>
 *
 * <p><b>测试先行</b>：常量尚未加入 {@link GatewayConstants} 时本文件使
 * common 测试编译失败——预期 RED，C-agent 按本文件补两个常量。</p>
 */
class GatewayConstantsShadowContractTest {

    /** 影子请求头名（admin 写、引擎读），逐字固定。 */
    @Test
    void shadowHeaderNameIsVerbatim() {
        assertEquals("X-Gw4j-Shadow", GatewayConstants.SHADOW_HEADER);
    }

    /** 影子 exchange attr 键 = "gw4j:shadow"，沿用 PLUGIN_CONTEXT_PREFIX 命名。 */
    @Test
    void shadowAttrKeyIsVerbatimAndPrefixed() {
        assertEquals("gw4j:shadow", GatewayConstants.SHADOW_KEY);
        assertTrue(GatewayConstants.SHADOW_KEY.startsWith(GatewayConstants.PLUGIN_CONTEXT_PREFIX),
                "attr 键必须带 gw4j: 前缀（与其余 *_KEY 一致）");
    }
}
