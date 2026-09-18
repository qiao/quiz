# Architecture decisions: quiz skill

Status: current. Date: 2026-09-16.

This document answers: what did we decide, and what did we reject?

| Section | Title | Answers |
|---|---|---|
| 1 | Decision log | What did we decide for D1 to D28? |
| 2 | Packaging and scope (D1 to D6) | How do we package and scope the skill? |
| 3 | Question mechanics (D7 to D12, D28) | How do we generate tiers and choices? |
| 4 | Output and presentation (D13 to D18, D26, D27) | How do we build and render slides? |
| 5 | Execution and verification (D19 to D24) | How do we run and test the build? |
| 6 | Agent hosts (D25) | Which agent environments do we support? |
| 7 | Conflict records: theme, motion, color | Why does the design diverge from Vercel rules? |
| 8 | Sources | Where are the primary references? |

---

## 1. Decision log

| # | Topic | Choice | Core reason |
|---|---|---|---|
| D1 | Packaging | Source repo with symlink | Enables version control and test runs |
| D2 | Audience | Self-testing with optional sharing | Static HTML cannot prevent inspection |
| D3 | Architecture | Template plus data | Separates questions from slide layout |
| D4 | Resources | All except EPUB | Covers common developer formats |
| D5 | Focus | Optional resource and focus | Supports zero-config and targeted runs |
| D6 | Clarification | Ask only when input is invalid | Reduces interactive CLI friction |
| D7 | Count | Default 20, reduce if small | Prevents trivial filler questions |
| D8 | Difficulty | Four progressive tiers | Builds mastery from recall to analysis |
| D9 | Choice rules | Seven structural rules | Removes guessing shortcuts |
| D10 | Explanations | Correct plus distractors | Explains why wrong options fail |
| D11 | Verification | Blind check sub-agent | Detects ambiguous and duplicate answers |
| D12 | Language | Source and prompt language | Preserves code and user terms |
| D13 | Output path | `./quizzes/<slug>/index.html` | Keeps repository root clean |
| D14 | Brand shell | Style only, no logos | Avoids trademark misrepresentation |
| D15 | Assets | Self-contained HTML file | Allows offline use with zero network calls |
| D16 | Theme | OS preference plus toggle | Supports external projector display |
| D17 | Feedback | Learn mode with review | Reinforces memory on answer selection |
| D18 | Persistence | Storage with derived ID | Prevents state collision across versions |
| D19 | Runtime | Node.js ESM without packages | Fast execution with standard libraries |
| D20 | Formatting | Markdown compiled at build | Allows unit testing of HTML safety |
| D21 | Shuffling | Build-time position balance | Keeps stored progress indices stable |
| D22 | Controls | Responsive slides with keys | Enables fast keyboard navigation |
| D23 | Citations | Git permalink with commit SHA | Prevents broken source references |
| D24 | Tests | Unit tests with `node:test` | Deterministic validation of compiler |
| D25 | Hosts | Claude Code first, generic steps | Runs on Claude Code and agy hosts |
| D26 | Motion | Free recipes, own confetti | Brings joy and feedback without input blocking |
| D27 | Score color | Green, amber, or red by score band | Shows the result level at a glance |
| D28 | Draft fields | Named roles, no kind field | Shorter draft, fewer rules |
| D29 | Core focus | Core list and regular-user test | Rejects niche details |

---

## 2. Packaging and scope (D1 to D6)

### D1: Packaging and skill name
- **Decision:** Dedicated source repository with skill at `skills/quiz/SKILL.md` and name `quiz`.
- **Reason:** A dedicated repository supports version control, continuous integration, and
  automated tests. The name `quiz` is concise, familiar, and fast to type.
- **Rejected alternative A:** Claude Code plugin format (`.claude-plugin/plugin.json`).
  Rejected because developers can add a plugin manifest later without changing the skill folder
  layout.
- **Rejected alternative B:** Writing directly into `~/.claude/skills/quiz`.
  Rejected because it lacks git tracking, issue tracking, and automated testing.
- **Rejected alternative C:** Names `make-quiz` or `exam`.
  Rejected because `quiz` is shorter and matches user expectations.

