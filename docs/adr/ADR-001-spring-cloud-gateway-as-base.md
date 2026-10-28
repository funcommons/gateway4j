# ADR-001：选择 Spring Cloud Gateway 作为网关基础

## 状态

已采纳

## 背景

需要选择 Java 生态的网关基础框架。候选方案：

1. **Spring Cloud Gateway (SCG)**：基于 Spring WebFlux + Netty，响应式非阻塞，Spring 生态原生集成
2. **自研 Netty Server**：完全自定义，灵活度最高，但开发成本大
3. **Apache ShenYu**：成熟网关平台，但插件体系深度耦合，无法满足多层分发路由需求

## 决策

选择 Spring Cloud Gateway 作为网关基础框架。

## 理由

- **Spring 生态兼容**：与 Spring Boot 3.4.x 原生集成，framework4j SDK 无缝对接
- **响应式基线**：基于 Netty 的非阻塞 IO，满足 P99 ≤ 1ms 转发延迟目标
- **转发能力成熟**：SCG 的路由转发、负载均衡、重试等能力已生产验证
- **上层可扩展**：通过自定义 WebHandler + RouteLocator，可在 SCG 上层封装分发路由和插件体系，无需修改 SCG 核心

## 后果

- **正面**：开发周期短，转发性能有保障，Spring 社区支持丰富
- **负面**：SCG 的 RouteLocator 模型为扁平匹配，需自定义 DynamicRouteLocator 适配多层分发；SCG 基于 WebFlux，管理后台 API 需注意阻塞/非阻塞边界
- **风险**：SCG 版本升级可能影响自定义集成点，需锁定版本并关注 Release Notes
