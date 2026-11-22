package fun.commons.gateway4j.plugin.builtins.watermark;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.reactivestreams.Publisher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DefaultDataBufferFactory;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponseDecorator;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;

/**
 * 安全水印插件。拦截 HTML 响应，在 </body> 前注入水印脚本（缺省内联 IIFE 自包含执行；
 * 显式配置 scriptUrl 时改为外链引导）。
 *
 * <p>脚本能力（契约 §9）：canvas translate/rotate 平铺双行文案（主文案 + 0.8 倍字号副文案）；
 * 读取会话 cookie（缺省 fu-gw-token，对齐钉钉插件，config.sessionCookieName 可参数化）解
 * JWT payload（base64 无验签）取 nick/mobile，命中 nick 时主文案换为「org+内部数据 严禁外泄」、
 * 副文案为「脱敏姓名(首字+*+slice(2)) + 脱敏手机(前3+****+后4) + 自 2000-01-01 天数 +
 * CRC16(0xA001 低字节 hex 大写) 校验码」，无 nick 回落静态文案；MutationObserver 监听
 * removedNodes 防删即重建；iframe 父子页 postMessage 协同（子页 2s 轮询 watermarkCheck、
 * 父页应答 hasWatermark、父页有水印则子页延迟初始化后自毁）；resize 重绘。</p>
 *
 * <p>CSP 头按需剥离：stripCsp=false（缺省）保留 Content-Security-Policy；true 时仅在
 * 注入路径删除。非 HTML（含 SSE text/event-stream）与超限响应透传路径一律不动 CSP 头。</p>
 */
