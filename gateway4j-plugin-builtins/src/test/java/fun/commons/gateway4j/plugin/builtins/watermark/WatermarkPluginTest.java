package fun.commons.gateway4j.plugin.builtins.watermark;

import fun.commons.gateway4j.plugin.api.PluginConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class WatermarkPluginTest {

    private WatermarkPlugin plugin;

    @BeforeEach
    void setUp() {
        plugin = new WatermarkPlugin();
    }

    private void setConfig(WatermarkPluginConfig cfg) {
        plugin.onConfigChange(new PluginConfig("watermark",
                fun.commons.gateway4j.common.util.JsonUtils.toCompactJson(cfg), 1L));
    }

    @Test
    void inlineScriptContainsOrgAndStyle() {
        WatermarkPluginConfig cfg = new WatermarkPluginConfig();
        cfg.setOrg("名传");
        cfg.setColor("rgba(255,0,0,0.1)");
        cfg.setWidth(400);
        cfg.setHeight(200);
        cfg.setFontSize(28);
        cfg.setRotate(-30);
        setConfig(cfg);

        String script = plugin.buildScriptTag();
        assertTrue(script.contains("名传"));
        assertTrue(script.contains("rgba(255,0,0,0.1)"));
        assertTrue(script.contains("400"));
        assertTrue(script.contains("200"));
        assertTrue(script.contains("28"));
        assertTrue(script.contains("-30"));
        assertTrue(script.startsWith("<script>"));
        assertTrue(script.endsWith("</script>"));
    }

    @Test
    void externalScriptUrlGeneratesSrcTag() {
        WatermarkPluginConfig cfg = new WatermarkPluginConfig();
        cfg.setOrg("testorg");
        cfg.setScriptUrl("/static/watermark.js");
        setConfig(cfg);

        String script = plugin.buildScriptTag();
        assertTrue(script.contains("src='/static/watermark.js'"));
        assertTrue(script.contains("testorg"));
    }

    @Test
    void defaultConfigUsesDefaults() {
        setConfig(new WatermarkPluginConfig());
        String script = plugin.buildScriptTag();
        assertTrue(script.contains("企业"));
        assertTrue(script.contains("rgba(200, 128, 128, 0.10)"));
        assertTrue(script.contains("360"));
        assertTrue(script.contains("180"));
    }
}
