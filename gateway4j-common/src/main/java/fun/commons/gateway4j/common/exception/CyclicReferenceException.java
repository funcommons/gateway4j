package fun.commons.gateway4j.common.exception;

import fun.commons.gateway4j.common.constant.ErrorCode;

public class CyclicReferenceException extends BusinessException {

    public CyclicReferenceException(String detail) {
        super(ErrorCode.CYCLIC_REFERENCE, detail);
    }
}
