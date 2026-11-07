/**
 * P4b-1T：v2 监控大盘静态版测试（契约 docs/ui-v2/实施契约.md §4 P4b 行 P4b-1；视觉参照
 * prototype-v2/shots/08-monitoring.png）。先红是预期：页面由 P4b-1C 实现（当前 Monitor.vue 为
 * 10 行 V2PagePlaceholder 占位 stub，原地替换，路由/侧栏已挂 V2Monitor 不动表）。
 *
 * ── 数据源与 mock（两源两区，真实封装位置已侦察，不需要新封装）──────────────────
 * - fetchTrafficSummary()（@/api/v2）：KPI 四卡（hits/qps/p95/错误率）+ 慢路由 Top5 + 状态码 donut
 * - listRouteStatus()（@/api/misc 已有封装）：Σactive_connections + 上游健康卡（单上游降维）
 *   ⚠ misc.ts RouteStatusItem 未声明 active_connections，但后端实际下发
 *   （MonitorController.java buildStatus L168：status.put("active_connections", metrics.active())，
 *   P1-1 在途请求数 gauge）；C 步需为接口补可选字段 `active_connections?: number | string`
 *   （Long→String 契约，纯 type 层变更）。本测试 mock 按后端实际形状下发。
 * - mock 工厂只导出上述两成员：页面若越界 import 其它成员 = undefined → TypeError 自曝；
 *   fetchRouteTimeseries / fetchDecisionTree（P4b-2 才引入）/ getRouteTimeseries 等由 import 面
 *   源码断言双重拦截（见「只读与 SDK-only 源码契约」组）。
 * - 契约原文「三源独立降级」在本步实为两源两区（fetchTrafficSummary 区 + listRouteStatus 区，
 *   P4b-2 时序端点是第三源但未在本步范围）：降级语义按区隔离、两方向对称 —— T 裁决钉死：
 *   ① fetchTrafficSummary 败 → mon-error + traffic 喂的四张 KPI 卡全 — + Top5/donut 空态；
 *      上游健康卡与 mon-kpi-connections 照常（同源 listRouteStatus，不陪葬 —— 数据流诚实口径，
 *      任务提示「KPI 全 —」按源收窄为「traffic 四卡全 —」）。
 *   ② listRouteStatus 败 → mon-upstream-error（卡内局部错误条，Detail.vue dtl-history-error 先例）
 *      + mon-kpi-connections — + 上游行清空；traffic 四卡/Top5/donut 不被污染。
 *
 * ── 口径裁决（T 定死，C 照做）────────────────────────────────────────────────
 * - KPI 五卡：kpiHits=Σhits_24h（formatHits 口径随 Overview kpi-requests：k 取整、M/B 一位小数去尾 0，
 *   Long→String 以字符串到达的数值 Number() 归一）；kpiQps=Σqps Math.round；kpiP95=非 null
 *   p95_latency_ms 均值 Math.round + ms（全 null → —）；kpiError=Σerrors÷Σhits×100 保留两位小数
 *   toFixed(2)+'%'（Σerrors=Σ(c4xx+c5xx)——RouteTrafficSummaryItem 无扁平 errors 字段，从
 *   status_codes 两桶推导，不造新字段；Σhits=0 → —）；kpiConnections=Σactive_connections
 *   （listRouteStatus 求和，字符串数值归一，缺字段按 0）。
 * - 上游健康（单上游降维）：复用 Overview upstream-card 形态语义 —— 行=mon-up-row-<route_id>
 *   （upstream!=null 才入行：点 data-state ok/warn + 名称 + 可达/不可达文案 + latency ms），
 *   mon-up-bad=不可达计数行（>0 才渲染，文案 '{n} 个上游不可达'），mon-up-pbar=可达占比
 *   Math.round(ok/all*100)+'%'（all=upstream!=null 行数，all=0 → 无 pbar + upstreamEmpty）。
 *   【禁实例矩阵】S2 单上游端点语义：无「N 实例」、无 01/02/03 槽位列（源码+i18n 双断言拦截）。
 * - 慢路由 Top5：traffic-summary 按 p95 降序取 5（p95 null 排后仍可入榜但无 bar 无值）；
 *   pbar 宽度 ∝ 相对榜内最大 p95：Math.round(p95/max*100)+'%'（榜首恒 100%）；
 *   【红橙分级阈值】p95 ≥ 300ms → is-hot（--app-color-danger 红），p95 < 300ms → is-warm
 *   （--app-color-warning 橙）——两档制随契约「红橙分级」，300 边界锚定原型 412ms 红/96ms 橙
 *   （仓库无既有延迟分档先例，S8 亦未定义，此为 T 首钉，C 勿改阈值）；p95 null → 值 '—' 无 pbar。
 * - 状态码 donut：复用 Detail.vue dtl-ring 先例（SVG stroke-dasharray 自绘，is-2xx/is-4xx/is-5xx
 *   = success/warning/danger 三色），非 conic-gradient（可断言 DOM 属性）；桶=Σstatus_codes 三桶
 *   （逐行 toNum 归一、缺 status_codes 按 0），桶行 mon-bucket-c2xx/c4xx/c5xx = formatHits 计数 +
 *   pctText 占比（Math.round(p*10)/10，整数不带小数，Detail 同款）；中心 mon-ring-total =
 *   formatHits(Σ三桶)；Σ三桶=0 → mon-donut-empty（无环无中心）。
 * - snapshot 提示条：凡任一行 source==='snapshot' 即显 mon-source-hint（S6/S3 宽松口径，
 *   不等 quantile_fallback，勿回退）。
 * - 375/骨架不带测：S6 Overview 先例无骨架屏（onMounted 一次拉取 + 失败降级即终态），窄屏 5 卡
 *   折列走 CSS media query（jsdom 无法实测宽度，S6 同弃）。
 *
 * ── 砍除项（P4b 契约钉除，缺口不造数；源码+i18n+渲染三重拦截）──────────────────
 * - 告警表（无 alerting 后端）：禁 alert* testid / 「告警」文案
 * - 环境 tabs（监控接口无 environment 参数）：禁 env* testid / 「环境」文案
 * - KPI delta▲%（无历史对比端点）：禁 delta/peak testid / ▲▼峰值 文案（峰值@时刻归 P4b-2 序列推导）
 * - 实例矩阵（S2 单上游）：禁 instance/inst-* testid / 「实例」文案
 *
 * ── i18n key 全表（v2.monitor.* 新树，zh/en 同步加，铁律 6；20 个）───────────────
 * subtitle('网关级与路由级指标聚合 · Prometheus 采集') / kpiHits / kpiQps / kpiP95 / kpiErrorRate /
 * kpiConnections / upstreamTitle / upOk / upBad / upBadCount('{n} 个上游不可达') / upstreamEmpty /
 * upstreamFailed / slowTitle / slowHint / slowEmpty / donutTitle / donutHint / donutEmpty /
 * snapshotHint / loadFailed
 * （页头主标题复用既有 v2.page.monitor，不新设 key；桶名 2xx/4xx/5xx 为字面量不进 i18n，Detail 先例）
 *
 * ── testid 全表（前缀 mon-*）────────────────────────────────────────────────
 * mon-page（根，任何状态都在）；mon-error（traffic 失败全局错误条 role=alert）；mon-source-hint
 * （snapshot 提示条 role=status）；mon-kpi-hits / mon-kpi-qps / mon-kpi-p95 / mon-kpi-error /
 * mon-kpi-connections（5 KPI 卡，卡内 label+value）；mon-upstream-card；mon-upstream-error（卡内
 * 局部错误条）；mon-up-bad（不可达计数行，>0 才渲染）；mon-up-row-<route_id>（内含 data-state 点）；
 * mon-up-pbar（可达占比 fill，style 宽 %）；mon-upstream-empty；mon-slow-card；mon-slow-row-<route_id>
 * （p95 降序前 5）；mon-slow-val-<route_id>（'412 ms' / '—'）；mon-slow-pbar-<route_id>（fill，
 * style 宽 % + is-hot/is-warm，null 无此元素）；mon-slow-empty；mon-donut；mon-ring（stroke-dasharray
 * SVG）；mon-ring-total（中心总量）；mon-bucket-c2xx / mon-bucket-c4xx / mon-bucket-c5xx；mon-donut-empty
 *
 * ══ P4b-2b 追加段（时序图区，文件第二批；页面未实现 → 下方新增用例先红为预期）════════
 * 契约：§4 P4b 行 P4b-2b（~350 行前端）。QPS 面积图=网关级 total 序列【单线】（原型 08
 * 「入口 vs 上游转发」双线的上游侧序列无端点 → 不造数降单线：卡内画线 polyline 恰 1 +
 * hint 含「单线」+ 源码无「上游转发」字样三重拦截）；延迟分位图=p50/p95/p99 三线
 * （Detail.vue:487 linePoints 缩放先例，线元素以 data-quantile="p50|p95|p99" 可辨）；
 * 时间范围 FcSegmented 三档 1h/24h/7d 直映射 /v1/monitor/gateway/timeseries 既有参数
 * （后端 3327250 已落库，响应形状以 MonitorTimeseriesService#gatewayTimeseries 为权威：
 * {source, data_points: 8 字段点数组, quantile_fallback?}）；KPI 峰值@时刻从序列 max
 * 推导补显（真实推导，非造数）。
 *
 * ── P4b-2b 与旧页差异裁决（头注钉死，C 勿引入混布）────────────────────────────
 * 404 回退旧 /metrics 混布（Index.timeseries 先例）在网关级【不随迁】：旧 /metrics 是
 * routeId 必填的路由级兼容端点，网关级没有旧端点可回退 → 裁决：404/失败 = mon-ts-error
 * 错误条 + 图区空态文案 + KPI 峰值 —，无混布。源码断言拦截 getRouteTimeseries /
 * getRouteMetrics / fetchRouteTimeseries 与旧端点 URL 字样（用例见降级组第三条）。
 *
 * ── P4b-2b api 函数签名（C 步在 src/api/v2.ts 新建；本测试 mock 该成员，api 尚不存在）──
 * export interface GatewayTimeseriesPoint {
 *   timestamp: string              // ISO-8601（后端 Instant.toString()，new Date 直解）
 *   total_requests: number         // Long→String 契约下可能以字符串到达，页面 Number() 归一
 *   error_count: number
 *   error_rate: number
 *   avg_latency_ms?: number
 *   p50_latency_ms?: number
 *   p95_latency_ms?: number
 *   p99_latency_ms?: number
 * }
 * export interface GatewayTimeseriesResponse {
 *   source: 'prometheus' | 'snapshot'
 *   data_points: GatewayTimeseriesPoint[]
 *   quantile_fallback?: boolean    // true = 分位按 avg 退化填充（有值可画，非 null 占位）
 * }
 * export function fetchGatewayTimeseries(timeRange = '24h', granularity = '1h') {
 *   return envelope<GatewayTimeseriesResponse>(http.get('/v1/monitor/gateway/timeseries',
 *     { params: { time_range: timeRange, granularity } }))
 * }
 * （wire 参数名 time_range snake_case 随后端 @RequestParam(name="time_range")，granularity
 *  原名不 rename；页面调用须双参显式传，不赖 api 默认值。）
 *
 * ── P4b-2b 口径裁决（T 定死，C 照做）──────────────────────────────────────────
 * - 时间范围→参数映射（后端 rangeMsFor/stepMsFor 已支持档内选点，均 ≤ pointsFor 500 上限）：
 *   近1h→('1h','1m')（后端默认档配对，60 点）/ 近24h→('24h','1h')（fetchRouteTimeseries
 *   v2 先例，24 点）/ 近7d→('7d','1h')（168 点）；不引 '5m'/'6h' 档。挂载默认 24h 档。
 * - QPS 面积图（原型 08 形态）：单 polyline（线）+ 面积 path（同序列闭包 d 以 Z 收口 +
 *   fill 属性）；polyline points 坐标对数 = data_points 长度（jsdom 直读 points 属性抽样，
 *   Detail.test.ts drawnLines「points 非空 polyline」先例）。
 * - 延迟分位图：三 polyline data-quantile=p50/p95/p99 + 图例字面量 P50/P95/P99
 *   （Detail dtl-legend 先例：分位名为 mono 字面量不进 i18n）；quantile_fallback=true →
 *   mon-quantile-fallback 提示条，语义=分位【按 avg 退化填充、有值照画三线】，区别于 S2
 *   traffic-summary 的 p95=null 占位（MonitorController javadoc 双注记，两语义不得混用）。
 * - KPI 峰值：max(total_requests)（并列取首个，稳定）；值 formatHits 同口径；@时刻 同日
 *   'HH:mm' / 跨天 'MM-DD HH:mm'（旧 Index.chart-axis「跨天带日期」口径随迁，精度到分）；
 *   timestamp 解析失败的点不参与峰值；空序列/加载失败 → '—'（无 @）。峰值卡归时序区
 *   （gateway ts 源），不入 kpi-grid 五卡（traffic 源）。
 * - source 徽标 mon-ts-source：恒显于时序区（加载成功时），data-state=prometheus|snapshot
 *   双态 + 文案 sourcePrometheus/sourceSnapshot；加载失败无徽标。snapshot 响应不带
 *   quantile_fallback（后端仅 prometheus 路径标注）→ 无退化提示条，与徽标互独立。
 * - loadEpoch 竞态随迁（List.load-epoch 先例）：慢 24h 挂起切 1h，先返回者胜，
 *   陈旧响应后到不覆盖、不闪空。
 *
 * ── P4b-2b testid 追加表（mon-* 前缀延续，7 个）───────────────────────────────
 * mon-range-seg（FcSegmented 三档，默认 24h is-active）；mon-chart-qps（svg + 单 polyline
 * + 面积 path[fill]）；mon-chart-latency（svg + 三 polyline[data-quantile] + 图例
 * P50/P95/P99 字面量）；mon-kpi-peak（峰值卡：label=peakQps + '512 @ 10:04' 形态文本）；
 * mon-ts-error（时序加载失败错误条 role=alert）；mon-ts-source（source 徽标 data-state
 * 双态）；mon-quantile-fallback（退化提示条 role=status，仅 quantile_fallback=true 渲染）。
 * 空序列/失败空态文案 chartEmpty 渲染在两张图卡内（text 断言，不另设 testid）。
 *
 * ── P4b-2b i18n 追加 key 清单（v2.monitor.* 延续，zh/en 同步，14 个）─────────────
 * chartQpsTitle('请求吞吐 QPS') / chartQpsHint('网关入口 · total 序列单线') /
 * chartLatencyTitle('延迟分位') / chartLatencyHint('单位 ms') / rangeLabel('时间范围') /
 * range1h('近 1 小时') / range24h('近 24 小时') / range7d('近 7 天') / peakQps('峰值 QPS') /
 * quantileFallbackHint('Prometheus 分位序列缺失，P50/P95/P99 暂按均值（avg）退化绘制') /
 * chartEmpty('暂无时序数据') / tsLoadFailed('时序指标加载失败') /
 * sourcePrometheus('Prometheus 实时') / sourceSnapshot('快照兜底')
 *
 * ── ⚠ 与既有「砍除三区块 + delta」用例的冲突（主 agent 裁决项；T 铁律禁改既有 41 用例）──
 * P4b-1 头注自注「峰值@时刻归 P4b-2 序列推导」——本步契约解除该临时 ban 后，既有用例
 * 「无告警表/环境 tabs/delta▲%/峰值…三层皆无」在 C 步接线时必红，命中三处：i18n key
 * peakQps 命中 key 正则 /peak/i、值「峰值 QPS」命中值正则 /峰值/、渲染文本同命中
 * /峰值/（若 mon-kpi-peak 静态写出还命中 testid 正则 /peak/i，动态绑定可避开该处）。
 * C 步需把该用例 ban 收窄为 alert/env/delta/instance/▲▼（去 peak 与 峰值 两 token，其余
 * 砍除区保留）——属契约演进而非回退；其余 40 条既有用例与 P4b-2b 无冲突（import 面 ban
 * 名单不含 fetchGatewayTimeseries）。
 *
 * ══ P4b-3 实时化追加段（T 步第三批；页面未实现 → 下方新增用例先红为预期）════════
 * 契约：§4 P4b 行 P4b-3（~300 行前端）。useMonitorStream 零改动复用（src/composables/
 * useMonitorStream.ts 269 行公开面：start/stop/dispose + mode/connected/lastMetrics/
 * lastConfigChange 四 ref；节流/去抖/降级链/visibilitychange 全归 composable），页面只
 * 消费回调与 ref。
 *
 * ── mock 策略（与前两批不同：vi.mock composable，不用 FakeEventSource）────────────
 * 任务铁律「mock useMonitorStream（vi.mock composable，不 mock 真连接）」：工厂 async
 * （vi.hoisted 内无法 import vue，ref 在工厂内 await import('vue') 动态取）。返回对象
 * 的 mode/connected/lastMetrics/lastConfigChange 必须是【真实 Vue ref】——页面模板的
 * 响应式依赖真实 ref，fake 若用普通对象，正确的 C 实现也不会重渲染 → 假红，故必须真
 * ref。__ 前缀方法（__open/__fail/__metrics/__configChanged）是测试驱动把手（非真实
 * composable 公开面）：__metrics 立即送达（真实 composable 节流 1s 但 leading 立即，
 * 首条行为一致）；__configChanged 逐字复刻 debouncedFireConfigChanged（configDebounceMs
 * ?? 2000、末次胜出）——2s 去抖语义归 composable 所有（零改动复用），fake 内置同款仅为
 * 页面级可测，该语义的真源仍是 useMonitorStream.test.ts（其「config_changed 去抖 2s」
 * 用例已覆盖，不在此重复验证 composable 本体）。mock 工厂只导出 useMonitorStream 一
 * 成员：页面若越界 import parseStreamData 等 = undefined → TypeError 自曝（页面消费
 * 全走回调，无需 parseStreamData）。
 *
 * ── P4b-3 口径裁决（T 定死，C 照做）──────────────────────────────────────────
 * - 【SSE 摘要呈现裁决】SSE metrics 摘要（后端 MonitorStreamService#buildSummary：
 *   {routes_total,error_count,total_requests,at}，at=epoch 毫秒）与 P4b-1 五 KPI 卡
 *   （Σhits_24h/Σqps/均值P95/错误率/Σactive_connections，traffic+status 两源）字段不同
 *   源不同 → 摘要【不覆盖】五 KPI 卡；改为页头「实时摘要」条 mon-stream-badge：
 *   routes_total/error_count/total_requests 三徽标（mon-badge-routes/errors/requests），
 *   值 toNum 归一 + formatHits（Long→String 字符串数值同口径，'1234567'→'1.2M'），
 *   无摘要 '—'；data-state='live'(sse)/'polling'(降级)。降级时摘要清空回 '—'（旧 Index
 *   watch(streamMode)「非 sse 清陈旧摘要」先例随迁）——polling 态不伪造推送摘要。
 * - 【降级终态裁决】useMonitorStream 既有语义：fallback 单向终态（mode='polling' 后
 *   start() no-op、onFallback 幂等、「polling owns the loop」）→【无「SSE 恢复停轮询」
 *   路径】，降级后 5s 轮询跑到卸载为止、stream.start 不重入。onFallback → 若 autoRefresh
 *   开则 ensure 5s interval（旧 Index onFallback `if (autoRefresh.value && !refreshTimer)
 *   setupAutoRefresh()` 同款）；autoRefresh 关时降级不起轮询（用户已明确弃用自动刷新，
 *   不逆其意）。
 * - 【autoRefresh 裁决】FcSwitch 默认开（旧 Index ref(true) 先例）；单一 5s interval
 *   （轮询与 autoRefresh 共用同一定时器，旧 Index 模式）：开→每 5s 重拉三源各一次
 *   （traffic+status+timeseries —— v2 大盘无旧 Index 的 topology 重载荷，三源全是指标
 *   数据，无「只刷部分」的既判；旧 Index「autoRefresh 只刷 loadMetrics 不全量 load」
 *   的收窄对象在 v2 不存在）；关→停；再开→恢复（新 interval 从此刻起整周期 5s，无
 *   立即拉取，旧 Index watch([autoRefresh,…])→setupAutoRefresh 先例）。
 *   lastRefresh（mon-last-refresh）每次拉取（含挂载首轮）后更新：fmtClock HH:mm:ss，
 *   禁 toLocaleTimeString（源码断言，旧 Index.last-refresh P0-2 模式继承）。
 *   FcSwitch inheritAttrs:false 且模板不绑 $attrs → data-testid 会被吞，testid 必须放
 *   wrapper 元素（mon-autorefresh-switch 包 FcSwitch，Index.vue label 先例），测试以
 *   wrapper 内 [role="switch"] 按钮定位。
 * - 【config_changed 定向裁决】2s 去抖归 composable（页面不得覆写 configDebounceMs
 *   ——options 契约断言钉死零改动复用默认 2000）；页面 onConfigChanged（已去抖的回调）
 *   → 定向重拉 traffic+timeseries 恰一次各；listRouteStatus【不】随拉（上游可达性是
 *   运行态探测非配置态，route/plugin/global-plugin 变更不改变探测结果——「定向」的
 *   可测含义）。
 * - 【visibilitychange 裁决：只 SSE 层】旧 Index.vue 无页面级暂停（源码 grep 无
 *   visibilitychange/visibilityState/document.hidden，5s interval 不因 hidden 停）→
 *   页面自身 interval 不做可见性暂停（先例随迁，源码断言拦截 Monitor.vue 不得出现
 *   visibilitychange/visibilityState/document.hidden 字样）；hidden 暂停/可见重连由
 *   useMonitorStream 自带的 visibilitychange 绑定负责（SSE 连接层），其行为已由
 *   useMonitorStream.test.ts「visibilitychange 暂停 / 恢复」组覆盖，页面级不重复实现。
 *
 * ── P4b-3 testid 追加表（mon-* 前缀延续，6 个）───────────────────────────────
 * mon-stream-badge（实时摘要条，data-state=live|polling，含标题+三徽标+lastRefresh+
 * autoRefresh 开关）；mon-badge-routes / mon-badge-errors / mon-badge-requests（三徽标
 * 值槽，label+值）；mon-last-refresh（'最近刷新 {time}'，HH:mm:ss）；mon-autorefresh-switch
 * （FcSwitch 的 wrapper，内含 role=switch 按钮）。均已核对：不撞既有砍除区 testid 正则
 * /alert|env|delta/i，全部落在 mon- 前缀断言内。
 *
 * ── P4b-3 i18n 追加 key 清单（v2.monitor.* 延续，zh/en 同步，8 个）─────────────
 * autoRefresh('自动刷新') / lastRefresh('最近刷新 {time}') / streamSummaryTitle('实时摘要') /
 * streamLive('实时') / streamPolling('轮询兜底') / streamRoutes('路由数') /
 * streamErrors('错误数') / streamRequests('请求总量')
 * （均已核对：key 不撞既有砍除区 /alert|env|delta|instance/ 正则，value 不撞
 * /告警|环境|▲|▼/ 与「实例」——既有砍除区用例不受影响。）
 *
 * ── fake timers 隔离（不惊动既有 69 用例）──────────────────────────────────
 * 本批用例的 fake timers/systemTime 全部收在 P4b-3 各 describe 自己的 beforeEach/
 * afterEach 内（vi.useFakeTimers + setSystemTime(2026-11-07 08:00:00 本地) + afterEach
 * useRealTimers）；既有用例仍走真实计时器，一字不动。挂载首轮拉取即定 lastRefresh
 * 基准 08:00:00，快进 5s → 08:00:05，HH:mm:ss 全程系统时间可控无时区歧义。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import fs from 'fs'
import path from 'path'
import zhCN from '@/locales/zh-CN'
import enUS from '@/locales/en-US'

const mocks = vi.hoisted(() => ({
  fetchTrafficSummary: vi.fn(),
  // P4b-2b 增补第三成员（任务铁律授权的 mock 面增补）：api 函数尚不存在，C 步建
  // fetchGatewayTimeseries（签名见头注 P4b-2b 段）+ 页面接线
  fetchGatewayTimeseries: vi.fn(),
  listRouteStatus: vi.fn(),
  hasPermission: vi.fn(() => true),
  hasAnyPermission: vi.fn(() => true),
  canEdit: vi.fn(() => true),
  // P4b-3 增补：useMonitorStream 整体 mock（vi.mock composable，不 mock 真连接/EventSource）。
  // stream 是 fake 的驱动把手：opts/last/calls 由下方 async mock 工厂（能 await import('vue')
  // 拿真 ref）填充；测试经 mocks.stream.last 的 __ 前缀把手驱动回调、经 calls 断言生命周期。
  useMonitorStream: vi.fn(),
  stream: {
    opts: null as Record<string, any> | null,
    last: null as any,
    calls: { start: 0, stop: 0, dispose: 0 }
  }
}))

vi.mock('@/api/v2', () => ({
  fetchTrafficSummary: mocks.fetchTrafficSummary,
  fetchGatewayTimeseries: mocks.fetchGatewayTimeseries
}))
vi.mock('@/api/misc', () => ({
  listRouteStatus: mocks.listRouteStatus
}))
vi.mock('@/composables/usePermission', () => ({
  usePermission: () => ({
    hasPermission: mocks.hasPermission,
    hasAnyPermission: mocks.hasAnyPermission,
    canEdit: mocks.canEdit
  })
}))
// P4b-3：async 工厂——vi.hoisted 内不能 import，ref 必须在工厂里动态取（真 Vue ref，
// 见头注「mock 策略」段）。只导出 useMonitorStream 一成员，页面越界 import 即 TypeError 自曝。
vi.mock('@/composables/useMonitorStream', async () => {
  const { ref } = await import('vue')
  const st = mocks.stream
  const mode = ref('idle')
  const connected = ref(false)
  const lastMetrics = ref<unknown>(null)
  const lastConfigChange = ref<unknown>(null)
  let configTimer: ReturnType<typeof setTimeout> | null = null
  let configPending: unknown = null

  function clearConfigTimer() {
    if (configTimer !== null) { clearTimeout(configTimer); configTimer = null }
    configPending = null
  }

  mocks.useMonitorStream.mockImplementation((options: Record<string, any> = {}) => {
    clearConfigTimer()
    mode.value = 'idle'
    connected.value = false
    lastMetrics.value = null
    lastConfigChange.value = null
    st.opts = options
    const handle = {
      mode, connected, lastMetrics, lastConfigChange,
      start: () => { st.calls.start++; mode.value = 'connecting' },
      stop: () => { st.calls.stop++ },
      dispose: () => { st.calls.dispose++; mode.value = 'idle'; clearConfigTimer() },
      // ── 测试驱动把手（复刻真实 composable 行为契约，见头注）──
      __open: () => { mode.value = 'sse'; connected.value = true },
      __fail: (reason = 'error') => {
        mode.value = 'polling'
        connected.value = false
        options.onFallback?.(reason)
      },
      __metrics: (m: unknown) => {
        lastMetrics.value = m
        options.onMetrics?.(m as any)
      },
      __configChanged: (e: unknown) => {
        // 逐字复刻 useMonitorStream debouncedFireConfigChanged（去抖窗口=页面传入的
        // configDebounceMs ?? 2000，末次胜出）
        lastConfigChange.value = e
        configPending = e
        if (configTimer !== null) clearTimeout(configTimer)
        configTimer = setTimeout(() => {
          configTimer = null
          const applied = configPending
          configPending = null
          if (applied) options.onConfigChanged?.(applied as any)
        }, options.configDebounceMs ?? 2000)
      }
    }
    st.last = handle
    return handle
  })
  return { useMonitorStream: mocks.useMonitorStream }
})

import Monitor from '@/views-v2/monitor/Monitor.vue'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en-US', messages: { 'zh-CN': zhCN, 'en-US': enUS } })

// dig: 按点路径取 locale 值；undefined = key 缺失（参照 Overview.test.ts / plugins List.test.ts）
function dig(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}
const t = (key: string) => String(dig(zhCN, key))
const tv = (key: string, n: number | string) => t(key).replace('{n}', String(n))

function readSource(): string {
  return fs.readFileSync(path.resolve(__dirname, '../Monitor.vue'), 'utf-8')
}
function readTemplate(): string {
  return readSource().match(/<template>[\s\S]*<\/template>/)?.[0] ?? ''
}
function staticTestids(): string[] {
  return [...readTemplate().matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
}
function collectValues(v: unknown): string[] {
  if (v == null) return []
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).flatMap((x) => collectValues(x))
  return [String(v)]
}
function collectKeys(v: unknown, prefix = ''): string[] {
  if (v == null || typeof v !== 'object') return prefix ? [prefix] : []
  return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => collectKeys(x, prefix ? `${prefix}.${k}` : k))
}

// ── fixtures（真实 API 形状，snake_case 原样透传）────────────────────────────

function makeTraffic(routeId: string, over: Record<string, unknown> = {}) {
  return {
    route_id: routeId, route_name: `${routeId}_svc`, path: `/api/${routeId}/**`, status: 'PUBLISHED',
    hits_24h: 312000, qps: 118, p95_latency_ms: 31, avg_latency_ms: 12,
    status_codes: { c2xx: 300000, c4xx: 9000, c5xx: 3000 },
    upstream: null, source: 'prometheus', quantile_fallback: false, ...over
  }
}

/** 默认 5 路由。预置聚合值（C 实现后逐一落卡）：
 * Σhits=1,200,000+312,000+121,000+84,000+3,000=1,720,000 → '1.7M'（s4 故意用字符串 '3000' 钉 Long→String 归一）
 * Σqps=221+118+85+49.4+1=474.4 → '474'
 * 非 null p95=[412,112,37] → 均值 187 → '187 ms'（d1/s4 null 不参与）
 * 错误率=Σ(c4xx+c5xx)÷Σhits×100=(12000+3000+1000)÷1,720,000×100 → '0.93%'（s4 无 status_codes 按 0）
 * donut：Σc2xx=1,701,000('99.1%') / Σc4xx=11,800('12k','0.7%') / Σc5xx=4,200('4k','0.2%')，中心 1,717,000 → '1.7M'
 * 慢路由 Top5 降序：s1(412,红) → s2(112,橙) → s3(37,橙) → d1(null,'—') → s4(null,'—')；宽度 100%/27%/9%
 * s3 source='snapshot' → snapshot 提示条显 */
