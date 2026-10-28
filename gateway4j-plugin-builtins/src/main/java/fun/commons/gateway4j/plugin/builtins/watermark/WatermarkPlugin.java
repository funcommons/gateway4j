package fun.commons.gateway4j.plugin.builtins.watermark;

import fun.commons.gateway4j.common.util.JsonUtils;
import fun.commons.gateway4j.plugin.api.AbstractGatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;
import fun.commons.gateway4j.plugin.api.PluginConfig;
import fun.commons.gateway4j.plugin.builtins.BuiltinPluginConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.core.io.buffer.DefaultDataBufferFactory;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponseDecorator;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;

/**
 * 安全水印插件。拦截 HTML 响应，在 </body> 前注入水印 JS，
 * 并移除 CSP 头防止脚本被浏览器拦截。
 */
public class WatermarkPlugin extends AbstractGatewayPlugin {

    private static final Logger log = LoggerFactory.getLogger(WatermarkPlugin.class);

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
        if (config.getScriptUrl() != null && !config.getScriptUrl().isEmpty()) {
            return "<script src='" + config.getScriptUrl() + "'></script>"
                    + "<script>if(!window._fswm){var _fswm=new FuSecurityWatermark({"
                    + "org:'" + escape(config.getOrg()) + "',"
                    + "color:'" + escape(config.getColor()) + "',"
                    + "width:" + config.getWidth() + ","
                    + "height:" + config.getHeight() + ","
                    + "fontSize:" + config.getFontSize() + ","
                    + "rotate:" + config.getRotate()
                    + "})}</script>";
        }
        return "<script>(function(){var o='" + escape(config.getOrg())
                + "内部系统',c='" + escape(config.getColor())
                + "',w=" + config.getWidth() + ",h=" + config.getHeight()
                + ",f=" + config.getFontSize() + ",r=" + config.getRotate()
                + ";var d=document.createElement('div');d.id='gw-watermark';"
                + "d.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;overflow:hidden';"
                + "var s='';for(var y=0;y<20;y++){for(var x=0;x<10;x++){"
                + "s+='<div style=\"position:absolute;top:'+(y*h)+'px;left:'+(x*w)+'px;width:'+w+'px;height:'+h+'px;"
                + "transform:rotate('+r+'deg);color:'+c+';font-size:'+f+'px;display:flex;align-items:center;justify-content:center\">'+o+'</div>'}}"
                + "d.innerHTML=s;document.body.appendChild(d)})();</script>";
    }

    private String escape(String s) {
        return s == null ? "" : s.replace("'", "\\'");
    }

    private class WatermarkDecorator extends ServerHttpResponseDecorator {

        private final ServerWebExchange exchange;

        WatermarkDecorator(ServerWebExchange exchange) {
            super(exchange.getResponse());
            this.exchange = exchange;
        }

        @Override
        public Mono<Void> writeWith(org.reactivestreams.Publisher<? extends DataBuffer> body) {
            MediaType contentType = getHeaders().getContentType();
            if (contentType == null || !MediaType.TEXT_HTML.isCompatibleWith(contentType)) {
                return super.writeWith(body);
            }
            if (getHeaders().getContentLength() > config.getMaxBodyLength()) {
                return super.writeWith(body);
            }
            getHeaders().remove("content-security-policy");

            if (body instanceof Flux) {
                Flux<? extends DataBuffer> flux = (Flux<? extends DataBuffer>) body;
                return super.writeWith(flux.reduce(new StringBuilder(),
                                (sb, buf) -> sb.append(buf.toString(StandardCharsets.UTF_8)))
                        .map(StringBuilder::toString)
                        .flatMap(html -> {
                            String modified = injectScript(html);
                            byte[] bytes = modified.getBytes(StandardCharsets.UTF_8);
                            getHeaders().setContentLength(bytes.length);
                            DataBuffer buffer = new DefaultDataBufferFactory().wrap(bytes);
                            return Mono.just(buffer);
                        }));
            }
            return super.writeWith(body);
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
