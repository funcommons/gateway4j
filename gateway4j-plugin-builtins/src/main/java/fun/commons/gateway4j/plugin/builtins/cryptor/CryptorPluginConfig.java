package fun.commons.gateway4j.plugin.builtins.cryptor;

import java.util.List;

public class CryptorPluginConfig {

    private String algorithm;
    private String secretKey;
    private List<String> decryptFields;
    private List<String> encryptFields;

    public String getAlgorithm() { return algorithm; }
    public void setAlgorithm(String algorithm) { this.algorithm = algorithm; }
    public String getSecretKey() { return secretKey; }
    public void setSecretKey(String secretKey) { this.secretKey = secretKey; }
    public List<String> getDecryptFields() { return decryptFields; }
    public void setDecryptFields(List<String> decryptFields) { this.decryptFields = decryptFields; }
    public List<String> getEncryptFields() { return encryptFields; }
    public void setEncryptFields(List<String> encryptFields) { this.encryptFields = encryptFields; }
}
