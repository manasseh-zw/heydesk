# Heydesk — OpenAI Build Week Context

The implementation history and technical decision record live in
[architecture-decisions.md](architecture-decisions.md). This file
defines the submission constraints; the decision record explains how the
implementation evolved within them.

This file is the submission and delivery contract for Heydesk. It condenses the official rules into the constraints we must design and build against.

Official sources:

- [OpenAI Build Week overview](https://openai.devpost.com/)
- [Official rules](https://openai.devpost.com/rules)

This file was prepared on July 16, 2026. The submission deadline is July 21, 2026 at 5:00 PM Pacific Time.

## Submission thesis

Heydesk is a local-first AI workspace for organizing company knowledge, structured records, and documents. It uses Codex with GPT-5.6 as the intelligence and action layer, allowing a user to ask for work in natural language and see the resulting workspace and document changes clearly.

The most natural category is **Work and Productivity**: a tool that helps a founder or small team turn scattered company context into organized knowledge and finished business documents. Apps for Your Life is a possible alternative, but the primary positioning should remain work-focused.

## Eligibility and entry constraints

- Entrants must be at least the age of majority in their country of residence.
- Zimbabwe is listed among the supported territories on the hackathon website. Eligibility still depends on the official rules, OpenAI service availability, local law, and the entrant’s personal circumstances.
- The project must be built with Codex and GPT-5.6.
- The project must fit one of the listed tracks and must be capable of running consistently on its declared platform.
- Third-party SDKs, APIs, data, and open-source libraries are allowed when we are authorized to use them and comply with their licenses.
- RxDB, SQLite, Electron, Hono, TanStack, and other ordinary development dependencies are not prohibited by the rules.

## Existing work and originality

Projects may be newly created during the Submission Period or may be pre-existing projects that are meaningfully extended using Codex and/or GPT-5.6 after the Submission Period begins.

If any earlier Heydesk, dev0, Text0-inspired, or other code is reused, the repository and README must clearly distinguish:

- what existed before the Submission Period;
- what was newly designed, implemented, or materially extended during the Submission Period;
- where Codex and GPT-5.6 were used;
- evidence such as dated commits, Codex session history, or equivalent records.

The submitted work must be original work owned by the entrant or team. Inspiration from existing products is acceptable, but Heydesk must be its own implementation and product concept. Do not copy proprietary code, designs, text, trademarks, or assets without permission.

## Required submission materials

The final submission must include:

1. A working project built with Codex and GPT-5.6.
2. The selected category.
3. A clear project description explaining the problem, audience, product, functionality, and use of Codex/GPT-5.6.
4. A public YouTube demo video shorter than three minutes, with audio explaining what was built and how Codex and GPT-5.6 were used.
5. A code repository URL that is public with relevant licensing, or private and shared with the addresses specified in the rules.
6. A README containing setup instructions, sample data where necessary, supported platform information, and clear run/test instructions.
7. A `/feedback` Codex Session ID for the project thread where most of the core functionality was built.
8. English submission materials, or English translations for all required materials.

For a desktop project, the repository must explain how judges can run the app or test build. The demo should be deterministic enough that a judge can reproduce the main user journey without needing private accounts or undocumented local setup.

## Judging criteria

The rules describe a baseline pass/fail check first: the idea must be viable, fit the theme, and reasonably use the required APIs/SDKs. Projects that pass are judged equally across four criteria:

### Technological implementation

The implementation should demonstrate genuine effort, non-trivial engineering, and thorough use of Codex. Heydesk must visibly use Codex as a meaningful part of the product, not merely mention it in the write-up.

Evidence to emphasize:

- real Codex app-server integration;
- structured, reliable workspace mutations;
- local persistence and typed data modeling;
- streaming activity and visible document changes;
- usable file and document generation workflows;
- an understandable codebase with clear boundaries.

### Design

The product should feel complete, coherent, and runnable rather than like a collection of technical experiments.

The demo should make the user journey obvious: provide context, ask Heydesk for work, observe what is happening, inspect the result, and use the resulting page or document.

### Potential impact

The project must make a specific and credible case for a real audience. The target user should be concrete: for example, a founder or small team that needs a private company workspace and regularly turns scattered information into decisions, updates, plans, and formal documents.

### Quality of the idea

Heydesk should be positioned as a focused product with a distinctive combination: a local-first workspace, structured company knowledge, Codex as an accountable operator, and high-quality document production. It should not be presented as a generic Notion clone or a thin chat wrapper.

## Delivery principles

- Optimize for a working, end-to-end demo path before breadth.
- Make every major claim in the write-up visible in the product or repository.
- Demonstrate Codex usage honestly and specifically; do not claim capabilities that are not implemented.
- Keep the main demo local, deterministic, and recoverable.
- Make the first minute of the video understandable without background context.
- Treat setup instructions and a clean repository as part of the product.
- Use a polished, ambitious narrative while keeping technical claims evidence-backed.
- Keep optional features subordinate to the core user journey.

## Deadline protection

The north-star product is larger than the hackathon submission. The submission should prove the central loop convincingly and leave future capabilities as clearly labelled extensions.

The main delivery risks are:

- spending too long on synchronization, collaboration, or multi-agent execution;
- allowing Codex to mutate state without a reviewable contract;
- depending on private services or credentials for the demo;
- building a beautiful shell without a real working result;
- failing to document new work and Codex usage for a pre-existing codebase;
- leaving the video, README, test build, and `/feedback` session until the final hours.

## Compliance checklist before submission

- [ ] Heydesk runs consistently on the declared platform.
- [ ] Codex and GPT-5.6 are genuinely used in the submitted functionality.
- [ ] New work is clearly separated from any pre-existing work.
- [ ] Third-party and open-source licenses are documented or respected.
- [ ] The repository is accessible to judges.
- [ ] README setup and test instructions work on a clean machine or documented environment.
- [ ] The three-minute public YouTube video includes a clear demo and explains Codex/GPT-5.6 usage.
- [ ] The selected category matches the product’s strongest audience and use case.
- [ ] The `/feedback` Codex Session ID is recorded.
- [ ] All claims in the submission are true, specific, and demonstrated.
