package fun.commons.gateway4j.admin.service;

import fun.commons.framework4j.api.ApiCode;
import fun.commons.framework4j.web.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class DictServiceTest {

    private DictService dictService;

    @BeforeEach
    void setUp() {
        dictService = new DictService(new BuiltinPluginTypeRegistry());
    }

    @Test
    void getDictRouteType() {
        List<Map<String, String>> result = dictService.getDict("ROUTE_TYPE");
        assertEquals(2, result.size());
        assertEquals("DISPATCH", result.get(0).get("value"));
        assertEquals("分发路由", result.get(0).get("label"));
    }

    @Test
    void getDictRouteStatus() {
        List<Map<String, String>> result = dictService.getDict("ROUTE_STATUS");
        assertEquals(4, result.size());
    }

    @Test
    void getDictCondOperator() {
        List<Map<String, String>> result = dictService.getDict("COND_OPERATOR");
        assertEquals(7, result.size());
    }

    /** T4（H5a 遗留）：WEIGHT 收录进 COND_TYPE 字典并带中文标签（不再回落枚举码）。 */
    @Test
    void getDictCondTypeIncludesWeightWithLabel() {
        List<Map<String, String>> result = dictService.getDict("COND_TYPE");
        assertEquals(6, result.size(), "ConditionType 6 值全收录");
        Map<String, String> weight = result.stream()
                .filter(m -> "WEIGHT".equals(m.get("value")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("COND_TYPE 字典缺 WEIGHT"));
        assertEquals("权重分流", weight.get("label"));
        // 既有 5 值标签不受影响
        assertEquals("请求头条件", result.get(0).get("label"));
    }

    @Test
    void getDictBuiltinPlugin() {
        List<Map<String, String>> result = dictService.getDict("BUILTIN_PLUGIN");
        assertTrue(result.size() >= 20);
        assertTrue(result.stream().anyMatch(m -> "jwt".equals(m.get("value"))));
    }

    @Test
    void getDictUnknownThrows() {
        // D10：未知字典 → 语义化 404 资源不存在码，而非 500 系统繁忙
        ApiException e = assertThrows(ApiException.class, () -> dictService.getDict("NOPE"));
        assertEquals(ApiCode.NOT_FOUND.getCode(), e.getCode());
        assertTrue(e.getMessage().contains("未知字典"));
    }
}