### D2: Target audience
- **Decision:** Target personal self-testing first, with optional sharing for team onboarding and
  peer testing. Formal exams are out of scope.
- **Reason:** Static HTML pages deliver code and data directly to the client browser. Anyone who
  inspects page source can read the answers.
- **Rejected alternative:** Formal exams with cheating prevention.
  Rejected because hiding answers requires an authenticated web server and database, which
  contradicts the single static file requirement.

### D3: Generation architecture
- **Decision:** Template plus data. The agent writes `quiz.json`, and `build.mjs` compiles it into
  `index.html`.
- **Reason:** Writing complete HTML, CSS, and JavaScript on every run causes visual drift and layout
  defects. Separating data from presentation allows schema validation and deterministic
  compilation.
- **Rejected alternative:** Model writes complete HTML, CSS, and JavaScript directly.
  Rejected because models introduce subtle styling defects, broken scripts, and visual
  inconsistencies across runs.

### D4: Supported resource types in v1
- **Decision:** Support current working directory, local paths, web URLs, PDFs, and topic prompts.
  Do not support EPUB.
- **Reason:** Code repositories, documentation sites, local files, and PDF guides cover most
  developer learning sources.
- **Rejected alternative:** Support EPUB files.
  Rejected because EPUB extraction requires external parsing libraries that standard runtime
  environments do not bundle.
- **Rejected alternative:** Unconstrained documentation crawling.
  Rejected because crawling entire domains causes network timeouts and token exhaustion. The skill
  limits crawling to 20 linked pages within the initial hostname.

### D5: Resource versus focus
- **Decision:** Both resource target and topic focus are optional in user prompts. When a prompt
  contains words with no path or URL, search the current working directory first. If the workspace
  contains matching files or symbols, treat the words as a focus inside the workspace. If the
  workspace contains no matching material, treat the words as a free-standing topic using web search
  and URL citations. Write the output to `quizzes/<slug>/` in the working directory. If the working
  directory is the home directory (`~`), ask the user where to save the output folder.
- **Reason:** Users expect `/quiz authentication` to focus on authentication code inside an active
  workspace, but expect `/quiz TCP congestion control` to generate a conceptual quiz from web
  sources when not in a networking project.
- **Rejected alternative:** Mandatory resource parameter.
  Rejected because requiring users to specify the current path adds unnecessary setup steps.
- **Rejected alternative:** Uniform file traversal without importance weighting.
  Rejected because treating lock files, generated bundles, and vendor folders equally wastes
  model context. The skill weights core modules and public interfaces.
- **Rejected alternative:** Always treat ambiguous words as workspace focus.
  Rejected because running `/quiz quantum computing` in an unrelated repository would fail or
  produce distorted questions instead of exploring the intended subject via web research.

### D6: Clarifying questions
- **Decision:** Ask clarifying questions only when a target path does not exist, when a prompt has
  no resource and no focus words (such as a bare `/quiz` or only a question count) while the
  current working directory is empty or the home directory, or when a topic quiz runs in the home
  directory (`~`) to choose an output destination. If the prompt names an explicit URL, document,
  path, or topic, proceed without asking.
- **Reason:** Developers expect immediate execution when standard defaults exist or when the
  prompt provides an unambiguous resource or topic.
- **Rejected alternative:** Ask clarifying questions on every run.
  Rejected because asking confirmation questions for count, difficulty, or format slows down
  daily use.
- **Rejected alternative:** Never ask clarifying questions.
  Rejected because running without a resource or topic in an empty folder or home directory
  produces meaningless output.

---

## 3. Question mechanics (D7 to D12, D28, D29)

### D7: Question count and resource limits
- **Decision:** Default to 20 questions. Allow user prompts to override the count. If a resource
  is small, generate fewer questions and explain the reduction to the user.
- **Reason:** Twenty questions provide a focused fifteen-minute study session. Forcing 20 questions
  on small files creates trivial questions that test superficial details.
- **Rejected alternative:** Strict 20-question minimum.
  Rejected because small source files cannot produce 20 substantive questions without trivia.
- **Rejected alternative:** Fixed question count with no user override.
  Rejected because user prompts must have control over quiz length.