function defaultTraffic() {
  return [
    makeTraffic('d1', { route_name: 'api_gateway', path: '/api/**', hits_24h: 1200000, qps: 221, p95_latency_ms: null, status_codes: { c2xx: 1200000, c4xx: 0, c5xx: 0 } }),
    makeTraffic('s1', { route_name: 'checkout_service', path: '/api/pay/checkout/**', p95_latency_ms: 412 }),
    makeTraffic('s2', { route_name: 'order_service', path: '/api/order/**', hits_24h: 121000, qps: 85, p95_latency_ms: 112, status_codes: { c2xx: 118000, c4xx: 2000, c5xx: 1000 } }),
    makeTraffic('s3', { route_name: 'report_service', path: '/api/report/**', hits_24h: 84000, qps: 49.4, p95_latency_ms: 37, status_codes: { c2xx: 83000, c4xx: 800, c5xx: 200 }, source: 'snapshot' }),
    makeTraffic('s4', { route_name: 'tiny_service', path: '/api/tiny/**', hits_24h: '3000', qps: 1, p95_latency_ms: null, status_codes: undefined })
  ]
}

/** listRouteStatus 默认 4 行（与 traffic 同批路由 id）。预置值：
 * Σactive_connections=143+57+200+0=400 → '400'（s2 故意用字符串 '57' 钉 Long→String 归一）
 * 上游行=[s1,s2,s3]（d1 upstream=null 不入行）；可达 2/3 → pbar 67%；不可达 1 → '{n} 个上游不可达' */
