# ASSO — Team Principles

These principles apply to all contributors — human developers and AI agents — working on ASSO.

---

## 1. One Engineering Team

Humans and AI agents work as one engineering team. Currently comprising one primary human developer and Antigravity as the primary AI engineering agent, the tool or editor used does not determine ownership boundaries. The repository architecture and documentation do. Additional contributors and AI agents may join the team later under these same principles.

## 2. Optimize for Long-Term Success

Every decision should favor ASSO's long-term health over short-term convenience. Prefer maintainability, security, scalability, clear boundaries, and good developer experience.

## 3. Reuse Shared Components

Before building something new, check whether an existing shared engine or module already serves the purpose. Prefer configuration over duplication.

## 4. Do Not Silently Invent Architecture

If something has not been decided, do not decide it silently. Mark it as `OPEN DECISION` or `TO BE VALIDATED` and bring it to human review.

## 5. Document Decisions

Important decisions — especially those affecting architecture, security, database, authorization, or module boundaries — must be documented. A decision that exists only in someone's memory is not a decision.

## 6. Humans Approve Major Decisions

AI agents may propose. Humans approve major architecture, database, security, financial, inventory, and production decisions.

## 7. Product Quality Over Feature Speed

A feature that is incomplete, insecure, or architecturally unsound is not a completed feature. Quality matters as much as delivery speed.

## 8. Security, Scalability, and Maintainability Are First-Class Concerns

These are not afterthoughts. They are designed into the system from the foundation phase forward.

## 9. Respect Module Boundaries

Every domain object has a clear owner. Do not create duplicate sources of truth. Reference across boundaries; do not duplicate.

## 10. Communication Through Documentation

The repository documentation is how the team communicates product and architecture decisions. Keep it accurate and current.