### D8: Difficulty progression
- **Decision:** Four balanced tiers: Fundamentals, Core, Advanced, and Expert. Enforce a strict
  no-trivia rule. If a question fails blind verification after two repair rounds, the agent
  authors one replacement question of the same tier. If that replacement also fails after two
  repair rounds, the agent removes the question, updates the question count, and notifies the
  user. Tier sizes must differ by at most 1 question across all four tiers.
- **Reason:** Gradual progression builds confidence before introducing complex code tracing and
  architectural analysis. The no-trivia rule prevents questions about line numbers or arbitrary
  variable names. One replacement attempt limits execution loops. Allowing tier sizes to differ by
  at most 1 handles unresolvable questions without failing the build.
- **Rejected alternative:** Uniform difficulty across all questions.
  Rejected because random difficulty spikes disorient learners.
- **Rejected alternative:** Free-form difficulty labels without strict tier definitions.
  Rejected because structured tiers allow the final score summary to show mastery by category.

### D9: Choice structure
- **Decision:** Exactly four choices per question: one correct, one obvious wrong, and two
  plausible wrong choices. Shuffled by code with balanced answer positions.
- **Reason:** Four choices eliminate binary guessing. Plausible distractors based on common
  misconceptions help learners identify knowledge gaps. Programmatic shuffling in code balances
  correct choices across positions A, B, C, and D, with at most a one-question difference when the
  total count is not a multiple of 4.
- **Rejected alternative:** Allow variable numbers of choices (2 to 5).
  Rejected because variable option counts complicate slide layouts and keyboard navigation bindings.
- **Rejected alternative:** Model shuffles choice positions.
  Rejected because models produce uneven position distributions without programmatic balancing.
- **Rejected alternative:** Include "All of the above" or "None of the above".
  Rejected because these choices encourage process-of-elimination guessing rather than domain
  understanding.

### D10: Explanations and citations
- **Decision:** Provide an explanation for the correct choice, a single-line rationale for each
  wrong choice, and a source citation with line ranges.
- **Reason:** Learners need to understand why an option is incorrect. Line citations provide direct
  evidence and paths for deeper verification.
- **Rejected alternative:** Explanation for the correct choice only.
  Rejected because learners who select plausible distractors receive no feedback explaining their
  specific mistake.
- **Rejected alternative:** Duplicating explanation text inside the correct choice rationale.
  Rejected because storing identical text in two places creates maintenance drift.

### D11: Question verification
- **Decision:** Use an independent blind verification sub-agent without access to the answer key.
- **Reason:** A blind sub-agent validates that each question has exactly one unambiguous answer
  supported by the source text before user delivery.
- **Rejected alternative:** No verification step.
  Rejected because unverified model outputs can contain ambiguities and invalid assumptions.
- **Rejected alternative:** Self-check by the generation agent.
  Rejected because self-evaluation carries confirmation bias and misses flawed assumptions.

### D12: Technical language
- **Decision:** Write every generated text with the sentence rules of ASD-STE100 Simplified
  Technical English: short sentences, one idea per sentence, the active voice, and simple tenses.
  Keep the domain terms of the source as technical names, which ASD-STE100 permits. Author in the
  language of the prompt. For a bare `/quiz` invocation, use the language of the conversation.
  The skill definition and documentation use ASD-STE100 too.
- **Reason:** A learner must understand a question on the first read, and the question must
  still name exact programming language constructs and established framework terms.
- **Rejected alternative:** Enforce the ASD-STE100 dictionary on domain terms. Rejected because
  replacing specialized programming terms with simplified words creates unnatural phrasing and
  confuses developers.
- **Rejected alternative:** Leave the sentence style to the model. Rejected because long
  sentences with several ideas made questions hard to read.

### D28: Draft choice fields
- **Decision:** The draft names each choice by its role. `answer` holds the text of the correct
  choice, `obviousWrong` holds one wrong choice, and `plausibleWrong` holds an array of two wrong
  choices. Each wrong choice has `text` and `rationale`. `build.mjs` derives the kind of each
  choice from its field, so the built page data keeps `kind`.
