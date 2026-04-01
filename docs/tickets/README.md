# MCP Spec Compliance Tickets

Implementation tickets for bringing mcp-framework into compliance with MCP spec 2025-11-25.
See [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) for the full strategy document.

## Execution Order

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──┐
                                     Phase 4 ──┼──► Phase 6
                                     Phase 5 ──┘
```

## Ticket Index

| Ticket | Title | Phase | Priority | Breaking | Depends On |
|--------|-------|-------|----------|----------|------------|
| [TICKET-00](TICKET-00-sdk-upgrade.md) | SDK Upgrade (1.11→1.29) | 0 | P0 | Yes | — |
| [TICKET-01](TICKET-01-origin-validation.md) | Origin Header Validation | 1 | P0 | No | T-00 |
| [TICKET-02](TICKET-02-protocol-version-header.md) | MCP-Protocol-Version Header | 1 | P0 | No | T-00 |
| [TICKET-03](TICKET-03-localhost-binding.md) | Localhost Binding Default | 1 | P0 | Yes | — |
| [TICKET-04](TICKET-04-title-icons.md) | Title & Icons | 2 | P1 | No | T-00 |
| [TICKET-05](TICKET-05-tool-annotations.md) | Tool Annotations | 2 | P1 | No | T-00 |
| [TICKET-06](TICKET-06-structured-content.md) | Structured Content & Output Schemas | 2 | P1 | No | T-00 |
| [TICKET-07](TICKET-07-audio-content.md) | Audio Content Type | 3 | P2 | No | T-06 |
| [TICKET-08](TICKET-08-resource-links-embedded.md) | Resource Links & Embedded Resources | 3 | P2 | No | T-06 |
| [TICKET-09](TICKET-09-content-annotations.md) | Content Annotations | 3 | P2 | No | T-06 |
| [TICKET-10](TICKET-10-logging-protocol.md) | Logging Protocol | 4 | P1 | No | T-00 |
| [TICKET-11](TICKET-11-progress-tracking.md) | Progress Tracking | 4 | P2 | No | T-00 |
| [TICKET-12](TICKET-12-cancellation.md) | Cancellation Support | 4 | P2 | No | T-00 |
| [TICKET-13](TICKET-13-elicitation-form.md) | Elicitation (Form Mode) | 5 | P1 | No | T-00 |
| [TICKET-14](TICKET-14-roots-support.md) | Roots Support | 5 | P2 | No | T-00 |
| [TICKET-15](TICKET-15-sampling-with-tools.md) | Sampling with Tools | 5 | P2 | No | T-00 |
| [TICKET-16](TICKET-16-tasks.md) | Tasks (Experimental) | 6 | P3 | No | T-00,11,12 |
| [TICKET-17](TICKET-17-elicitation-url-mode.md) | Elicitation URL Mode | 6 | P3 | No | T-13 |

## Summary Stats

- **Total tickets:** 18
- **Breaking changes:** 2 (SDK upgrade, localhost binding)
- **P0 Critical:** 4 tickets
- **P1 High:** 5 tickets
- **P2 Medium:** 6 tickets
- **P3 Low:** 3 tickets

## Test Coverage Plan

Each ticket includes:
- Unit tests for the specific feature
- Backwards compatibility tests (existing tests must pass)
- Integration/acceptance tests for end-to-end validation

Total new test files planned: ~15-18 new test files across all tickets.
