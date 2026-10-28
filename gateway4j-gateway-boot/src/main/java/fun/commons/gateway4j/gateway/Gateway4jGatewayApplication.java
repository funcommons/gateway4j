package fun.commons.gateway4j.gateway;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(scanBasePackages = {
        "fun.commons.gateway4j",
        "fun.commons.framework4j"
})
@EnableScheduling
@MapperScan("fun.commons.gateway4j.admin.mapper")
public class Gateway4jGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(Gateway4jGatewayApplication.class, args);
    }
}
