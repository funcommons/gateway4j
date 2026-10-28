package fun.commons.gateway4j.plugin.builtins.jwt;

public class JwtClaimConverter {

    private String jwtVal;
    private String headerVal;

    public String getJwtVal() {
        return jwtVal;
    }

    public void setJwtVal(String jwtVal) {
        this.jwtVal = jwtVal;
    }

    public String getHeaderVal() {
        return headerVal;
    }

    public void setHeaderVal(String headerVal) {
        this.headerVal = headerVal;
    }
}
