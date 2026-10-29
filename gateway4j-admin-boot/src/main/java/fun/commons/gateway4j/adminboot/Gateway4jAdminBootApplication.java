package fun.commons.gateway4j.adminboot;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = {
        "fun.commons.gateway4j",
        "fun.commons.framework4j"
})
@MapperScan({
        "fun.commons.gateway4j.admin.mapper",
        "fun.commons.gateway4j.common.mapper"
})
public class Gateway4jAdminBootApplication {

    public static void main(String[] args) {
        SpringApplication.run(Gateway4jAdminBootApplication.class, args);
    }
}
