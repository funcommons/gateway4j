package fun.commons.gateway4j.admin.validation;

import fun.commons.gateway4j.admin.controller.RouteController.RouteCreateRequest;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * BACKEND 路由创建条件校验：path 必填、upstream_url 必填。
 * 通过 addPropertyNode 将违规挂到具体字段（异常处理器会转成 snake_case 字段名返回）。
 */
public class BackendRouteCreateValidator implements ConstraintValidator<ValidBackendRouteCreate, RouteCreateRequest> {

    @Override
    public boolean isValid(RouteCreateRequest request, ConstraintValidatorContext context) {
        if (request == null || !"BACKEND".equals(request.routeType())) {
            return true;
        }
        boolean valid = true;
        if (isBlank(request.path())) {
            report(context, "path", "后置路由 path 必填");
            valid = false;
        }
        if (isBlank(request.upstreamUrl())) {
            report(context, "upstreamUrl", "后置路由 upstream_url 必填");
            valid = false;
        }
        return valid;
    }

    private void report(ConstraintValidatorContext context, String property, String message) {
        context.disableDefaultConstraintViolation();
        context.buildConstraintViolationWithTemplate(message)
                .addPropertyNode(property)
                .addConstraintViolation();
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
