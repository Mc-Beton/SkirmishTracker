package com.skirmishchronicle.table.engine;

/** A command breaks a rule of the table; {@code code} is translated by the frontend (errors.TABLE_*). */
public class RuleViolation extends RuntimeException {

    private final String code;

    public RuleViolation(String code) {
        super(code);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
