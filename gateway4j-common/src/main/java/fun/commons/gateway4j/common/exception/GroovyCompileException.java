package fun.commons.gateway4j.common.exception;

import fun.commons.gateway4j.common.constant.ErrorCode;

public class GroovyCompileException extends BusinessException {

    private final String compileError;

    public GroovyCompileException(String scriptName, String compileError) {
        super(ErrorCode.PLUGIN_LOAD_FAILED, "Groovy脚本编译失败: " + scriptName);
        this.compileError = compileError;
    }

    public String getCompileError() {
        return compileError;
    }
}
