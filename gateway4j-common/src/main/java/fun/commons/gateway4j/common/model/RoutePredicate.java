package fun.commons.gateway4j.common.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

/**
 * 路由级 SCG 原生谓词（S12-1）。
 *
 * <p>每条路由可挂若干条 SCG 原生 shortcut 定义串（{@link #definition}），引擎注册
 * 路由时用 SCG 自己的 {@code RoutePredicateFactory} 绑定，并与既有 Path 谓词
 * AND 组合 → 谓词语义由构造保证与 Spring Cloud Gateway 100% 对齐。</p>
 *
 * <p>定义串示例：{@code Host=**.example.com}、{@code Method=GET,POST}、
 * {@code Cookie=session,^v1$}、{@code RemoteAddr=10.0.0.0/8}、
 * {@code After=2026-01-01T00:00:00+08:00}。</p>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("gw_route_predicate")
public class RoutePredicate {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 所属路由（gw_route.id）。 */
    private Long routeId;

    /** SCG 原生 shortcut 定义串，如 {@code Host=**.example.com}。 */
    private String definition;

    /** 同一路由内多条谓词的排序号。 */
    @Builder.Default
    private Integer sortOrder = 0;

    private OffsetDateTime createdAt;

    private OffsetDateTime updatedAt;

    @TableLogic
    private Integer isDeleted;
}
