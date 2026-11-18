package com.skirmishchronicle.common;

import org.springframework.http.HttpStatus;

/** Business error with a stable machine-readable code, translated by the frontend (PL/EN). */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    /** Optional text for the user that goes with the code (a rule of the game that refused a move). */
    private final String detail;

    public ApiException(HttpStatus status, String code) {
        this(status, code, null);
    }

    public ApiException(HttpStatus status, String code, String detail) {
        super(code);
        this.status = status;
        this.code = code;
        this.detail = detail;
    }

    public String getDetail() {
        return detail;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }
}
