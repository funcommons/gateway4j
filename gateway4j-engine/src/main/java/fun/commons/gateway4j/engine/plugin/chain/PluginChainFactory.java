package fun.commons.gateway4j.engine.plugin.chain;

import fun.commons.gateway4j.plugin.api.GatewayPlugin;
import fun.commons.gateway4j.plugin.api.PluginChain;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class PluginChainFactory {

    public PluginChain buildChain(List<GatewayPlugin> plugins) {
        List<GatewayPlugin> sorted = new ArrayList<>(plugins);
        sorted.sort(Comparator.comparingInt(GatewayPlugin::order));
        return new DefaultPluginChain(sorted);
    }

    public PluginChain buildChainReversed(List<GatewayPlugin> plugins) {
        List<GatewayPlugin> sorted = new ArrayList<>(plugins);
        sorted.sort(Comparator.comparingInt(GatewayPlugin::order).reversed());
        return new DefaultPluginChain(sorted);
    }
}
