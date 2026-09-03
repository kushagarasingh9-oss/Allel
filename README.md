# Allel

Allel is a revenue-recovery workspace for founder-led B2B SaaS teams. It turns billing, product usage, communication, support, CRM, and engineering signals into an account-level workflow for identifying risk, preparing follow-up, and measuring outcomes.

The product combines deterministic recovery logic with an AI-assisted analysis and drafting layer. Provider facts, account identity, risk decisions, policy, approval, and outcome attribution remain application-controlled and auditable.

The complete product, architecture, integration, agent, and operational guide is in [docs/ALLEL.md](docs/ALLEL.md).

## Repository

    platform/             Next.js product application
    database/migrations/  Supabase schema and RPC migrations
    docs/ALLEL.md         Canonical product and technical documentation
    design/               Separate design workspace

## Local development

    cd platform
    npm install
    cp .env.example .env.local
    npm run dev

Apply the ordered database migrations before using a local environment with Supabase. Run npm test for the current test suite and npm run build for a production build check.

## Documentation policy

There is one canonical product and technical document: docs/ALLEL.md. It replaces the previous duplicate architecture, agent, integration, planning, interview, and tool-routing documents.

## License & Intellectual Property

Copyright © 2026 Kushagara Singh. All rights reserved.  
This software and source code are the proprietary property of Kushagara Singh. Permission is granted solely for hackathon evaluation and review purposes. Commercial use, redistribution, or unauthorized reproduction is strictly prohibited. See [LICENSE](LICENSE).

