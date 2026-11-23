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
 * 路由级 SCG 原生 filter（S12-7a）。
 *
 * <p>每条路由可挂若干条 SCG 原生 shortcut 定义串（{@link #definition}），引擎注册
 * 路由时用 SCG 自己的 {@code GatewayFilterFactory} 绑定并挂到
 * {@code Route.gatewayFilters} 上 → filter 语义由构造保证与 Spring Cloud Gateway
 * 100% 对齐（SCG 自带约 30 个可无参构造的内置 filter 工厂）。</p>
 *
 * <p>定义串示例：{@code AddRequestHeader=X-Foo, bar}、{@code RewritePath=/red/(?<segment>.*), /$\{segment}}、
 * {@code StripPrefix=1}、{@code PreserveHostHeader}、{@code SetStatus=301}。</p>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("gw_route_filter")
public class RouteFilter {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 所属路由（gw_route.id）。 */
    private Long routeId;

    /** SCG 原生 shortcut 定义串，如 {@code AddRequestHeader=X-Foo, bar}。 */
    private String definition;

    /** 同一路由内多条 filter 的排序号（= SCG filters[] 的声明顺序）。 */
    @Builder.Default
    private Integer sortOrder = 0;

    private OffsetDateTime createdAt;

    private OffsetDateTime updatedAt;

    @TableLogic
    private Integer isDeleted;
}