function defaultStatus() {
  return [
    { route_id: 's1', route_name: 'checkout_service', status: 'HEALTHY', active_connections: 143, upstream: { reachable: true, latency_ms: 8 } },
    { route_id: 's2', route_name: 'order_service', status: 'ERROR', active_connections: '57', upstream: { reachable: false, latency_ms: null } },
    { route_id: 's3', route_name: 'report_service', status: 'HEALTHY', active_connections: 200, upstream: { reachable: true, latency_ms: 12 } },
    { route_id: 'd1', route_name: 'api_gateway', status: 'HEALTHY', active_connections: 0, upstream: null }
  ]
}

/** 慢路由切片 fixture：7 行 p95=[900,600,500,400,300,250,null]，期望榜内只有前 5（250 起被 slice 掉）；
 * sE p95=300 恰在红档下边界（≥300 → is-hot，钉边界） */
function slicedTraffic() {
  const spec: Array<[string, number | null]> = [
    ['sA', 900], ['sB', 600], ['sC', 500], ['sD', 400], ['sE', 300], ['sF', 250], ['sG', null]
  ]
  return spec.map(([id, p95], i) => makeTraffic(id, {
    route_name: `svc_${id.toLowerCase()}`, hits_24h: 100000 + i, qps: 10 + i, p95_latency_ms: p95
  }))
}

