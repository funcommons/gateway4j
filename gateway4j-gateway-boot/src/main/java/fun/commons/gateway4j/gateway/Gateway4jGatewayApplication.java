package fun.commons.gateway4j.gateway;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

// 仅扫描本工程包：framework4j 的能力全部经 AutoConfiguration.imports 自动装配
// （多 Redis/多 DataSource/签名/缓存/SQL 追踪均自带 web-type 条件守卫）。若连同
// fun.commons.framework4j 一起组件扫描，其 Servlet MVC 残留类（如 framework4j-web
// 的 GlobalExceptionHandler，@RestControllerAdvice 无 web-type 守卫）会被误注册进
// reactive 上下文，而纯 Netty 进程没有 spring-webmvc，实例化即 NoClassDefFoundError。
@SpringBootApplication(scanBasePackages = "fun.commons.gateway4j")
@EnableScheduling
@MapperScan("fun.commons.gateway4j.common.mapper")
public class Gateway4jGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(Gateway4jGatewayApplication.class, args);
    }
}
