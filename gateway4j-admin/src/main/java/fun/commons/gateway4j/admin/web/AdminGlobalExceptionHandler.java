package fun.commons.gateway4j.admin.web;

import fun.commons.framework4j.accesstoken.exception.AuthException;
import fun.commons.framework4j.api.ApiCode;
import fun.commons.framework4j.web.ApiError;
import fun.commons.framework4j.web.ApiResponse;
import fun.commons.framework4j.web.exception.GlobalExceptionHandler;
import fun.commons.gateway4j.common.exception.BusinessException;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ElementKind;
import jakarta.validation.Path;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 管理后台统一异常处理。
 * <p>
 * 继承 framework4j-web 的 {@link GlobalExceptionHandler}（注册本 Bean 后其
 * ConditionalOnMissingBean 自动装配退避，保留全部默认处理器），并补齐：
 * <ul>
 *   <li>{@link BusinessException}（gateway4j 106xx 业务码）→ 统一信封失败响应，
 *       修复业务异常落入兜底 500「系统繁忙」的问题（D10）。</li>
 *   <li>参数校验异常（D9）：字段级 errors 键转换为 API 契约的 snake_case
 *       （Hibernate 属性路径为 routeName → 前端表单键 route_name），并把类级约束
 *       （如 BACKEND 路由 path/upstream_url 必填）还原为对应字段。</li>
 * </ul>
 */
@Slf4j
@RestControllerAdvice
public class AdminGlobalExceptionHandler extends GlobalExceptionHandler {

    /** 与 framework4j 全局处理器一致的字段错误子码表（key = 校验注解简单名）。 */
    private static final Map<String, String> ANNOTATION_ERROR_CODE_MAP = Map.ofEntries(
            Map.entry("NotBlank", "REQUIRED_MISSING"),
            Map.entry("NotNull", "REQUIRED_MISSING"),
            Map.entry("NotEmpty", "REQUIRED_MISSING"),
            Map.entry("Email", "FORMAT_INVALID"),
            Map.entry("Pattern", "FORMAT_INVALID"),
            Map.entry("Min", "OUT_OF_RANGE"),
            Map.entry("Max", "OUT_OF_RANGE"),
            Map.entry("Size", "OUT_OF_RANGE"),
            Map.entry("DecimalMin", "OUT_OF_RANGE"),
            Map.entry("DecimalMax", "OUT_OF_RANGE"),
            Map.entry("Positive", "OUT_OF_RANGE"),
            Map.entry("PositiveOrZero", "OUT_OF_RANGE"),
            Map.entry("Negative", "OUT_OF_RANGE"),
            Map.entry("NegativeOrZero", "OUT_OF_RANGE"));

    /**
     * 认证异常（token 缺失/无效/过期/签名校验失败，102xx 认证类错误码）→ HTTP 401。
     * <p>
     * framework4j-accesstoken 的 {@code TokenInterceptor} 在 preHandle 阶段抛出
     * {@link AuthException}，framework4j-web v1.2.1 的默认处理器无对应分支，
     * 此前落入 {@code Exception} 兜底返回 500「系统繁忙」（D22）——前端 401 →
     * 静默 refresh → 重放链路因此无法触发。仅映射认证类异常，真正的服务器异常
     * 仍走 500 兜底。信封业务码沿用异常自带 code（10200 未认证/10201 过期/
     * 10202 签名校验失败/10207 格式错误），message 为拦截器给出的友好文案。
     */
    @ExceptionHandler(AuthException.class)
    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    public ApiResponse<?> handleAuthException(AuthException e) {
        log.warn("[认证异常] code={}, message={}", e.getCode(), e.getMessage());
        String message = e.getMessage() != null && !e.getMessage().isBlank()
                ? e.getMessage() : "认证失败，请重新登录";
        return ApiResponse.fail(e.getCode(), message);
    }

    /**
     * gateway4j 业务异常（ErrorCode 106xx 业务自定义段）→ 信封失败响应，HTTP 200。
     */
    @ExceptionHandler(BusinessException.class)
    @ResponseStatus(HttpStatus.OK)
    public ApiResponse<?> handleBusinessException(BusinessException e) {
        log.warn("[业务异常] code={}, message={}", e.getCode(), e.getMessage());
        return ApiResponse.fail(e.getCode(), e.getMessage());
    }

    /**
     * 参数校验异常（D9）：返回 PARAM_ERROR + 字段级 errors（键为 snake_case 字段名）。
     */
    @Override
    @ExceptionHandler({MethodArgumentNotValidException.class, BindException.class})
    @ResponseStatus(HttpStatus.OK)
    public ApiResponse<?> handleValidationException(Exception e) {
        var bindingResult = e instanceof MethodArgumentNotValidException manve
                ? manve.getBindingResult()
                : ((BindException) e).getBindingResult();

        List<ApiError> errors = new ArrayList<>();
        for (ObjectError oe : bindingResult.getAllErrors()) {
            ConstraintViolation<?> violation = unwrap(oe);
            errors.add(new ApiError(
                    resolveField(oe, violation),
                    resolveCode(oe, violation),
                    oe.getDefaultMessage(),
                    resolveRejectedValue(oe, violation)));
        }
        log.warn("[参数校验异常] {}", errors);
        return ApiResponse.fail(ApiCode.PARAM_ERROR, errors);
    }

    private ConstraintViolation<?> unwrap(ObjectError oe) {
        try {
            return oe.unwrap(ConstraintViolation.class);
        } catch (Exception e) {
            return null;
        }
    }

    private String resolveField(ObjectError oe, ConstraintViolation<?> violation) {
        String property = null;
        if (oe instanceof FieldError fe && fe.getField() != null && !fe.getField().isBlank()) {
            property = fe.getField();
        }
        if (property == null && violation != null) {
            // 类级约束：取属性路径上最后一个 PROPERTY 节点（校验器用 addPropertyNode 报告字段）
            for (Path.Node node : violation.getPropertyPath()) {
                if (node.getKind() == ElementKind.PROPERTY) {
                    property = node.getName();
                }
            }
        }
        return property != null ? toSnakeCase(property) : null;
    }

    private String resolveCode(ObjectError oe, ConstraintViolation<?> violation) {
        if (violation != null && violation.getConstraintDescriptor() != null
                && violation.getConstraintDescriptor().getAnnotation() != null) {
            String annotation = violation.getConstraintDescriptor().getAnnotation()
                    .annotationType().getSimpleName();
            return ANNOTATION_ERROR_CODE_MAP.getOrDefault(annotation, "INVALID");
        }
        if (oe instanceof FieldError fe && fe.getCode() != null) {
            return ANNOTATION_ERROR_CODE_MAP.getOrDefault(fe.getCode(), "INVALID");
        }
        return "INVALID";
    }

    private Object resolveRejectedValue(ObjectError oe, ConstraintViolation<?> violation) {
        if (oe instanceof FieldError fe) {
            return fe.getRejectedValue();
        }
        return violation != null ? violation.getInvalidValue() : null;
    }

    private static String toSnakeCase(String property) {
        return property.replaceAll("([a-z0-9])([A-Z])", "$1_$2").toLowerCase();
    }
}