- **Reason:** The agent writes the draft as output tokens, and output is the largest time cost of
  a run. A list of choices repeated a `kind` field 80 times in a quiz of 20 questions. The named
  fields made four real drafts from 10.1% to 11.7% shorter. They also replace five validation
  rules with one shape rule, because a draft cannot hold a wrong count of a kind or a rationale on
  the correct choice.
- **Rejected alternative:** A list of four choices, each with a `kind` field.
  Rejected because the kind repeats in every choice and needs count checks.
- **Rejected alternative:** Tuples such as `[text, rationale]` in one `wrong` array.
  Rejected because the text and the rationale have no names. The tuples made the drafts about 15%
  shorter, but a swap would show the rationale as a choice on the slide, and no check can find it.

### D29: Core focus
- **Decision:** Before the draft, the agent gives a core list of 5 to 10 lines in its reply: the
  purpose, the main entry points, the main flow, the main data types, the common options, and
  the common failures. Every question comes from this list, and each tier goes deeper into the
  same core. The regular-user test rejects a question: a person who uses the resource every week
  must need the fact to use the resource correctly. The documentation of the resource anchors
  the test: a subject that the README, the main documentation page, or the table of contents
  names is core, and a subject that only the code shows is core only when it is the main flow.
- **Reason:** Quizzes asked about exit codes, license clauses, rare fallbacks, and internal
  helpers. A learner who studies a resource needs the part that every user meets. The tier
  targets alone sent the agent to the edges, because "edge cases" and "hidden assumptions" read
  as an invitation to niche details.
- **Rejected alternative:** A list of forbidden subjects only. Rejected because a list cannot name
  every niche subject, and a core list gives the agent the subjects to use.
- **Rejected alternative:** A niche check in the blind sub-agent. Rejected because the checker
  answers the questions and does not weigh subjects, and a check after the draft costs a repair
  round.

---

## 4. Output and presentation (D13 to D18, D26, D27)

### D13: Output location and deployment
- **Decision:** Save quizzes to `./quizzes/<slug>/index.html`. If the folder exists, append a
  numeric suffix such as `-2`. Skip `quizzes/` when exploring the current working directory.
  Print a one-line deployment hint, then offer to open the page in the browser. Open the page
  only when the user accepts.
- **Reason:** Subdirectories keep the root workspace clean. Static folders work directly with local
  file viewers and cloud hosting tools. Preventing overwrites protects previous quiz results.
- **Rejected alternative:** Save to root directory as `./quiz-<slug>.html`.
  Rejected because multiple quizzes clutter project root directories.
- **Rejected alternative:** Automatic background deployment via cloud CLI tools.
  Rejected because deploying code without user consent violates expected local tool boundaries.

### D14: Visual design and brand shell
- **Decision:** Adopt the Vercel monochrome visual design system, but omit Vercel logos and
  wordmarks.
- **Reason:** Clean typography, borders, and spacing produce readable slides. Omitting proprietary
  trademarks prevents confusion regarding content authorship.
- **Rejected alternative:** Include official Vercel header wordmark and footer triangle logo.
  Rejected because arbitrary third-party quizzes are not official Vercel publications.

### D15: Asset delivery
- **Decision:** Generate fully self-contained HTML files with inlined CSS and embedded font
  definitions. Store raw fonts in separate skill assets to preserve agent context.
- **Reason:** Self-contained files work without internet connections, avoid CORS restrictions,
  and operate when opened directly from disk. Keeping assets outside `template.html` prevents
  wasting model context tokens.
- **Rejected alternative:** Load stylesheets and fonts from external CDNs.
  Rejected because network requests fail during offline usage and introduce external
  dependencies.

### D16: Theme selection
- **Decision:** Match operating system preference by default, and provide a manual toggle button.
- **Reason:** Defaulting to system settings provides an expected baseline. Presenters display
  slides in conference rooms or on external monitors where bright ambient lighting makes dark
  backgrounds hard to read. Users need manual contrast control regardless of operating system
  settings.
- **Rejected alternative:** Strictly follow operating system with no toggle switcher.
  Rejected because presentation environments conflict with personal system settings.
  See section 7 for the conflict record.

### D17: Feedback and score modes
- **Decision:** Learn mode with instant answer feedback, end slide score ring and summary by tier,
  and a button to retry missed questions.