async function factory() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/v2/monitor', component: Monitor as any }]
  })
  await router.push('/v2/monitor')
  await router.isReady()
  const wrapper = mount(Monitor, { global: { plugins: [ElementPlus, createPinia(), i18n, router] } })
  await flushPromises()
  return { wrapper, router }
}

const one = (w: ReturnType<typeof mount>, tid: string) => w.find(`[data-testid="${tid}"]`)

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.fetchTrafficSummary.mockReset().mockResolvedValue(defaultTraffic())
  mocks.listRouteStatus.mockReset().mockResolvedValue(defaultStatus())
})

const KEYS = ['subtitle', 'kpiHits', 'kpiQps', 'kpiP95', 'kpiErrorRate', 'kpiConnections',
  'upstreamTitle', 'upOk', 'upBad', 'upBadCount', 'upstreamEmpty', 'upstreamFailed',
  'slowTitle', 'slowHint', 'slowEmpty', 'donutTitle', 'donutHint', 'donutEmpty',
  'snapshotHint', 'loadFailed'].map((k) => `v2.monitor.${k}`)

describe('v2 monitor — i18n key 全表双语存在（铁律 6，v2.monitor.* 新树）', () => {
  it.each(KEYS)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

describe('v2 monitor — 页头（标题复用 v2.page.monitor + 新 subtitle）', () => {
  it('mon-page 存在，含主标题与副标题文案', async () => {
    const { wrapper } = await factory()
    const page = one(wrapper, 'mon-page')
    expect(page.exists()).toBe(true)
    expect(page.text()).toContain(t('v2.page.monitor'))
    expect(page.text()).toContain(t('v2.monitor.subtitle'))
  })
})

describe('v2 monitor — KPI 5 卡（Σhits / Σqps / 均值P95 / 错误率 / Σ连接数）', () => {
  it('默认数据：1.7M / 474 / 187 ms / 0.93% / 400，五卡 label 来自 i18n（含字符串数值归一）', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-kpi-hits').text()).toContain(t('v2.monitor.kpiHits'))
    expect(one(wrapper, 'mon-kpi-hits').text()).toContain('1.7M')
    expect(one(wrapper, 'mon-kpi-qps').text()).toContain(t('v2.monitor.kpiQps'))
    expect(one(wrapper, 'mon-kpi-qps').text()).toContain('474')
    expect(one(wrapper, 'mon-kpi-p95').text()).toContain(t('v2.monitor.kpiP95'))
    expect(one(wrapper, 'mon-kpi-p95').text()).toMatch(/187\s*ms/)
    expect(one(wrapper, 'mon-kpi-error').text()).toContain(t('v2.monitor.kpiErrorRate'))
    expect(one(wrapper, 'mon-kpi-error').text()).toContain('0.93%')
    expect(one(wrapper, 'mon-kpi-connections').text()).toContain(t('v2.monitor.kpiConnections'))
    expect(one(wrapper, 'mon-kpi-connections').text()).toContain('400')
  })

  it('p95 全为 null → 平均 P95 卡显示 —（null 不参与均值）', async () => {
    mocks.fetchTrafficSummary.mockResolvedValue(defaultTraffic().map((r) => ({ ...r, p95_latency_ms: null })))
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-kpi-p95').text()).toContain('—')
  })

  it('traffic-summary 空数组 → hits/qps 为 0，p95/错误率为 —（分母 0），连接数 400 不受牵连', async () => {
    mocks.fetchTrafficSummary.mockResolvedValue([])
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-kpi-hits').text()).toContain('0')
    expect(one(wrapper, 'mon-kpi-qps').text()).toContain('0')
    expect(one(wrapper, 'mon-kpi-p95').text()).toContain('—')
    expect(one(wrapper, 'mon-kpi-error').text()).toContain('—')
    expect(one(wrapper, 'mon-kpi-connections').text()).toContain('400')
    expect(one(wrapper, 'mon-slow-empty').exists()).toBe(true)
    expect(one(wrapper, 'mon-donut-empty').exists()).toBe(true)
  })

  it('status_codes 全 0 → 错误率 0.00%（Σerrors=0 分母有值）+ donut 空态（Σ三桶=0）', async () => {
    mocks.fetchTrafficSummary.mockResolvedValue(defaultTraffic().map((r) => ({
      ...r, status_codes: { c2xx: 0, c4xx: 0, c5xx: 0 }
    })))
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-kpi-error').text()).toContain('0.00%')
    expect(one(wrapper, 'mon-donut-empty').exists()).toBe(true)
    expect(one(wrapper, 'mon-ring').exists()).toBe(false)
    expect(one(wrapper, 'mon-ring-total').exists()).toBe(false)
  })
})

describe('v2 monitor — snapshot 提示条（凡 source=snapshot 即显，宽松口径勿回退）', () => {
  it('s3 source=snapshot → mon-source-hint 出现', async () => {
    const { wrapper } = await factory()
    const hint = one(wrapper, 'mon-source-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain(t('v2.monitor.snapshotHint'))
  })

  it('全部 source=prometheus → 不出现提示条', async () => {
    mocks.fetchTrafficSummary.mockResolvedValue(defaultTraffic().map((r) => ({ ...r, source: 'prometheus' })))
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-source-hint').exists()).toBe(false)
  })
})

describe('v2 monitor — 上游健康（单上游降维，listRouteStatus 源；禁实例矩阵）', () => {
  it('行渲染：s1 可达·8ms / s2 不可达 / s3 可达·12ms / d1 无探测不入行；data-state ok/warn；不可达计数 1', async () => {
    const { wrapper } = await factory()
    const card = one(wrapper, 'mon-upstream-card')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain(t('v2.monitor.upstreamTitle'))
    const r1 = one(wrapper, 'mon-up-row-s1')
    expect(r1.text()).toContain(t('v2.monitor.upOk'))
    expect(r1.text()).toMatch(/8\s*ms/)
    expect(r1.text()).not.toContain(t('v2.monitor.upBad'))
    expect(r1.find('[data-state="ok"]').exists()).toBe(true)
    const r2 = one(wrapper, 'mon-up-row-s2')
    expect(r2.text()).toContain(t('v2.monitor.upBad'))
    expect(r2.find('[data-state="warn"]').exists()).toBe(true)
    expect(one(wrapper, 'mon-up-row-s3').text()).toMatch(/12\s*ms/)
    expect(one(wrapper, 'mon-up-row-d1').exists()).toBe(false)
    expect(one(wrapper, 'mon-up-bad').text()).toContain(tv('v2.monitor.upBadCount', 1))
  })

  it('可达占比 pbar 宽 67%（2/3）；listRouteStatus reject → mon-upstream-error + 行清空 + 连接数 —，traffic 区不被污染', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-up-pbar').attributes('style')).toContain('67%')

    mocks.listRouteStatus.mockRejectedValue(new Error('route status down'))
    const router2 = createRouter({ history: createMemoryHistory(), routes: [{ path: '/v2/monitor', component: Monitor as any }] })
    await router2.push('/v2/monitor')
    await router2.isReady()
    const w2 = mount(Monitor, { global: { plugins: [ElementPlus, createPinia(), i18n, router2] } })
    await flushPromises()
    const err = one(w2, 'mon-upstream-error')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain(t('v2.monitor.upstreamFailed'))
    expect(one(w2, 'mon-up-row-s1').exists()).toBe(false)
    expect(one(w2, 'mon-up-pbar').exists()).toBe(false)
    expect(one(w2, 'mon-up-bad').exists()).toBe(false)
    expect(one(w2, 'mon-kpi-connections').text()).toContain('—')
    // traffic 区不污染（Overview 先例：分区独立降级）
    expect(one(w2, 'mon-kpi-hits').text()).toContain('1.7M')
    expect(one(w2, 'mon-slow-row-s1').exists()).toBe(true)
    expect(one(w2, 'mon-bucket-c2xx').exists()).toBe(true)
    expect(one(w2, 'mon-error').exists()).toBe(false)
  })
})

describe('v2 monitor — 慢路由 Top5（p95 降序取 5 + 宽度 ∝ max + 红≥300/橙<300 两档）', () => {
  it('默认榜：s1(412ms,is-hot) → s2(112ms,is-warm) → s3(37ms,is-warm) → d1/s4（null → 值 — 无 pbar）', async () => {
    const { wrapper } = await factory()
    const card = one(wrapper, 'mon-slow-card')
    expect(card.text()).toContain(t('v2.monitor.slowTitle'))
    expect(card.text()).toContain(t('v2.monitor.slowHint'))
    const rows = wrapper.findAll('[data-testid^="mon-slow-row-"]')
    expect(rows.map((r) => r.attributes('data-testid'))).toEqual([
      'mon-slow-row-s1', 'mon-slow-row-s2', 'mon-slow-row-s3', 'mon-slow-row-d1', 'mon-slow-row-s4'
    ])
    expect(one(wrapper, 'mon-slow-val-s1').text()).toMatch(/412\s*ms/)
    expect(one(wrapper, 'mon-slow-pbar-s1').classes()).toContain('is-hot')
    expect(one(wrapper, 'mon-slow-val-s2').text()).toMatch(/112\s*ms/)
    expect(one(wrapper, 'mon-slow-pbar-s2').classes()).toContain('is-warm')
    expect(one(wrapper, 'mon-slow-pbar-s3').classes()).toContain('is-warm')
    expect(one(wrapper, 'mon-slow-val-d1').text()).toContain('—')
    expect(one(wrapper, 'mon-slow-pbar-d1').exists()).toBe(false)
    expect(one(wrapper, 'mon-slow-pbar-s4').exists()).toBe(false)
  })

  it('pbar 宽度 ∝ 榜内最大 p95：100% / 27%（112/412）/ 9%（37/412）', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-slow-pbar-s1').attributes('style')).toContain('100%')
    expect(one(wrapper, 'mon-slow-pbar-s2').attributes('style')).toContain('27%')
    expect(one(wrapper, 'mon-slow-pbar-s3').attributes('style')).toContain('9%')
  })

  it('7 行数据只取前 5：sA→sE 入榜（sE p95=300 恰在红档下边界 → is-hot），sF(250)/sG(null) 被 slice', async () => {
    mocks.fetchTrafficSummary.mockResolvedValue(slicedTraffic())
    const { wrapper } = await factory()
    const rows = wrapper.findAll('[data-testid^="mon-slow-row-"]')
    expect(rows.length).toBe(5)
    expect(rows.map((r) => r.attributes('data-testid'))).toEqual([
      'mon-slow-row-sA', 'mon-slow-row-sB', 'mon-slow-row-sC', 'mon-slow-row-sD', 'mon-slow-row-sE'
    ])
    expect(one(wrapper, 'mon-slow-row-sF').exists()).toBe(false)
    expect(one(wrapper, 'mon-slow-row-sG').exists()).toBe(false)
    expect(one(wrapper, 'mon-slow-pbar-sE').classes()).toContain('is-hot')
    expect(one(wrapper, 'mon-slow-pbar-sE').attributes('style')).toContain('33%')
  })
})

