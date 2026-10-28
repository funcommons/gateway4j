package fun.commons.gateway4j.common.exception;

import fun.commons.gateway4j.common.constant.ErrorCode;

public class DepthExceededException extends BusinessException {

    public DepthExceededException(int depth) {
        super(ErrorCode.DEPTH_EXCEEDED, "当前深度: " + depth + ", 最大允许: 5");
    }
}
