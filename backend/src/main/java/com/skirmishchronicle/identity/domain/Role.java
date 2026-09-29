package com.skirmishchronicle.identity.domain;

/** Global roles. Tournament-level roles (organizer, co-organizer) are modelled per tournament. */
public enum Role {
    USER,
    ADMIN,
    /** Game publisher: read-only access to aggregated reports (/api/admin/reports). */
    PUBLISHER
}
