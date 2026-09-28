package com.skirmishchronicle.common;

import org.springframework.http.HttpStatus;

/** Business error with a stable machine-readable code, translated by the frontend (PL/EN). */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String code) {
        super(code);
        this.status = status;
        this.code = code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }
}
