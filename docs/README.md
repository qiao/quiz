# Quiz skill design documentation

Status: current. Date: 2026-09-16.

This document answers: where does each fact live, and how are documents organized?

| Section | Title | Answers |
|---|---|---|
| 1 | Documentation map | What does each design document specify? |
| 2 | Reading order | In which order should a reader study the documents? |
| 3 | Documentation rules | Which four rules keep the documents accurate? |
| 4 | Sources | Where are the primary documentation standards? |

---

## 1. Documentation map

Four documents define the quiz skill architecture. Each document answers one core question.

| Document | Core question |
|---|---|
| [`README.md`](README.md) | Where does each fact live, and how are documents organized? |
| [`product.md`](product.md) | What are we building, and why? |
| [`architecture.md`](architecture.md) | How does the compiler and slide runtime work? |
| [`decisions.md`](decisions.md) | What did we decide, and what did we reject? |

```text
              +------------------+
              | docs/product.md  |
              +------------------+
                       │
                       ▼
            +----------------------+
            | docs/architecture.md |
            +----------------------+
                       │
                       ▼
             +--------------------+
             | docs/decisions.md  |
             +--------------------+
```

---

## 2. Reading order

New readers follow this sequence:

1. Read [`docs/product.md`](product.md) to understand user goals, features, and non-goals.
2. Read [`docs/architecture.md`](architecture.md) to understand the compiler pipeline, data models,
   and slide layout.
3. Read [`docs/decisions.md`](decisions.md) to review architecture choices, rejected options,
   and the design conflict records.

---

## 3. Documentation rules

Four rules keep the documentation set accurate:

1. **One home per fact.** Each fact lives in a single primary document. Other documents link to
   that source.
2. **One word per concept.** Use canonical names across all documents without synonyms.
3. **Ground every external claim.** Link technical claims about runtimes, HTML standards, or
   design tokens to official documentation in that document's Sources section.
4. **Record contradictions explicitly.** When an implementation choice diverges from an external
   specification, record the discrepancy openly. Section 7 of [`decisions.md`](decisions.md)
   records the theme toggle, stillness, and score color discrepancies.

---

## 4. Sources

- ASD-STE100 Simplified Technical English: <https://asd-ste100.org/>
- Vercel Brand Guidelines: <https://vercel.com/design.md>
- Node.js Test Runner: <https://nodejs.org/api/test.html>
