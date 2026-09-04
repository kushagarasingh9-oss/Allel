# Allel Documentation

This directory contains current engineering references and archived project history.

Start with the repository [`README.md`](../README.md). It is the primary GitHub-facing guide to the product, UI, recovery workflow, agent orchestration, architecture, integrations, setup, operations, and known limitations.

## Maintained references

| Document | Ownership |
|---|---|
| [`../README.md`](../README.md) | Primary product and repository guide |
| [`ALLEL.md`](ALLEL.md) | Detailed product and system architecture |
| [`../platform/README.md`](../platform/README.md) | Developer setup, environment, routes, commands, and deployment |
| [`AGENT.md`](AGENT.md) | Agent runtime, personas, memory, trust, and telemetry |
| [`tool_calling.md`](tool_calling.md) | Tool selection, provider guards, and in-loop expansion |
| [`INTEGRATION_AUDIT.md`](INTEGRATION_AUDIT.md) | Integration capability model and verified provider risks |
| [`TODO.md`](TODO.md) | Current source-backed engineering risk register |
| [`INTERVIEW_QA.md`](INTERVIEW_QA.md) | Interview and demo preparation |
| [`framer.md`](framer.md) | Optional external Framer operations runbook |

## Archived artifacts

These files preserve historical research, competition plans, reports, or narratives. Their archive banners take precedence over original claims in their bodies.

| Document | Historical role |
|---|---|
| [`CODE_QUALITY_AND_PIPELINE_REPORT.md`](CODE_QUALITY_AND_PIPELINE_REPORT.md) | August 2026 competition audit snapshot |
| [`PRODUCT_COMPLETION_PLAN.md`](PRODUCT_COMPLETION_PLAN.md) | August 2026 product roadmap |
| [`REPOSITORY_RESEARCH.md`](REPOSITORY_RESEARCH.md) | Early repository assessment |
| [`goal.md`](goal.md) | Competition build blueprint |
| [`plan.md`](plan.md) | Recovery-engine implementation plan |
| [`story.md`](story.md) | Unbenchmarked tool-routing narrative |

Do not use archived test counts, tool counts, paths, performance numbers, or completion claims as current facts.

## Documentation rules

1. Source code, migrations, and executed validation results outrank prose.
2. Date volatile facts such as test, migration, route, and tool counts.
3. Link performance claims to reproducible evidence or label them unverified.
4. Keep seeded/test-mode outcomes visibly separate from production facts.
5. Update the root README when product navigation or core workflows change.
6. Put focused implementation detail in the relevant maintained reference rather than duplicating it everywhere.
7. Archive completed plans instead of leaving them marked authoritative.
8. Generated reports under `platform/artifacts/` are evidence, not maintained docs.

## Validation snapshot

The documentation was source-audited on **2026-09-05**. At that point:

```text
npm test       439 passed, 0 failed
npm run build  passed
migrations     29 files
tool registry  164 tools
```

Re-run the commands before quoting these numbers.
