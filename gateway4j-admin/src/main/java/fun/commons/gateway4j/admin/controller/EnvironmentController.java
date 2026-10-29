package fun.commons.gateway4j.admin.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import fun.commons.framework4j.accesstoken.annotation.RequiresToken;
import fun.commons.gateway4j.common.model.Route;
import fun.commons.gateway4j.admin.service.RouteService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * P2-2 多环境配套查询（给顶栏环境切换器）：环境标识清单。
 * <p>
 * 口径：gw_route distinct environment（逻辑删除行天然排除）+ 保证含
 * {@code default}（空库/单环境部署也要能选中默认环境）；排序 default 优先，
 * 其余字母序。本系统环境无独立表，出现过的路由环境即环境全集。
 */
@RestController
@RequestMapping("/v1/environments")
@RequiresToken("BEARER")
public class EnvironmentController {

    private final RouteService routeService;

    public EnvironmentController(RouteService routeService) {
        this.routeService = routeService;
    }

    @GetMapping
    public Map<String, Object> listEnvironments() {
        TreeSet<String> environments = new TreeSet<>();
        environments.add(Route.DEFAULT_ENVIRONMENT);
        List<Object> distinct = routeService.listObjs(
                new QueryWrapper<Route>().select("DISTINCT environment"));
        if (distinct != null) {
            for (Object value : distinct) {
                if (value != null && !value.toString().isBlank()) {
                    environments.add(value.toString());
                }
            }
        }
        List<String> sorted = new ArrayList<>();
        environments.remove(Route.DEFAULT_ENVIRONMENT);
        sorted.add(Route.DEFAULT_ENVIRONMENT);
        sorted.addAll(environments);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("environments", sorted);
        return result;
    }
}
