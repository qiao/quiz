# AGENTS.md

Guidance for agents working in this repository. Read it before you change anything. The
conventions here override general defaults.

Read `docs/README.md` first. It maps the design documents and holds the four rules that keep them
accurate. A change that contradicts a design document updates that document in the same commit.

## What this is

`quiz` is an agent skill that generates multiple-choice quizzes as responsive HTML slide pages.
Quizzes can be generated from codebases, documentation, files, or user topics.

The repository holds two primary components:
1. The design specification in markdown documents under `docs/`.
2. The skill implementation under `skills/quiz/` and tests under `test/`.

The documentation set defines the architecture:
- `docs/README.md`: Documentation index and map.
- `docs/product.md`: User goals, features, and non-goals.
- `docs/architecture.md`: System architecture, data structures, and compiler flow.
- `docs/decisions.md`: What did we decide, and what did we reject?

The documents are the specification. A commit that changes behavior updates the document that
specifies that behavior.

## Workflow

**Clarity outranks stability.** Nothing outside this repository depends on it yet.

- Rename, renumber, split, and delete files freely. A better structure justifies the update.
- Never leave stale redirects or deprecated aliases. Update content and fix references in the same
  commit.
- Evaluate changes by document readability.

**Keep the documents true.** A fact lives in one document, and every other document links to it.

- Section 3 of `docs/README.md` defines the four documentation rules. Follow them strictly.
- When updating a fact, update every document that references it.

**Commit fine-grained.** One logical change per commit. Any commit can be reverted cleanly without
affecting unrelated work. Use commit subjects in the format `area: change`.

**Use kebab-case for file names.** Every script, stylesheet, test, and documentation file uses
lowercase letters, numbers, and hyphens. Established conventions permit uppercase names for
`AGENTS.md`, `CLAUDE.md`, `README.md`, and `SKILL.md`.

**Doc comments and type checking.**
- Start each `.mjs` file with `// @ts-check`.
- Follow standard JSDoc syntax (`/** ... */`) with type annotations in tags (`@param`, `@returns`).
- Start comments on types, interfaces, and properties with a noun phrase.
- Start comments on functions and methods with a verb phrase.

## Visual explanations and type snippets

**Use ASCII diagrams to explain complex flows.**
- Fenced code blocks must use the `text` tag.
- Keep box widths aligned and arrows labeled.
- Keep diagrams under 100 columns wide.

**Show TypeScript interface snippets for new types.**
- Provide explicit types for all properties.
- Add concise doc comments for non-obvious constraints.
- Pair type models with ASCII structure diagrams.

## Design invariants

Breaking any of these invariants breaks the system design:

1. **The build script validates all JSON before output generation.** Invalid draft schemas halt the
   build immediately.
2. **All Markdown is compiled and HTML-escaped at build time.** The template script performs no
   runtime parsing.
3. **The output is a single self-contained HTML file.** Pages work without internet access and make
   no network calls.
4. **Questions follow four progressive tiers with no trivia.** Questions evaluate system
   comprehension rather than memorization.
5. **Every question has exactly four choices with balanced positions.** Answer positions are
   shuffled deterministically by code.
6. **No proprietary trademarks or logos appear on generated slides.** Slides use monochrome
   typographic styling, with color used only for state, action, or data.
7. **The agent writes only the draft.** The build script `build.mjs` derives every other field.
8. **The agent never reads `template.html` or font assets.** Reading templates wastes context
   tokens.

## Writing

Use ASD-STE100 Simplified Technical English and no em-dashes. Wrap every line to at most 100
characters.

Write for a reader skimming at 2am to find one fact.

- **Put the subject first.** Lead with the fact and follow with the qualification.
- **Keep sentences short.** Aim under 25 words. Treat 40 words as a hard stop.
- **Show the mechanism.** Report exact numbers and system actions instead of feelings.
- **Keep lines under 100 characters.** Wrap all text, code snippets, lists, and table rows.

### Tells to avoid

Machine-written text often contains repetitive phrasing and filler words:

- **Antithesis as a tic.** "X, not Y" defines by negation. State what is true directly.
- **Appositive tails.** Avoid attaching commentary phrases to finished sentences.
- **Throat-clearing.** Do not open sentences with filler words like "Importantly" or "Note that".
- **Colon fanfare.** State facts directly without theatrical lead-ins.
- **Rule-of-three padding.** Avoid padding lists to three items when two items state the facts.
- **Bold lead-ins on every bullet.** Avoid opening every list bullet with bold text.
- **Semicolon splices.** Separate complete thoughts into distinct sentences.
- **Forbidden words:** delve, leverage, utilize, facilitate, underscore (verb), testament,
  landscape, realm, tapestry, holistic, myriad, plethora, crucial, pivotal, game-changing, unlock,
  empower, streamline, seamless, load-bearing, seam, smoking gun, showcase, elevate, "dive into",
  "at its core", "the beauty of", "that said", "at the end of the day", ensure, gracefully,
  intuitive, destroy. No emoji.

## Ending a turn

Name the next step when work remains.
