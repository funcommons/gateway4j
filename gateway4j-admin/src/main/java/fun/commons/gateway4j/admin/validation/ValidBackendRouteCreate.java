package fun.commons.gateway4j.admin.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 路由创建请求类级约束（D9）：route_type = BACKEND 时 path 与 upstream_url 必填；
 * DISPATCH 类型不校验这两项。
 */
@Documented
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = BackendRouteCreateValidator.class)
public @interface ValidBackendRouteCreate {

    String message() default "请求参数错误";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