describe('v2 monitor — 状态码 donut（Σstatus_codes 三桶，dtl-ring SVG 自绘先例）', () => {
  it('中心总量 1.7M；三桶计数/占比（99.1% / 0.7% / 0.2%）；环图元素带 stroke-dasharray', async () => {
    const { wrapper } = await factory()
    const donut = one(wrapper, 'mon-donut')
    expect(donut.exists()).toBe(true)
    expect(donut.text()).toContain(t('v2.monitor.donutTitle'))
    expect(donut.text()).toContain(t('v2.monitor.donutHint'))
    const ring = one(wrapper, 'mon-ring')
    expect(ring.exists()).toBe(true)
    expect(ring.find('[stroke-dasharray]').exists()).toBe(true)
    expect(one(wrapper, 'mon-ring-total').text()).toContain('1.7M')
    const b2 = one(wrapper, 'mon-bucket-c2xx')
    const b4 = one(wrapper, 'mon-bucket-c4xx')
    const b5 = one(wrapper, 'mon-bucket-c5xx')
    expect(b2.text()).toContain('1.7M')
    expect(b2.text()).toMatch(/99\.1\s*%/)
    expect(b4.text()).toMatch(/12\s*k/)
    expect(b4.text()).toMatch(/0\.7\s*%/)
    expect(b5.text()).toMatch(/4\s*k/)
    expect(b5.text()).toMatch(/0\.2\s*%/)
  })
})

describe('v2 monitor — 分区独立降级（traffic-summary 源失败）', () => {
  it('fetchTrafficSummary reject → mon-error + traffic 四卡全 — + Top5/donut 空态；上游健康与连接数照常（listRouteStatus 独立可用）', async () => {
    mocks.fetchTrafficSummary.mockRejectedValue(new Error('prometheus down'))
    const { wrapper } = await factory()
    const err = one(wrapper, 'mon-error')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain(t('v2.monitor.loadFailed'))
    expect(one(wrapper, 'mon-kpi-hits').text()).toContain('—')
    expect(one(wrapper, 'mon-kpi-qps').text()).toContain('—')
    expect(one(wrapper, 'mon-kpi-p95').text()).toContain('—')
    expect(one(wrapper, 'mon-kpi-error').text()).toContain('—')
    expect(one(wrapper, 'mon-slow-empty').exists()).toBe(true)
    expect(one(wrapper, 'mon-slow-row-s1').exists()).toBe(false)
    expect(one(wrapper, 'mon-donut-empty').exists()).toBe(true)
    expect(one(wrapper, 'mon-ring').exists()).toBe(false)
    // listRouteStatus 区独立可用
    expect(one(wrapper, 'mon-up-row-s1').exists()).toBe(true)
    expect(one(wrapper, 'mon-up-pbar').attributes('style')).toContain('67%')
    expect(one(wrapper, 'mon-kpi-connections').text()).toContain('400')
  })

  it('两源同时 reject → 页面不崩，双错误条并存', async () => {
    mocks.fetchTrafficSummary.mockRejectedValue(new Error('prometheus down'))
    mocks.listRouteStatus.mockRejectedValue(new Error('route status down'))
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-page').exists()).toBe(true)
    expect(one(wrapper, 'mon-error').exists()).toBe(true)
    expect(one(wrapper, 'mon-upstream-error').exists()).toBe(true)
  })
})

describe('v2 monitor — 只读与 SDK-only 源码契约（S9a/S8 先例）', () => {
  it('只读大盘无写操作：无 act-* 按钮、源码无 http.post/put/patch/delete', async () => {
    const { wrapper } = await factory()
    expect(wrapper.findAll('[data-testid^="act-"]').length).toBe(0)
    expect(readSource()).not.toMatch(/http\.(post|put|patch|delete)/)
  })

  it('无 <el- 直用、无 echarts、template 无 CJK（文案一律 t()）', () => {
    const source = readSource()
    expect(source).not.toMatch(/<el-/)
    expect(source.toLowerCase()).not.toContain('echarts')
    expect(readTemplate()).not.toMatch(/[一-鿿　-〿！-～]/)
  })

  it("import 面钉死：@/api/v2 仅 fetchTrafficSummary、@/api/misc 仅 listRouteStatus（P4b-2 成员禁提前引入）", () => {
    const v2Import = readSource().match(/import\s*\{[^}]*\}\s*from\s*'@\/api\/v2'/)?.[0] ?? ''
    const miscImport = readSource().match(/import\s*\{[^}]*\}\s*from\s*'@\/api\/misc'/)?.[0] ?? ''
    expect(v2Import, '页面需从 @/api/v2 具名导入 fetchTrafficSummary').toBeTruthy()
    expect(v2Import).toContain('fetchTrafficSummary')
    expect(miscImport, '页面需从 @/api/misc 具名导入 listRouteStatus').toBeTruthy()
    expect(miscImport).toContain('listRouteStatus')
    for (const banned of [
      'fetchRouteTimeseries', 'fetchDecisionTree', 'getRouteTimeseries', 'getRouteMetrics',
      'getTopology', 'listAuditLogs', 'getSyncStatus', 'saveConfig', 'createUser', 'updateUser',
      'deleteUser', 'listRoutes'
    ]) {
      expect(`${v2Import}\n${miscImport}`, `禁用成员 ${banned} 出现在 import 面（越界/P4b-2 未到）`).not.toContain(banned)
    }
  })

  it('testid 前缀契约：template 内全部静态 data-testid 以 mon- 开头', () => {
    const tids = staticTestids()
    expect(tids.length, '页面应声明 mon-* testid（占位 stub 阶段此断言先红）').toBeGreaterThan(0)
    for (const tid of tids) {
      expect(tid.startsWith('mon-'), `testid ${tid} 不在 mon-* 前缀内`).toBe(true)
    }
  })
})

describe('v2 monitor — 砍除三区块 + delta（P4b 契约钉除，缺口不造数）', () => {
  // 契约演进（P4b-2b，T 裁决批准的唯一既有用例收窄）：P4b-1 临时 ban 的 peak/峰值 两 token
  // 已解除 —— 峰值@时刻由 P4b-2b 从网关级时序序列 max 真实推导补显（mon-kpi-peak +
  // peakQps key），属本步契约内容而非回退；alert/env/delta/instance/▲▼ 砍除区 ban 照旧。
  it('无告警表/环境 tabs/delta▲%：testid 与 v2.monitor.* key/value 三层皆无', async () => {
    const { wrapper } = await factory()
    for (const tid of staticTestids()) {
      expect(tid).not.toMatch(/alert|env|delta/i)
    }
    const keys = collectKeys(dig(zhCN, 'v2.monitor')).map((k) => k.toLowerCase())
    for (const key of keys) {
      expect(key.match(/alert|env|delta|instance/), `i18n key ${key} 落入砍除区`).toBeNull()
    }
    for (const val of collectValues(dig(zhCN, 'v2.monitor'))) {
      expect(val, `i18n 文案「${val}」落入砍除区`).not.toMatch(/告警|环境|▲|▼/)
    }
    expect(wrapper.text()).not.toMatch(/告警|环境|▲|▼/)
  })

  it('禁实例矩阵（S2 单上游语义）：无 instance/inst-* testid、无「实例」文案（原型 01/02/03 槽位不落实现）', async () => {
    const { wrapper } = await factory()
    for (const tid of staticTestids()) {
      expect(tid).not.toMatch(/instance|inst-/i)
    }
    for (const val of collectValues(dig(zhCN, 'v2.monitor'))) {
      expect(val, `i18n 文案「${val}」含实例矩阵语义`).not.toContain('实例')
    }
    expect(wrapper.text()).not.toContain('实例')
  })
})

// ═══════════════════ P4b-2b 时序图区（T 步追加，先红为预期）══════════════════
// 契约权威见文件头注「P4b-2b 追加段」；此处只落用例。mock 面：@/api/v2 增补
// fetchGatewayTimeseries 成员（api 尚不存在，C 步建函数 + 页面接线）。

const KEYS_P4B2B = ['chartQpsTitle', 'chartQpsHint', 'chartLatencyTitle', 'chartLatencyHint',
  'rangeLabel', 'range1h', 'range24h', 'range7d', 'peakQps', 'quantileFallbackHint',
  'chartEmpty', 'tsLoadFailed', 'sourcePrometheus', 'sourceSnapshot'].map((k) => `v2.monitor.${k}`)

// ── P4b-2b fixtures（后端 gatewayTimeseries 8 字段点契约，snake_case 原样透传）──────

