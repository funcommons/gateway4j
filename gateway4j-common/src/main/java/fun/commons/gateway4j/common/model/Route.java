package fun.commons.gateway4j.common.model;

import com.baomidou.mybatisplus.annotation.*;
import fun.commons.gateway4j.common.util.JsonbTypeHandler;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Data
@Builder(toBuilder = true)
@NoArgsConstructor
@AllArgsConstructor
@TableName("gw_route")
public class Route {

    /** P2-2 多环境：缺省环境标识（单环境部署全部路由均为该值，行为与多环境前一致）。 */
    public static final String DEFAULT_ENVIRONMENT = "default";

    /** P2-2 多环境：environment 白名单（与创建/更新请求的 @Pattern 口径一致）。 */
    public static final String ENVIRONMENT_PATTERN = "^[a-z0-9_-]{1,20}$";

    /**
     * P2-2 多环境：null/blank 归一为 default（存量行/旧包兼容口径）。
     * 注意：本 helper 必须放在 common——admin 树节点与 engine 装载共用，
     * admin 侧（无 spring-cloud-gateway classpath）不得引用 engine 的 ConfigService。
     */
    public static String environmentOr(String environment) {
        return environment == null || environment.isBlank() ? DEFAULT_ENVIRONMENT : environment;
    }

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    private String routeName;

    private String routeType;

    private String path;

    private String upstreamUrl;

    @Builder.Default
    private String status = "DRAFT";

    private Long parentRouteId;

    @Builder.Default
    private Integer sortOrder = 0;

    private String remark;

    @Builder.Default
    private String tags = "";

    /**
     * S12-7a：SCG {@code RouteDefinition.metadata}（{@code Map<String,Object>}）的
     * gateway4j 落点 —— JSONB 列（V1.7.1 起），实体持 JSON 字符串（写经
     * {@link JsonbTypeHandler}，读 PG JDBC getString 直出），引擎注册路由时解析成
     * {@code Map} 透传给 SCG {@code Route.metadata}（可被 SCG
     * {@code RouteLocator.matchMetadata} 消费）。
     */
    @Builder.Default
    @TableField(typeHandler = JsonbTypeHandler.class)
    private String metadata = "{}";

    /**
     * P2-2 多环境：环境标识（V1.4.1 起落库，缺省 {@link #DEFAULT_ENVIRONMENT}；
     * 唯一索引 (environment, route_name) WHERE is_deleted = 0 —— 同环境内同名即拒绝）。
     */
    @Builder.Default
    private String environment = Route.DEFAULT_ENVIRONMENT;

    @Builder.Default
    private Long configVersion = 0L;

    private OffsetDateTime createdAt;

    private OffsetDateTime updatedAt;

    @TableLogic
    private Integer isDeleted;
}
