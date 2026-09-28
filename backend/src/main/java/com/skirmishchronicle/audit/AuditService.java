package com.skirmishchronicle.audit;

import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditService {

    private final AuditRepository repository;

    public AuditService(AuditRepository repository) {
        this.repository = repository;
    }

    /** Joins the caller's transaction so the audit entry commits (or rolls back) with the change itself. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void record(UUID actorId, String entityType, UUID entityId, String action, String details) {
        repository.save(new AuditEntry(actorId, entityType, entityId, action, details));
    }

    @Transactional(readOnly = true)
    public List<AuditEntry> recent(String entityType, UUID entityId) {
        return repository.findTop100ByEntityTypeAndEntityIdOrderByCreatedAtDesc(entityType, entityId);
    }
}