/** 时序点工厂：timestamp = 今天本地 setHours(8+i, 4) → toISOString 往返（跨时区稳定）；
 * 峰值场景把 total_requests 钉在 i=2 的 512（@ 10:04 同日）。 */
function makeTsPoint(i: number, over: Record<string, unknown> = {}) {
  return {
    timestamp: new Date(new Date().setHours(8 + i, 4, 0, 0)).toISOString(),
    total_requests: 0, error_count: 0, error_rate: 0,
    avg_latency_ms: 12, p50_latency_ms: 10, p95_latency_ms: 40, p99_latency_ms: 80,
    ...over
  }
}

/** 默认 6 点 prometheus 响应（无 quantile_fallback）：total=[120,340,512,90,260,180] →
 * 峰值 512 @ 今日 10:04；QPS polyline 6 对坐标；延迟三线全有值。 */
function defaultGatewayTs() {
  const totals = [120, 340, 512, 90, 260, 180]
  return { source: 'prometheus', data_points: totals.map((n, i) => makeTsPoint(i, { total_requests: n })) }
}

/** FcSegmented 选项按钮：按 label 文案定位（Editor.test.ts segOption 先例） */
function segBtn(w: ReturnType<typeof mount>, tid: string, label: string) {
  return one(w, tid).findAll('button').find((b) => b.text().includes(label))
}

/** 图卡内「画出来的线」首根 polyline 的坐标对数组（Detail.test.ts drawnLines
 * 「points 非空 polyline」先例；jsdom 直读 points 属性抽样）。 */
function drawnPointPairs(w: ReturnType<typeof mount>, tid: string): string[] {
  const lines = one(w, tid).findAll('polyline').filter((p) => (p.attributes('points') ?? '').trim() !== '')
  return lines.length ? (lines[0].attributes('points') ?? '').trim().split(/\s+/) : []
}

// 既有 beforeEach 之后的第二钩子（registration 顺序在后，仅增补 gateway 时序默认 mock，
// 不动既有两源 stub）：P4b-2b 的时间范围默认 24h 档 → 参数 ('24h','1h')。
beforeEach(() => {
  mocks.fetchGatewayTimeseries.mockReset().mockResolvedValue(defaultGatewayTs())
})

describe('v2 monitor P4b-2b — i18n 追加 key 双语存在（铁律 6，v2.monitor.* 树延续）', () => {
  it.each(KEYS_P4B2B)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

describe('v2 monitor P4b-2b — 时序拉取与时间范围 seg（默认 24h/1h + 三档透传 + loadEpoch 竞态）', () => {
  it('挂载后调 gateway 时序端点恰一次，默认参数 (\'24h\',\'1h\') 双参显式透传；seg 三档渲染且默认选中 24h', async () => {
    const { wrapper } = await factory()
    expect(mocks.fetchGatewayTimeseries).toHaveBeenCalledTimes(1)
    expect(mocks.fetchGatewayTimeseries).toHaveBeenNthCalledWith(1, '24h', '1h')
    const seg = one(wrapper, 'mon-range-seg')
    expect(seg.exists(), '缺 mon-range-seg 时间范围分段控件').toBe(true)
    const labels = [t('v2.monitor.range1h'), t('v2.monitor.range24h'), t('v2.monitor.range7d')]
    expect(seg.findAll('button').map((b) => b.text().trim())).toEqual(labels)
    const active = seg.findAll('button').find((b) => b.classes().includes('is-active'))
    expect(active?.text().trim(), '默认选中档应为 24h').toBe(t('v2.monitor.range24h'))
  })

  it('点击 近1h → (\'1h\',\'1m\') 重拉；近7d → (\'7d\',\'1h\') 重拉（T 裁决粒度映射），选中态随迁', async () => {
    const { wrapper } = await factory()
    const seg = one(wrapper, 'mon-range-seg')
    expect(seg.exists(), '缺 mon-range-seg 时间范围分段控件').toBe(true)
    const pick = async (label: string) => {
      const btn = segBtn(wrapper, 'mon-range-seg', label)
      expect(btn, `缺少选项「${label}」`).toBeDefined()
      await btn!.trigger('click')
      await flushPromises()
    }
    await pick(t('v2.monitor.range1h'))
    expect(mocks.fetchGatewayTimeseries).toHaveBeenNthCalledWith(2, '1h', '1m')
    await pick(t('v2.monitor.range7d'))
    expect(mocks.fetchGatewayTimeseries).toHaveBeenNthCalledWith(3, '7d', '1h')
    expect(mocks.fetchGatewayTimeseries).toHaveBeenCalledTimes(3)
    const active = seg.findAll('button').find((b) => b.classes().includes('is-active'))
    expect(active?.text().trim()).toBe(t('v2.monitor.range7d'))
  })

  it('loadEpoch 竞态：慢 24h 挂起时切 1h 先返回者胜；慢 24h 后到不覆盖（List.load-epoch 先例随迁）', async () => {
    const slowData = defaultGatewayTs()
    let resolveSlow!: (v: unknown) => void
    mocks.fetchGatewayTimeseries.mockImplementation((range: string) => {
      if (range === '24h') return new Promise((r) => { resolveSlow = () => r(slowData) })
      return Promise.resolve({ source: 'prometheus', data_points: [makeTsPoint(0, { total_requests: 11 }), makeTsPoint(1, { total_requests: 22 }), makeTsPoint(2, { total_requests: 33 })] })
    })
    const { wrapper } = await factory()
    await flushPromises()
    expect(drawnPointPairs(wrapper, 'mon-chart-qps')).toHaveLength(0)
    const btn = segBtn(wrapper, 'mon-range-seg', t('v2.monitor.range1h'))
    expect(btn, '缺近 1 小时选项').toBeDefined()
    await btn!.trigger('click')
    await flushPromises()
    expect(drawnPointPairs(wrapper, 'mon-chart-qps')).toHaveLength(3)
    resolveSlow(slowData)
    await flushPromises()
    expect(drawnPointPairs(wrapper, 'mon-chart-qps'), '陈旧 24h 响应后到不得覆盖').toHaveLength(3)
    expect(mocks.fetchGatewayTimeseries).toHaveBeenCalledTimes(2)
  })
})

describe('v2 monitor P4b-2b — QPS 面积图（网关级 total 单线，原型 08 双线降单线）', () => {
  it('svg + 单 polyline 存在且点数=序列长度（6 对 x,y 坐标）+ 面积 path 闭包（d 含 Z 收口 + fill）', async () => {
    const { wrapper } = await factory()
    const card = one(wrapper, 'mon-chart-qps')
    expect(card.exists(), '缺 mon-chart-qps 图卡').toBe(true)
    expect(card.find('svg').exists()).toBe(true)
    const lines = card.findAll('polyline').filter((p) => (p.attributes('points') ?? '').trim() !== '')
    expect(lines.length).toBe(1)
    const pairs = drawnPointPairs(wrapper, 'mon-chart-qps')
    expect(pairs, 'polyline 坐标对数应=序列长度 6').toHaveLength(6)
    for (const pair of pairs) {
      expect(pair).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    }
    const area = card.find('path[fill]')
    expect(area.exists(), '缺面积 path（原型 08 闭包 fill 形态）').toBe(true)
    expect(area.attributes('d') ?? '').toMatch(/Z\s*$/)
  })

  it('空序列 → 两张图卡各显 chartEmpty 空态文案、无 polyline（不白屏）；峰值 —', async () => {
    mocks.fetchGatewayTimeseries.mockResolvedValue({ source: 'prometheus', data_points: [] })
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-chart-qps').text()).toContain(t('v2.monitor.chartEmpty'))
    expect(one(wrapper, 'mon-chart-latency').text()).toContain(t('v2.monitor.chartEmpty'))
    expect(one(wrapper, 'mon-chart-qps').findAll('polyline').length).toBe(0)
    expect(one(wrapper, 'mon-chart-latency').findAll('polyline').length).toBe(0)
    expect(one(wrapper, 'mon-kpi-peak').text()).toContain('—')
    expect(one(wrapper, 'mon-kpi-peak').text()).not.toContain('@')
  })

  it('单线裁决：卡内画线 polyline 恰 1 + hint 含「单线」+ 源码无「上游转发」双线语义（原型双线不造数）', async () => {
    const { wrapper } = await factory()
    const card = one(wrapper, 'mon-chart-qps')
    expect(card.exists(), '缺 mon-chart-qps 图卡').toBe(true)
    expect(card.findAll('polyline').filter((p) => (p.attributes('points') ?? '').trim() !== '').length).toBe(1)
    expect(card.text()).toContain(t('v2.monitor.chartQpsHint'))
    expect(t('v2.monitor.chartQpsHint'), 'hint 文案本身应带「单线」语义').toContain('单线')
    expect(readSource()).not.toContain('上游转发')
  })
})

describe('v2 monitor P4b-2b — 延迟分位图（p50/p95/p99 三线 + quantile_fallback 退化提示）', () => {
  it('三条 polyline 以 data-quantile=p50/p95/p99 各自可辨且 points 非空；图例字面量 P50/P95/P99（dtl-legend 先例）', async () => {
    const { wrapper } = await factory()
    const card = one(wrapper, 'mon-chart-latency')
    expect(card.exists(), '缺 mon-chart-latency 图卡').toBe(true)
    expect(card.find('svg').exists()).toBe(true)
    expect(card.findAll('polyline').length).toBe(3)
    for (const q of ['p50', 'p95', 'p99']) {
      const line = card.find(`polyline[data-quantile="${q}"]`)
      expect(line.exists(), `缺 ${q} 分位线`).toBe(true)
      expect((line.attributes('points') ?? '').trim()).not.toBe('')
    }
    for (const label of ['P50', 'P95', 'P99']) {
      expect(card.text()).toContain(label)
    }
  })

  it('quantile_fallback=true → mon-quantile-fallback 提示条（分位按 avg 退化文案）；三线照画（有值非 null 占位）', async () => {
    mocks.fetchGatewayTimeseries.mockResolvedValue({ ...defaultGatewayTs(), quantile_fallback: true })
    const { wrapper } = await factory()
    const hint = one(wrapper, 'mon-quantile-fallback')
    expect(hint.exists(), 'quantile_fallback=true 应出退化提示条').toBe(true)
    expect(hint.text()).toContain(t('v2.monitor.quantileFallbackHint'))
    expect(one(wrapper, 'mon-chart-latency').findAll('polyline').length).toBe(3)
  })

  it('quantile_fallback 缺省（prometheus 正常）→ 无退化提示条', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-quantile-fallback').exists()).toBe(false)
  })
})

describe('v2 monitor P4b-2b — KPI 峰值@时刻（序列 max 推导，旧 chart-axis 跨天口径随迁）', () => {
  it('非空序列 → mon-kpi-peak 显 max(total_requests)=512 @ 同日 10:04（HH:mm，无日期前缀）', async () => {
    const { wrapper } = await factory()
    const peak = one(wrapper, 'mon-kpi-peak')
    expect(peak.exists(), '缺 mon-kpi-peak 峰值卡').toBe(true)
    expect(peak.text()).toContain(t('v2.monitor.peakQps'))
    expect(peak.text()).toMatch(/512\s*@\s*10:04/)
    expect(peak.text()).not.toMatch(/\d{2}-\d{2}\s/)
  })

  it('峰值时间戳跨天（2 天前）→ @时刻带日期前缀 MM-DD HH:mm（旧 Index.chart-axis 口径）', async () => {
    const d = new Date()
    d.setDate(d.getDate() - 2)
    d.setHours(9, 30, 0, 0)
    mocks.fetchGatewayTimeseries.mockResolvedValue({
      source: 'prometheus',
      data_points: [makeTsPoint(0, { total_requests: 512, timestamp: d.toISOString() })]
    })
    const { wrapper } = await factory()
    const peak = one(wrapper, 'mon-kpi-peak')
    expect(peak.exists(), '缺 mon-kpi-peak 峰值卡').toBe(true)
    const p = (x: number) => String(x).padStart(2, '0')
    expect(peak.text()).toMatch(new RegExp(`512\\s*@\\s*${p(d.getMonth() + 1)}-${p(d.getDate())} 09:30`))
  })
})

describe('v2 monitor P4b-2b — 降级无混布与 source 徽标（网关级无旧端点可回退）', () => {
  it('fetchGatewayTimeseries reject（404/500 同途）→ mon-ts-error 错误条 + 图区空态不白屏 + 峰值 —；traffic 区不被污染', async () => {
    mocks.fetchGatewayTimeseries.mockRejectedValue(new Error('HTTP 500'))
    const { wrapper } = await factory()
    const err = one(wrapper, 'mon-ts-error')
    expect(err.exists(), '缺 mon-ts-error 错误条').toBe(true)
    expect(err.text()).toContain(t('v2.monitor.tsLoadFailed'))
    expect(one(wrapper, 'mon-page').exists()).toBe(true)
    expect(one(wrapper, 'mon-chart-qps').text()).toContain(t('v2.monitor.chartEmpty'))
    expect(one(wrapper, 'mon-chart-latency').text()).toContain(t('v2.monitor.chartEmpty'))
    expect(one(wrapper, 'mon-kpi-peak').text()).toContain('—')
    expect(one(wrapper, 'mon-ts-source').exists()).toBe(false)
    expect(one(wrapper, 'mon-quantile-fallback').exists()).toBe(false)
    expect(one(wrapper, 'mon-ts-error').findAll('polyline').length).toBe(0)
    // 分区独立降级（Overview 先例）：traffic 源的 KPI/慢路由不陪葬
    expect(one(wrapper, 'mon-kpi-hits').text()).toContain('1.7M')
    expect(one(wrapper, 'mon-slow-row-s1').exists()).toBe(true)
  })

  it('source 徽标双态：prometheus → sourcePrometheus + data-state=prometheus；snapshot → sourceSnapshot + data-state=snapshot（且 snapshot 不带 quantile_fallback → 无退化提示条）', async () => {
    const { wrapper } = await factory()
    const badge = one(wrapper, 'mon-ts-source')
    expect(badge.exists(), '缺 mon-ts-source 徽标').toBe(true)
    expect(badge.text()).toContain(t('v2.monitor.sourcePrometheus'))
    expect(badge.attributes('data-state')).toBe('prometheus')

    mocks.fetchGatewayTimeseries.mockResolvedValue({ ...defaultGatewayTs(), source: 'snapshot' })
    const second = await factory()
    const badge2 = one(second.wrapper, 'mon-ts-source')
    expect(badge2.exists()).toBe(true)
    expect(badge2.text()).toContain(t('v2.monitor.sourceSnapshot'))
    expect(badge2.attributes('data-state')).toBe('snapshot')
    expect(one(second.wrapper, 'mon-quantile-fallback').exists()).toBe(false)
  })

  it('无混布裁决（与旧页差异，头注钉死）：import 面含 fetchGatewayTimeseries；源码无旧 /metrics、/timeseries 端点与回退函数字样', () => {
    const source = readSource()
    const v2Import = source.match(/import\s*\{[^}]*\}\s*from\s*'@\/api\/v2'/)?.[0] ?? ''
    expect(v2Import, '页面需从 @/api/v2 具名导入 fetchGatewayTimeseries').toContain('fetchGatewayTimeseries')
    expect(source).not.toMatch(/getRouteTimeseries|getRouteMetrics|fetchRouteTimeseries/)
    expect(source).not.toMatch(/\/v1\/monitor\/timeseries|\/v1\/monitor\/routes\/.*\/metrics/)
  })
})

