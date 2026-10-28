package fun.commons.gateway4j.admin.web;

import fun.commons.framework4j.accesstoken.exception.AuthException;
import fun.commons.gateway4j.common.exception.BusinessException;
import fun.commons.gateway4j.common.constant.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 异常 → HTTP 状态码映射（D22）：
 * AuthException（token 缺失/无效/过期）必须 401 + 友好信封，而非兜底 500「系统繁忙」；
 * 真正的服务器异常必须保持 500，不得被 401 误伤。
 */
class AdminGlobalExceptionHandlerTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new ThrowingController())
                .setControllerAdvice(new AdminGlobalExceptionHandler())
                .build();
    }

    @RestController
    static class ThrowingController {
        @GetMapping("/no-token")
        public String noToken() {
            throw new AuthException(10200, "未提供认证令牌");
        }

        @GetMapping("/expired")
        public String expired() {
            throw new AuthException(10201, "令牌已过期");
        }

        @GetMapping("/biz-error")
        public String bizError() {
            throw new BusinessException(ErrorCode.ROUTE_NOT_FOUND);
        }

        @GetMapping("/server-error")
        public String serverError() {
            throw new IllegalStateException("db connection lost");
        }
    }

    @Test
    void authExceptionReturns401WithFriendlyEnvelope() throws Exception {
        mockMvc.perform(get("/no-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(10200))
                .andExpect(jsonPath("$.message").value("未提供认证令牌"));
    }

    @Test
    void expiredTokenAlsoReturns401() throws Exception {
        mockMvc.perform(get("/expired"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(10201))
                .andExpect(jsonPath("$.message").value("令牌已过期"));
    }

    @Test
    void businessExceptionKeepsHttp200Envelope() throws Exception {
        mockMvc.perform(get("/biz-error"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(ErrorCode.ROUTE_NOT_FOUND.code()));
    }

    @Test
    void serverErrorStays500SystemBusy() throws Exception {
        // 真正的服务器异常不受 401 映射影响，仍走兜底 500
        mockMvc.perform(get("/server-error"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value(10001))
                .andExpect(jsonPath("$.message").value("系统繁忙，请稍后重试"));
    }
}