- **Reason:** Immediate feedback reinforces comprehension when a choice is made. The score ring
  and tier summaries highlight progress and specific knowledge gaps.
- **Rejected alternative:** Exam mode hiding feedback until the final slide.
  Rejected because delayed feedback reduces learning value for self-testing.
- **Rejected alternative:** Dual-mode switcher between learn and exam modes.
  Rejected because extra modes add interface complexity without improving personal self-testing.

### D18: Progress persistence
- **Decision:** Persist quiz answers in browser `localStorage` keyed by a derived identifier
  (`${slug}-${hash}`). Provide a restart button.
- **Reason:** Page reloads or citation lookups do not erase progress. Hashing draft contents
  prevents collisions between different revisions of a quiz.
- **Rejected alternative:** No persistence (reset on reload).
  Rejected because following citation links or refreshing the browser loses all answers.
- **Rejected alternative:** Key storage solely by slug.
  Rejected because regenerating a quiz with new questions at an existing slug would load obsolete
  answer state.

### D26: Motion and score celebrations
- **Decision:** Adopt three free transition patterns from `transitions.dev` (`08-page-side-by-side`
  enter half, `25-checkbox-check` icon stroke draw, and `18-texts-reveal` feedback rise) using
  tokens from `skills/transitions-dev/_root.css` at commit
  `598d3d6ad89dabb4bdf742fd2e887ca53914a888`.
  Implement custom lightweight DOM confetti for 100% scores. Enforce that all motion resides inside
  `@media (prefers-reduced-motion: no-preference)`.
- **Reason:** Transitions provide visual confirmation of learner actions and bring joy on quiz
  completion without blocking clicks or keyboard controls. Using the free recipes complies with
  `https://transitions.dev/terms.html`. The terms permit using free transition recipes in products,
  but forbid redistributing them as a standalone transition library. The transitions.dev confetti
  burst is a paid Pro item, so the skill implements an own 60-piece CSS confetti animation.
- **Adopted recipes:**
  - `08-page-side-by-side.md`: Enter half used for slide transitions. The incoming slide moves 8px
    from the direction of travel, fades from 0 to 1, and clears a 3px blur over 250 ms with
    `--ease-smooth-out`.
  - `25-checkbox-check.md`: SVG stroke draw animation on status icons over 350 ms.
  - `18-texts-reveal.md`: Feedback rise animation of 12px with fade and 3px blur over 500 ms,
    reused for the score band summary line. The notes under the choices use the same reveal with
    8px over 350 ms, inside a grid row that opens from zero height like an accordion.
- **Rejected alternatives (8 recipes):**
  - `02-number-pop-in.md`: Digit-by-digit spans in the score heading would break screen reader
    announcements. The 20-step count-up already provides score progression.
  - `26-spinning-counter.md`: A 1.4-second spinning slot reel with SVG motion blur resembles a
    gambling interface and requires complex JavaScript runtime generation.
  - `10-success-check.md`: A 40-pixel bob, 80-degree rotation, and 10-pixel blur are excessive for
    a simple validation indicator. The checkbox stroke draw is the light form.
  - `12-error-state-shake.md`: Shaking the card on an incorrect answer punishes the learner. The
    status cross and rationale text convey the result clearly without negative reinforcement.
  - `04-text-states-swap.md`: The progress indicator changes alongside the slide, which already
    animates. Adding a three-phase timer introduces JavaScript complexity for redundant feedback.
  - `09-icon-swap.md`: The theme button changes its icon on the same click that changes the colors
    of the whole page, so a morph between the icons adds motion and no information.
  - `14-skeleton-reveal.md`: The application holds all question data locally and loads nothing
    asynchronously.
  - `16-tabs-sliding.md`: The slide presentation contains no tabbed navigation interfaces.
- **Rejected alternative (transitions.dev Pro confetti):**
  - The transitions.dev confetti burst is a Pro item under `https://transitions.dev/terms.html`.
    The custom CSS confetti uses 60 colored elements and standard DOM cleanup without external
    assets.