// ═══════════════════ P4b-3 实时化（T 步追加，先红为预期）══════════════════
// 契约权威见文件头注「P4b-3 实时化追加段」（含 SSE 摘要呈现 / 降级终态 / autoRefresh /
// 定向刷新 / visibilitychange 五裁决）；此处只落用例。mock 面：新增整模块
// vi.mock('@/composables/useMonitorStream')（async 工厂 + 真 Vue ref，见头注 mock 策略段）。

const KEYS_P4B3 = ['autoRefresh', 'lastRefresh', 'streamSummaryTitle', 'streamLive',
  'streamPolling', 'streamRoutes', 'streamErrors', 'streamRequests'].map((k) => `v2.monitor.${k}`)

/** SSE metrics 摘要 payload（后端 MonitorStreamService#buildSummary 权威形状，Long→String
 * 契约下数值可能以字符串到达） */
function streamMetrics(over: Record<string, unknown> = {}) {
  return { routes_total: 7, error_count: 2, total_requests: 1234, at: 1797000000000, ...over }
}

/** 取 fake composable 句柄（页面未接线 useMonitorStream 时给出可读失败，而非 TypeError） */
function streamHandle(): any {
  const h = mocks.stream.last
  expect(h, '页面尚未接线 useMonitorStream（P4b-3 未实现）— 挂载后应拿到 fake 句柄').not.toBeNull()
  return h
}

describe('v2 monitor P4b-3 — i18n 追加 key 双语存在（铁律 6，v2.monitor.* 树延续）', () => {
  it.each(KEYS_P4B3)('%s 在 zh-CN 与 en-US 都存在', (key) => {
    expect(dig(zhCN, key), `zh-CN 缺少 ${key}`).toBeDefined()
    expect(dig(enUS, key), `en-US 缺少 ${key}`).toBeDefined()
  })
})

describe('v2 monitor P4b-3 — SSE 订阅生命周期与实时摘要条（裁决：摘要不覆盖 KPI 五卡）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 7, 8, 0, 0))
    mocks.stream.calls = { start: 0, stop: 0, dispose: 0 }
    mocks.useMonitorStream.mockClear()
  })
  afterEach(() => { vi.useRealTimers() })

  it('挂载 → useMonitorStream 恰调一次、start 恰一次（订阅即起）；onMetrics/onConfigChanged/onFallback 三回调齐备', async () => {
    const { wrapper } = await factory()
    expect(mocks.useMonitorStream).toHaveBeenCalledTimes(1)
    expect(mocks.stream.calls.start, '挂载即应 start 订阅').toBe(1)
    const o = mocks.stream.opts
    expect(o, '页面未把 options 传给 useMonitorStream').toBeTruthy()
    expect(o!.onMetrics).toBeTypeOf('function')
    expect(o!.onConfigChanged).toBeTypeOf('function')
    expect(o!.onFallback).toBeTypeOf('function')
    wrapper.unmount()
  })

  it('open → data-state=live + streamLive；metrics 摘要到达 → 三徽标值（字符串数值归一 + formatHits）；再次推送覆盖旧值', async () => {
    const { wrapper } = await factory()
    const s = streamHandle()
    s.__open()
    await flushPromises()
    const badge = one(wrapper, 'mon-stream-badge')
    expect(badge.exists(), '缺 mon-stream-badge 实时摘要条').toBe(true)
    expect(badge.text()).toContain(t('v2.monitor.streamSummaryTitle'))
    expect(badge.attributes('data-state')).toBe('live')
    expect(badge.text()).toContain(t('v2.monitor.streamLive'))
    s.__metrics(streamMetrics({ routes_total: '7', error_count: '2', total_requests: '1234567' }))
    await flushPromises()
    expect(one(wrapper, 'mon-badge-routes').text()).toContain(t('v2.monitor.streamRoutes'))
    expect(one(wrapper, 'mon-badge-routes').text()).toContain('7')
    expect(one(wrapper, 'mon-badge-errors').text()).toContain(t('v2.monitor.streamErrors'))
    expect(one(wrapper, 'mon-badge-errors').text()).toContain('2')
    expect(one(wrapper, 'mon-badge-requests').text()).toContain(t('v2.monitor.streamRequests'))
    expect(one(wrapper, 'mon-badge-requests').text()).toContain('1.2M')
    s.__metrics(streamMetrics({ routes_total: 9, error_count: 4 }))
    await flushPromises()
    expect(one(wrapper, 'mon-badge-routes').text()).toContain('9')
    expect(one(wrapper, 'mon-badge-errors').text()).toContain('4')
    wrapper.unmount()
  })

  it('SSE 摘要不覆盖 P4b-1 五 KPI 卡（字段不同源不同——头注裁决）：大数值摘要到达后 hits/qps/connections 照旧', async () => {
    const { wrapper } = await factory()
    const s = streamHandle()
    s.__open()
    s.__metrics(streamMetrics({ routes_total: 3, error_count: 1, total_requests: 99999999 }))
    await flushPromises()
    expect(one(wrapper, 'mon-kpi-hits').text()).toContain('1.7M')
    expect(one(wrapper, 'mon-kpi-qps').text()).toContain('474')
    expect(one(wrapper, 'mon-kpi-connections').text()).toContain('400')
    wrapper.unmount()
  })

  it('未收到摘要（含 sse 已 open）→ 三徽标 —（不造数）', async () => {
    const { wrapper } = await factory()
    streamHandle().__open()
    await flushPromises()
    for (const tid of ['mon-badge-routes', 'mon-badge-errors', 'mon-badge-requests']) {
      expect(one(wrapper, tid).text()).toContain('—')
    }
    wrapper.unmount()
  })

  it('卸载 → dispose 被调（页面级断连契约；与真实 composable 的内部 onUnmounted(dispose) 幂等共存）', async () => {
    const { wrapper } = await factory()
    streamHandle()
    expect(mocks.stream.calls.dispose).toBe(0)
    wrapper.unmount()
    expect(mocks.stream.calls.dispose).toBeGreaterThanOrEqual(1)
  })
})

