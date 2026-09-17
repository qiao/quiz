# Product requirements: quiz skill

Status: draft, for review by the user. Date: 2026-09-16.

This document answers: what are we building, and why?

| Section | Title | Answers |
|---|---|---|
| 1 | The core problem | Why do developers need automated quizzes? |
| 2 | Target users | Who uses the skill and the generated slides? |
| 3 | Goals and non-goals | What is in scope, and what is excluded? |
| 4 | Prompt forms | How do users invoke the skill? |
| 5 | User stories | What real developer workflows does the skill serve? |
| 6 | Acceptance criteria | How do we verify the complete feature set? |
| 7 | Sources | Where are the primary references? |

---

## 1. The core problem

Engineers who explore unfamiliar codebases, documentation, or technical systems need practice
questions to verify their mental models. They need questions that evaluate system comprehension,
execution flow, and design trade-offs rather than trivia. They also need a simple presentation
format that opens locally without network access, third-party accounts, or server infrastructure.

The `quiz` skill addresses these needs. It inspects local repositories, documentation sites, files,
or user topics. It generates four tiers of multiple-choice questions without trivia. It verifies
the questions with an independent blind sub-agent and compiles them into a single self-contained
HTML slide page. The page works offline and runs in any modern browser.

---

## 2. Target users

The product serves two primary user roles:

1. **The quiz author:** A developer using an agent runtime (such as Claude Code or agy). The author
   runs `/quiz` to inspect code, prepare onboarding materials, or test personal understanding.
2. **The learner:** An engineer, student, or team member taking the quiz. The learner navigates
   the slide deck in a web browser using keyboard controls or touch taps.

---

## 3. Goals and non-goals

### Product goals

1. **Effortless invocation:** Run `/quiz` without arguments to explore the current working
   directory with standard defaults.
2. **Four progressive tiers:** Organize questions into Fundamentals, Core, Advanced, and Expert
   tiers to guide learners from basic recall to architectural trade-offs.
3. **Strict no-trivia standard:** Test comprehension, execution flow, and design reasons. Reject
   questions about line numbers, variable names, or arbitrary constants.
4. **Answer verification:** Run an independent blind check sub-agent without the answer key to catch
   ambiguities and errors before compilation.
5. **Self-contained output:** Generate a single HTML file with inlined styles and fonts. The file
   makes zero network calls and works offline.
6. **Keyboard-first presentation:** Deliver responsive slide layouts with full keyboard navigation
   (keys 1 to 4, Enter, Arrow keys, and T for theme toggle).
7. **Progress persistence:** Store answer choices in browser `localStorage` keyed by content hash,
   protecting progress across reloads while allowing clean restarts.

### Non-goals

1. **Formal exam cheat prevention:** Static HTML cannot hide source data from browser inspection.
   The tool does not prevent source code review.
2. **User accounts and cloud hosting:** The tool requires no database, login service, or cloud
   deployment.
3. **Multiplayer live quizzes:** Real-time synchronized games are out of scope.
4. **EPUB file extraction:** The tool parses code, plain text, Markdown, PDF, and HTML docs,
   but does not parse EPUB files.

---

## 4. Prompt forms

The skill accepts flexible natural language arguments:

```text
/quiz [resource] [focus]
```

### Supported input forms

1. **Standard invocation:** `/quiz`
   Explores the current working directory. Focuses on core modules, public interfaces, and
   architectural patterns while ignoring lock files and vendor folders. Defaults to 20 questions.
2. **Focus only:** `/quiz authentication flow`
   Explores the current working directory, but targets questions to authentication logic and
   session handling.
3. **Resource only:** `/quiz ./packages/core` or `/quiz https://example.com/docs` or
   `/quiz manual.pdf`
   Directs question generation to the specified path, documentation site, or document.
4. **Resource and focus:** `/quiz ./packages/compiler type checking`
   Directs question generation to a specific directory with a specific topic focus.
5. **Question count override:** `/quiz 10 questions on state management`
   Changes the question count from 20 to the requested number.
6. **Graceful degradation:** If a resource is small, the skill generates fewer questions and reports
   the reduction to the user instead of producing low-value trivia.

---

## 5. User stories

### Story 1: Onboarding to a new repository
An engineer joins a team and clones an unfamiliar repository. The engineer runs `/quiz`. The skill
reads the code and compiles 20 questions into `./quizzes/<slug>/index.html`. The engineer opens the
page and reviews core architectural decisions and data flows in fifteen minutes.

### Story 2: Subsystem review before refactoring
A developer plans a refactor of a complex caching layer. The developer runs `/quiz cache eviction`.
The skill focuses questions on cache lifecycle, boundary conditions, and race conditions. This
review tests the developer's understanding of edge cases before writing code.

### Story 3: Offline study of a PDF specification
An engineer boards a flight with a technical PDF specification. The engineer previously ran
`/quiz spec.pdf`. During the flight, the engineer opens the single self-contained HTML file without
internet access and completes the quiz.

### Story 4: Presenting slides on an external display
A team lead connects a laptop to a conference room projector to review repository conventions with
new hires. The room is bright. The lead presses the T key to switch the slides to light mode,
providing high contrast for all attendees.

---

## 6. Acceptance criteria

An implementation satisfies this specification when all criteria pass:

### Generation and validation
- [ ] Running `/quiz` checks for Node.js before attempting compilation (see Section 3 of
  [`docs/architecture.md`](architecture.md#3-build-compiler)).
- [ ] The skill asks clarifying questions when the current working directory is empty or the home
  directory.
- [ ] An independent sub-agent verifies draft questions without seeing the answer key.
- [ ] Questions adhere to the four difficulty tiers with no trivial recall questions.
- [ ] When the user prompt specifies a question count, the skill honors the requested count.
- [ ] Questions use the natural domain terminology and the language of the prompt.
- [ ] Every question contains exactly four choices, with balanced positions across A, B, C, and D.
- [ ] Code blocks render in Geist Mono with escaped HTML characters.
- [ ] Every question includes a citation, resolving to a commit SHA permalink when clean git
  tracking exists and falling back to text for modified files.
- [ ] The build script validates `quiz.json` against the draft schema before writing output.

### Output and packaging
- [ ] Output compiles into `./quizzes/<slug>/index.html`.
- [ ] Existing folders are not overwritten; the tool appends a numeric suffix such as `-2`.
- [ ] The agent prints the relative file path and a one-line deployment command hint upon
  completion.
- [ ] The generated HTML file works without internet access and makes no network requests.
- [ ] The output displays no proprietary trademarks or vendor logos.

### Interaction and interface
- [ ] Slide navigation implements the keyboard controls specified in Section 7 of
  [`docs/architecture.md`](architecture.md#7-slide-interface).
- [ ] Learn mode reveals the explanation immediately after a selection.
- [ ] The end slide displays the final score, tier breakdown, and a retry missed questions button.
- [ ] The T key and header button toggle between light and dark themes.
- [ ] Progress persists in `localStorage` with a derived ID, and the restart button clears it.
- [ ] Controls and contrast ratios comply with WCAG 2.1 AA specifications.

---

## 7. Sources

- ASD-STE100 Simplified Technical English: <https://asd-ste100.org/>
- Vercel Brand Guidelines: <https://vercel.com/design.md>
- Web Content Accessibility Guidelines (WCAG) 2.1: <https://www.w3.org/TR/WCAG21/>