public class WatermarkPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(WatermarkPlugin.class);

    private static final String CSP_HEADER = "Content-Security-Policy";

    /** 水印图层 DOM id。 */
    private static final String MARK_ID = "gw-watermark";
    /** 外链引导引用的全局构造器名（保持既有 scriptUrl 用户兼容）。 */
    private static final String EXTERNAL_GLOBAL_NAME = "FuSecurityWatermark";
    /** 外链引导的防重复实例化全局开关名。 */
    private static final String EXTERNAL_GUARD = "_fswm";

    /**
     * 内联水印脚本主体（IIFE 内部，前置 var cfg={...} 由 buildScriptTag 注入）。
     * 禁止依赖外部资源，自包含执行。
     */
    private static final String INLINE_SCRIPT_BODY = """
            var mainText = cfg.org + '内部系统';
            var subText = '未经授权 禁止外传';
            var destroyed = false;
            function getCookie(name) {
              var raw = '; ' + document.cookie;
              var parts = raw.split('; ' + name + '=');
              return parts.length === 2 ? parts.pop().split(';').shift() : null;
            }
            function parseJwtPayload(token) {
              try {
                var seg = token.split('.')[1];
                if (!seg) {
                  return null;
                }
                var b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
                var json = decodeURIComponent(atob(b64).split('').map(function (ch) {
                  return '%' + ('00' + ch.charCodeAt(0).toString(16)).slice(-2);
                }).join(''));
                return JSON.parse(json);
              } catch (e) {
                return null;
              }
            }
            function crc16(str) {
              var crc = 0xFFFF;
              for (var i = 0; i < str.length; i++) {
                crc ^= str.charCodeAt(i);
                for (var j = 0; j < 8; j++) {
                  crc = (crc & 1) ? (crc >>> 1) ^ 0xA001 : crc >>> 1;
                }
              }
              return (crc & 0xFF).toString(16).padStart(2, '0').toUpperCase();
            }
            function maskName(name) {
              return name.length >= 2 ? name[0] + '*' + name.slice(2) : name;
            }
            function maskMobile(mobile) {
              return mobile.length >= 11 ? mobile.slice(0, 3) + '****' + mobile.slice(-4) : mobile;
            }
            function resolveIdentity() {
              try {
                var token = getCookie(cfg.cookieName);
                if (!token) {
                  return;
                }
                var payload = parseJwtPayload(token);
                if (!payload || !payload.nick) {
                  return;
                }
                mainText = cfg.org + '内部数据 严禁外泄';
                var days = Math.floor((Date.now() - new Date('2000-01-01').getTime()) / 86400000);
                var line = maskName(String(payload.nick)) + ' ' + maskMobile(String(payload.mobile || '')) + ' ' + days;
                subText = line + ' ' + crc16(line);
              } catch (e) {
              }
            }
            function createPattern() {
              var canvas = document.createElement('canvas');
              canvas.width = cfg.width;
              canvas.height = cfg.height;
              var ctx = canvas.getContext('2d');
              ctx.font = cfg.fontSize + 'px sans-serif';
              ctx.fillStyle = cfg.color;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.translate(canvas.width / 2, canvas.height / 2);
              ctx.rotate(cfg.rotate * Math.PI / 180);
              ctx.translate(-canvas.width / 2, -canvas.height / 2);
              ctx.fillText(mainText, canvas.width / 2, canvas.height / 2 - cfg.fontSize / 1.8);
              ctx.font = (cfg.fontSize * 0.8) + 'px sans-serif';
              ctx.fillText(subText, canvas.width / 2, canvas.height / 2 + cfg.fontSize / 1.8);
              return canvas.toDataURL();
            }
            function render() {
              if (destroyed) {
                return null;
              }
              var layer = document.getElementById(cfg.markId);
              if (!layer) {
                layer = document.createElement('div');
                layer.id = cfg.markId;
                var s = layer.style;
                s.position = 'fixed';
                s.top = '0';
                s.left = '0';
                s.width = '100%';
                s.height = '100%';
                s.pointerEvents = 'none';
                s.zIndex = '99999';
                s.backgroundRepeat = 'repeat';
                document.body.appendChild(layer);
              }
              layer.style.backgroundImage = 'url(' + createPattern() + ')';
              return layer;
            }
            function observeDOM() {
              new MutationObserver(function (mutations) {
                if (destroyed) {
                  return;
                }
                for (var i = 0; i < mutations.length; i++) {
                  var removed = mutations[i].removedNodes;
                  for (var j = 0; j < removed.length; j++) {
                    if (removed[j] && removed[j].id === cfg.markId) {
                      render();
                      return;
                    }
                  }
                }
              }).observe(document.body, { childList: true, subtree: true });
            }
            function destroy() {
              destroyed = true;
              var layer = document.getElementById(cfg.markId);
              if (layer) {
                layer.remove();
              }
            }
            function inTopWindow() {
              try {
                return window.self === window.top;
              } catch (e) {
                return false;
              }
            }
            resolveIdentity();
            if (inTopWindow()) {
              window.addEventListener('message', function (e) {
                if (e.data && e.data.type === 'watermarkCheck') {
                  e.source.postMessage({ type: 'hasWatermark', value: !!document.getElementById(cfg.markId) }, '*');
                }
              });
              render();
              observeDOM();
              window.addEventListener('resize', function () {
                render();
              });
            } else {
              var parentKnown = false;
              try {
                if (window.parent && window.parent.document.getElementById(cfg.markId)) {
                  parentKnown = true;
                }
              } catch (e) {
              }
              if (!parentKnown) {
                var parentTimer = setInterval(function () {
                  window.parent.postMessage({ type: 'watermarkCheck' }, '*');
                }, 2000);
                window.addEventListener('message', function (e) {
                  if (e.data && e.data.type === 'hasWatermark' && e.data.value) {
                    clearInterval(parentTimer);
                    destroy();
                  }
                });
                setTimeout(function () {
                  if (!destroyed) {
                    render();
                    observeDOM();
                  }
                }, 1000);
                window.addEventListener('resize', function () {
                  if (!destroyed) {
                    render();
                  }
                });
              }
            }
            """;

    private volatile WatermarkPluginConfig config;

    public WatermarkPlugin() {
        super(BuiltinPluginConstants.WATERMARK, "安全水印插件", "POST", 8);
    }

    @Override
    public Mono<Void> execute(ServerWebExchange exchange, PluginChain chain) {
        if (config == null || !config.isEnabled()) {
            return chain.execute(exchange);
        }
        ServerWebExchange mutated = exchange.mutate()
                .response(new WatermarkDecorator(exchange)).build();
        return chain.execute(mutated);
    }

    @Override
    public void onConfigChange(PluginConfig pluginConfig) {
        this.config = JsonUtils.parseObject(pluginConfig.config(), WatermarkPluginConfig.class);
    }

    String buildScriptTag() {
        String scriptUrl = config.getScriptUrl();
        if (scriptUrl != null && !scriptUrl.isEmpty()) {
            return buildExternalBootstrap(scriptUrl);
        }
        return "<script>(function(){" + inlineConfigLiteral() + INLINE_SCRIPT_BODY + "})();</script>";
    }

    /** 内联脚本的 cfg 字面量：org/cookieName/color/width/height/fontSize/rotate/markId。 */
    private String inlineConfigLiteral() {
        return "var cfg={"
                + "org:'" + escape(config.getOrg()) + "',"
                + "cookieName:'" + escape(config.getSessionCookieName()) + "',"
                + "color:'" + escape(config.getColor()) + "',"
                + "width:" + config.getWidth() + ","
                + "height:" + config.getHeight() + ","
                + "fontSize:" + config.getFontSize() + ","
                + "rotate:" + config.getRotate() + ","
                + "markId:'" + MARK_ID + "'"
                + "};";
    }

    /**
     * scriptUrl 外链引导（仅显式配置 scriptUrl 时启用）：保留既有 options 键
     * （org/color/width/height/fontSize/rotate）并附带 sessionCookieName 传导参数化 cookie 名。
     */
    private String buildExternalBootstrap(String scriptUrl) {
        return "<script src='" + escape(scriptUrl) + "'></script>"
                + "<script>if(!window." + EXTERNAL_GUARD + "){window." + EXTERNAL_GUARD + "=new "
                + EXTERNAL_GLOBAL_NAME + "({"
                + "org:'" + escape(config.getOrg()) + "',"
                + "color:'" + escape(config.getColor()) + "',"
                + "width:" + config.getWidth() + ","
                + "height:" + config.getHeight() + ","
                + "fontSize:" + config.getFontSize() + ","
                + "rotate:" + config.getRotate() + ","
                + "sessionCookieName:'" + escape(config.getSessionCookieName()) + "'"
                + "})}</script>";
    }

    private String escape(String s) {
        return s == null ? "" : s.replace("'", "\\'");
    }

    private class WatermarkDecorator extends ServerHttpResponseDecorator {

        WatermarkDecorator(ServerWebExchange exchange) {
            super(exchange.getResponse());
        }

        @Override
        public Mono<Void> writeWith(Publisher<? extends DataBuffer> body) {
            if (!shouldInject()) {
                return super.writeWith(body);
            }
            stripCspIfNeeded();
            return super.writeWith(Flux.from(body)
                    .reduce(new StringBuilder(), (sb, buf) -> sb.append(buf.toString(StandardCharsets.UTF_8)))
                    .map(StringBuilder::toString)
                    .flatMap(this::injectInto));
        }

        @Override
        public Mono<Void> writeAndFlushWith(Publisher<? extends Publisher<? extends DataBuffer>> body) {
            if (!shouldInject()) {
                // 非 HTML（含 SSE text/event-stream）与超限响应原样透传，保持逐窗口 flush 语义
                return super.writeAndFlushWith(body);
            }
            stripCspIfNeeded();
            // 与 writeWith 同一缓冲注入语义：跨 flush 窗口按序缓冲拼接后统一写回，
            // 保证 </body> 被切在窗口边界时仍能命中插入点
            return writeWith(Flux.from(body).concatMap(window -> window));
        }

        /** 注入条件：text/html 且（未声明长度或不超过 maxBodyLength）。SSE/JSON 等一律不注入。 */
        private boolean shouldInject() {
            MediaType contentType = getHeaders().getContentType();
            if (contentType == null || !MediaType.TEXT_HTML.isCompatibleWith(contentType)) {
                return false;
            }
            long length = getHeaders().getContentLength();
            return length < 0 || length <= config.getMaxBodyLength();
        }

        /** stripCsp=true（且仅注入路径）才删除 CSP 头，缺省保留。 */
        private void stripCspIfNeeded() {
            if (config.isStripCsp()) {
                getHeaders().remove(CSP_HEADER);
            }
        }

        private Mono<DataBuffer> injectInto(String html) {
            String modified = injectScript(html);
            byte[] bytes = modified.getBytes(StandardCharsets.UTF_8);
            getHeaders().setContentLength(bytes.length);
            return Mono.just(new DefaultDataBufferFactory().wrap(bytes));
        }

        private String injectScript(String html) {
            String scriptTag = buildScriptTag();
            String trimmed = html.trim();
            int index = trimmed.toLowerCase().lastIndexOf("</body>");
            if (index > 0) {
                return trimmed.substring(0, index) + scriptTag + "\n" + trimmed.substring(index);
            }
            return trimmed + scriptTag;
        }
    }
}