describe('v2 monitor P4b-3 — 降级兜底（onFallback → 5s 轮询；降级终态无 SSE 恢复路径）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 7, 8, 0, 0))
    mocks.stream.calls = { start: 0, stop: 0, dispose: 0 }
    mocks.useMonitorStream.mockClear()
  })
  afterEach(() => { vi.useRealTimers() })

  it('onFallback → data-state=polling + streamPolling + 摘要清空回 —（旧 Index 清陈旧摘要先例）；快进 5s → 三源各重拉一次', async () => {
    const { wrapper } = await factory()
    const s = streamHandle()
    s.__open()
    s.__metrics(streamMetrics())
    await flushPromises()
    const c0 = {
      traffic: mocks.fetchTrafficSummary.mock.calls.length,
      status: mocks.listRouteStatus.mock.calls.length,
      ts: mocks.fetchGatewayTimeseries.mock.calls.length
    }
    s.__fail('error')
    await flushPromises()
    const badge = one(wrapper, 'mon-stream-badge')
    expect(badge.attributes('data-state')).toBe('polling')
    expect(badge.text()).toContain(t('v2.monitor.streamPolling'))
    expect(one(wrapper, 'mon-badge-routes').text()).toContain('—')
    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(mocks.fetchTrafficSummary.mock.calls.length).toBe(c0.traffic + 1)
    expect(mocks.listRouteStatus.mock.calls.length).toBe(c0.status + 1)
    expect(mocks.fetchGatewayTimeseries.mock.calls.length).toBe(c0.ts + 1)
    wrapper.unmount()
  })

  it('降级终态裁决（无 SSE 恢复路径）：持续轮询（再快进 5s 再拉）且 stream.start 不重入（「polling owns the loop」）', async () => {
    const { wrapper } = await factory()
    streamHandle().__fail('error')
    await flushPromises()
    const c0 = mocks.fetchTrafficSummary.mock.calls.length
    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(mocks.fetchTrafficSummary.mock.calls.length).toBe(c0 + 1)
    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(mocks.fetchTrafficSummary.mock.calls.length).toBe(c0 + 2)
    expect(mocks.stream.calls.start, '降级后 start 不得重入（真实 composable 在 polling 态 no-op）').toBe(1)
    wrapper.unmount()
  })

  it('autoRefresh 关时降级 → 不起轮询（快进 5s 不拉；旧 Index onFallback autoRefresh 门控同款）', async () => {
    const { wrapper } = await factory()
    const sw = one(wrapper, 'mon-autorefresh-switch').find('[role="switch"]')
    await sw.trigger('click')
    await flushPromises()
    const c0 = mocks.fetchTrafficSummary.mock.calls.length
    streamHandle().__fail('error')
    await flushPromises()
    expect(one(wrapper, 'mon-stream-badge').attributes('data-state')).toBe('polling')
    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(mocks.fetchTrafficSummary.mock.calls.length).toBe(c0)
    wrapper.unmount()
  })
})

describe('v2 monitor P4b-3 — config_changed 定向刷新（2s 去抖归 composable，页面消费已去抖回调）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 7, 8, 0, 0))
    mocks.stream.calls = { start: 0, stop: 0, dispose: 0 }
    mocks.useMonitorStream.mockClear()
  })
  afterEach(() => { vi.useRealTimers() })

  it('到达 → 2s 去抖后定向重拉：traffic+timeseries 恰 +1 各；listRouteStatus 不随拉（定向裁决）；lastRefresh 更新', async () => {
    const { wrapper } = await factory()
    const s = streamHandle()
    s.__open()
    await flushPromises()
    const c0 = {
      traffic: mocks.fetchTrafficSummary.mock.calls.length,
      status: mocks.listRouteStatus.mock.calls.length,
      ts: mocks.fetchGatewayTimeseries.mock.calls.length
    }
    s.__configChanged({ type: 'route', at: 1797000000000 })
    vi.advanceTimersByTime(1999)
    await flushPromises()
    expect(mocks.fetchTrafficSummary.mock.calls.length).toBe(c0.traffic)
    expect(mocks.fetchGatewayTimeseries.mock.calls.length).toBe(c0.ts)
    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(mocks.fetchTrafficSummary.mock.calls.length).toBe(c0.traffic + 1)
    expect(mocks.fetchGatewayTimeseries.mock.calls.length).toBe(c0.ts + 1)
    expect(mocks.listRouteStatus.mock.calls.length).toBe(c0.status)
    expect(one(wrapper, 'mon-last-refresh').text()).toContain('08:00:02')
    wrapper.unmount()
  })

  it('去抖窗口内多次到达只拉一轮：3 次 config_changed → 2s 后 traffic/timeseries 恰 +1 各（末次胜出由 composable 去抖保证）', async () => {
    const { wrapper } = await factory()
    const s = streamHandle()
    s.__open()
    await flushPromises()
    const c0 = {
      traffic: mocks.fetchTrafficSummary.mock.calls.length,
      ts: mocks.fetchGatewayTimeseries.mock.calls.length
    }
    s.__configChanged({ type: 'route' })
    s.__configChanged({ type: 'plugin' })
    s.__configChanged({ type: 'global-plugin' })
    vi.advanceTimersByTime(2000)
    await flushPromises()
    expect(mocks.fetchTrafficSummary.mock.calls.length).toBe(c0.traffic + 1)
    expect(mocks.fetchGatewayTimeseries.mock.calls.length).toBe(c0.ts + 1)
    wrapper.unmount()
  })

  it('options 契约（零改动复用）：页面不得覆写 configDebounceMs（composable 默认 2000 生效）', async () => {
    const { wrapper } = await factory()
    expect(mocks.useMonitorStream, '页面需先接线 useMonitorStream 再谈 options 契约').toHaveBeenCalledTimes(1)
    const o = mocks.stream.opts
    expect(o, '页面未把 options 传给 useMonitorStream').toBeTruthy()
    expect(o!.configDebounceMs, '覆写 configDebounceMs 破坏零改动复用（默认 2s 去抖）').toBeUndefined()
    wrapper.unmount()
  })
})

describe('v2 monitor P4b-3 — autoRefresh FcSwitch + lastRefresh（HH:mm:ss，禁 toLocaleTimeString）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 7, 8, 0, 0))
    mocks.stream.calls = { start: 0, stop: 0, dispose: 0 }
    mocks.useMonitorStream.mockClear()
  })
  afterEach(() => { vi.useRealTimers() })

  it('默认开：挂载首轮拉取即有 lastRefresh 08:00:00（HH:mm:ss）；快进 5s → 三源各重拉一次且 lastRefresh 更新 08:00:05', async () => {
    const { wrapper } = await factory()
    const lr = one(wrapper, 'mon-last-refresh')
    expect(lr.exists(), '缺 mon-last-refresh').toBe(true)
    expect(lr.text()).toContain(t('v2.monitor.lastRefresh').replace('{time}', '').trim())
    expect(lr.text(), '挂载首轮拉取后即应有时钟').toContain('08:00:00')
    expect(lr.text()).toMatch(/\d{2}:\d{2}:\d{2}/)
    const c0 = {
      traffic: mocks.fetchTrafficSummary.mock.calls.length,
      status: mocks.listRouteStatus.mock.calls.length,
      ts: mocks.fetchGatewayTimeseries.mock.calls.length
    }
    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(mocks.fetchTrafficSummary.mock.calls.length).toBe(c0.traffic + 1)
    expect(mocks.listRouteStatus.mock.calls.length).toBe(c0.status + 1)
    expect(mocks.fetchGatewayTimeseries.mock.calls.length).toBe(c0.ts + 1)
    expect(one(wrapper, 'mon-last-refresh').text()).toContain('08:00:05')
    wrapper.unmount()
  })

  it('关 → 快进 5s 不拉、aria-checked=false；再开 → 恢复（新 interval 整周期 5s，无立即拉取，旧 Index 先例）+ autoRefresh 文案', async () => {
    const { wrapper } = await factory()
    expect(one(wrapper, 'mon-stream-badge').text()).toContain(t('v2.monitor.autoRefresh'))
    const sw = () => one(wrapper, 'mon-autorefresh-switch').find('[role="switch"]')
    expect(sw().exists(), 'mon-autorefresh-switch wrapper 内应有 FcSwitch（role=switch）').toBe(true)
    expect(sw().attributes('aria-checked')).toBe('true')
    await sw().trigger('click')
    await flushPromises()
    expect(sw().attributes('aria-checked')).toBe('false')
    const c0 = mocks.fetchTrafficSummary.mock.calls.length
    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(mocks.fetchTrafficSummary.mock.calls.length).toBe(c0)
    await sw().trigger('click')
    await flushPromises()
    expect(sw().attributes('aria-checked')).toBe('true')
    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(mocks.fetchTrafficSummary.mock.calls.length).toBe(c0 + 1)
    wrapper.unmount()
  })

  it('源码断言：lastRefresh 经 fmtClock 更新、禁 toLocaleTimeString（旧 Index.last-refresh P0-2 模式继承）', () => {
    const source = readSource()
    expect(source).not.toMatch(/toLocaleTimeString/)
    expect(source, '页面应定义 fmtClock（24h HH:mm:ss 手写 pad，同旧 Index 先例）').toMatch(/fmtClock/)
    expect(source).toMatch(/lastRefresh\.value\s*=\s*fmtClock\(/)
  })
})

describe('v2 monitor P4b-3 — visibilitychange（裁决：只 SSE 层，页面级 interval 不做可见性暂停）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 7, 8, 0, 0))
    mocks.stream.calls = { start: 0, stop: 0, dispose: 0 }
    mocks.useMonitorStream.mockClear()
  })
  afterEach(() => { vi.useRealTimers() })

  it('源码断言：Monitor.vue 无 visibilitychange/visibilityState/document.hidden——SSE 层暂停/恢复归 useMonitorStream（其自身测试组已覆盖），页面不重复实现', () => {
    expect(readSource()).not.toMatch(/visibilitychange|visibilityState|document\.hidden/)
  })

  it('页面 interval 不因 hidden 停（旧 Index 无页面级暂停先例随迁）：hidden 派发后快进 5s 照常重拉', async () => {
    const { wrapper } = await factory()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    const c0 = mocks.fetchTrafficSummary.mock.calls.length
    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(mocks.fetchTrafficSummary.mock.calls.length).toBe(c0 + 1)
    wrapper.unmount()
  })
})
