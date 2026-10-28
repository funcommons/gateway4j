package fun.commons.gateway4j.plugin.builtins.jwt;

import java.util.List;

public class JwtPluginConfig {

    private String secretKey;
    private String publicKey;
    private String algorithm;
    private String tokenHeader;
    private List<JwtClaimConverter> converter;

    public String getSecretKey() {
        return secretKey;
    }

    public void setSecretKey(String secretKey) {
        this.secretKey = secretKey;
    }

    public String getPublicKey() {
        return publicKey;
    }

    public void setPublicKey(String publicKey) {
        this.publicKey = publicKey;
    }

    public String getAlgorithm() {
        return algorithm;
    }

    public void setAlgorithm(String algorithm) {
        this.algorithm = algorithm;
    }

    public String getTokenHeader() {
        return tokenHeader;
    }

    public void setTokenHeader(String tokenHeader) {
        this.tokenHeader = tokenHeader;
    }

    public List<JwtClaimConverter> getConverter() {
        return converter;
    }

    public void setConverter(List<JwtClaimConverter> converter) {
        this.converter = converter;
    }
}