### D27: Score band colors
- **Decision:** Color the score on the end slide by score band. A score of 70% or more is green
  (`--vbg-green-900`), 40% to 69% is amber (`--vbg-amber-900`), and less than 40% is red
  (`--vbg-red-900`). The band colors the ring fill and the percent. Each tier row also shows a dot
  in the band color of that tier. The bands use the thresholds of the score band summary line.
- **Reason:** The user requested color-coding on the score page, so a learner sees the result
  level at a glance. The count, the percent, and the summary line give the same result as text, so
  color is never the only cue. Each color has a contrast of at least 5.2 to 1 on the page
  background in both themes.
- **Rejected alternative:** Green and amber, with no color below 40%.
  Rejected because the user selected three bands. Red already marks a missed answer on the
  question slides.
- **Rejected alternative:** An ink ring that turns green only at 100%, with a pass or miss color
  for each tier.
  Rejected because it shows no level between a perfect score and a score with one miss.
- **Conflict:** `vercel.com/design.md` limits color to significant meaning. See section 7.

---

## 5. Execution and verification (D19 to D24)

### D19: Build runtime
- **Decision:** Implement `build.mjs` using Node.js ESM with zero external package dependencies.
  `SKILL.md` checks for `node` before execution.
- **Reason:** Node.js built-in modules (`node:fs`, `node:path`, `node:crypto`) provide complete
  JSON parsing, hashing, and file writing capabilities without `npm install` delay.
- **Rejected alternative:** Python 3 standard library.
  Rejected because web frontend tooling in this domain centers on JavaScript runtimes.
- **Rejected alternative:** Shell script using `cat` and sed.
  Rejected because shell concatenation lacks JSON schema validation and HTML escaping safeguards.

### D20: Markdown and code formatting
- **Decision:** Compile Markdown subsets and escape HTML entities inside `build.mjs` during the
  build step. Use Geist Mono for code blocks.
- **Reason:** Compiling during build time enables automated testing of escaping logic using
  `node:test` without browser instances. The browser receives clean, safe HTML.
- **Rejected alternative:** Client-side Markdown parser in template script.
  Rejected because client parsing increases payload size and risks browser script execution bugs.
- **Rejected alternative:** Full external Markdown library.
  Rejected because basic questions require only paragraphs, inline code, bold text, and code
  blocks.

### D21: Choice shuffling mechanics
- **Decision:** Perform deterministic choice shuffling and position balancing inside `build.mjs`
  at build time.
- **Reason:** Stable positions across page reloads keep `localStorage` indices valid.
  Equal distribution across A, B, C, and D positions eliminates guessing bias.
- **Rejected alternative:** Dynamic shuffling in client browser on page load.
  Rejected because dynamic shuffling breaks stored progress and invalidates review links.

### D22: Slide layout and navigation
- **Decision:** Responsive viewport slides with URL hash routing (`#1`, `#2`) and complete
  keyboard controls.
- **Reason:** Keyboard shortcuts (1 to 4, Enter, and Arrow keys) provide fast navigation. Hash
  routing supports browser history and direct question bookmarking.
- **Rejected alternative:** Fixed 16:9 aspect ratio container.
  Rejected because fixed aspect containers letterbox on mobile devices and vertical displays.

### D23: Citation links
- **Decision:** Build GitHub permalinks using commit SHAs when clean git remotes exist. Fall back
  to text line ranges when files have uncommitted changes or no remotes.
- **Reason:** Permalinks tied to specific commit SHAs remain valid as files change. Detecting
  dirty working trees prevents linking to incorrect line positions.
- **Rejected alternative:** Plain text line references only.
  Rejected because clickable links improve developer efficiency when verifying claims.
- **Rejected alternative:** GitHub links pointing to main or master branch.
  Rejected because branch pointers change over time, resulting in line number drift.

### D24: Test strategy
- **Decision:** Unit test `build.mjs` using the native `node:test` runner.
- **Reason:** Verifying JSON validation, HTML escaping, and choice balancing with zero test
  dependencies provides fast feedback during development.
- **Rejected alternative:** End-to-end browser testing with external browser drivers.
  Rejected because external browser drivers require separate binary downloads and extra runtime
  dependencies.
- **Rejected alternative:** Model evaluation test suites in v1.
  Rejected because model evals consume tokens and time before the compiler stabilizes.

---

## 6. Agent hosts (D25)

### D25: Multi-host support
- **Decision:** Support Claude Code first, using generic instructions in `SKILL.md`. Document
  one install command: `npx skills add qiao/quiz`.
- **Reason:** Writing generic steps (such as "start a sub-agent that cannot see the answer key")
  without proprietary tool names allows multiple agent hosts to run the skill. The skills CLI
  links the skill into the folder of each agent host, so the README needs no step for each host.
- **Rejected alternative A:** Claude Code only.
  Rejected because other agent hosts (such as agy) share identical skill folder structures and can
  execute the workflow.
- **Rejected alternative B:** Automated test matrix across multiple agent runtimes in v1.
  Rejected because testing multiple agent CLIs in CI adds maintenance overhead before the core
  compiler stabilizes.

---

## 7. Conflict records: theme toggle, stillness, and score color

This section records contradictions between the source design document and our implementation
choices, following documentation rule 4.

| Source document | External rule | Chosen rule | Reference |
|---|---|---|---|
| `vercel.com/design.md` | No visible switcher | Manual toggle button | Section 4 (D16) |
| `vercel.com/design.md` | Default to stillness | Transitions and confetti | Section 4 (D26) |
| `vercel.com/design.md` | Color only with meaning | Score band colors | Section 4 (D27) |

### Theme toggle

**Source rule:**
`http://vercel.com/design.md` specifies two constraints:
1. Section `Color, surfaces, and boundaries`: "Light and dark themes are implicit; do not add a
   visible switcher."
2. Section `Accessibility and responsive behavior`: "The page must remain usable in light and dark
   and across desktop and narrow screens without a visible theme switcher."

**Our implementation:**
The generated HTML page follows `prefers-color-scheme` by default, but includes an unobtrusive
manual theme toggle button in the header and binds the key `t` to toggle themes.

**Reason for divergence:**
Presenters display slides in conference rooms or on external monitors where bright ambient lighting
makes dark backgrounds hard to read. Users need manual contrast control regardless of operating
system settings.

### Stillness and motion

**Source rule:**
`http://vercel.com/design.md` section `Accessibility and responsive behavior` specifies:
"Default to stillness. Animations should be opt-in or reserved for intentional micro-interactions:
a subtle hover, a smooth accordion, a crisp drawer. Never add scroll reveals, staggered entry
animations, bounce effects, or parallax."

**Our implementation:**
The generated HTML page animates three state changes (slide enter, answer feedback, and score
count-up) and displays a one-time confetti burst for a perfect score. The answer feedback opens the
notes under the choices together, as a smooth accordion. The page uses no scroll reveals,
staggered entry, bounce effects, or parallax. Every animation and transition sits inside the media
query `@media (prefers-reduced-motion: no-preference)`. When the user enables reduced motion, all
animations are disabled and the page renders complete and static immediately.

**Reason for divergence:**
The user requested slide transitions and celebratory motion on the score page to bring joy upon
completing a quiz. Micro-interactions for slide advancement, icon drawing, feedback elevation, and
the score reveal provide visual feedback on learner progress without blocking input or delaying
interaction.

### Score color

**Source rule:**
`http://vercel.com/design.md` section `Color, surfaces, and boundaries` specifies: "Design in
monochrome. Use color only when it adds significant meaning to state, action, or data, and pair it
with a non-color cue. Do not turn a recommendation, savings figure, cost component, or longer bar
green merely because it is favorable or important."

**Our implementation:**
The end slide colors the score ring fill and the percent by score band: green, amber, or red. Each
tier row shows a dot in the band color of that tier. The count, the score band summary line, and
the "x of y" count of each tier give the same result as text. The count, the table text, and the
buttons stay monochrome.

**Reason for divergence:**
The user requested color-coding on the score page. The band is a state of the result, which the
rule permits. A green score is also a favorable figure, which the rule warns against, so this
record states the conflict openly.

---

## 8. Sources

- ASD-STE100 Simplified Technical English: <https://asd-ste100.org/>
- Vercel Brand Guidelines: <https://vercel.com/design.md>
- transitions.dev Terms: <https://transitions.dev/terms.html>
- Node.js Test Runner: <https://nodejs.org/api/test.html>
