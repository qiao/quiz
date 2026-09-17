# Technical design: quiz skill architecture

Status: draft, for review by the user. Date: 2026-09-16.

Note: all paths under `skills/` and `test/` are planned.

This document answers: how does the compiler and slide runtime work?

| Section | Title | Answers |
|---|---|---|
| 1 | End-to-end lifecycle | What are the five generation steps? |
| 2 | Data contracts | How are draft and built data models structured? |
| 3 | Build compiler | How does `build.mjs` validate and compile data? |
| 4 | Markdown and escaping | How does the compiler escape HTML safely? |
| 5 | Balanced shuffle | How does the compiler balance choice positions? |
| 6 | Identity and persistence | How does `localStorage` track quiz progress? |
| 7 | Slide interface | How do keyboard controls and slide states work? |
| 8 | Fonts and typography | How does the skill comply with font licensing? |
| 9 | Permalinks and citations | How does the compiler resolve source citations? |
| 10 | Skill instruction design | How does `SKILL.md` guide the agent through generation? |
| 11 | Visual design and accessibility | How do design tokens, themes, and accessibility work? |
| 12 | Filesystem layout | Where do built files and assets live? |
| 13 | Test plan | How do unit tests verify compiler reliability? |
| 14 | Sources | Where are the primary specifications? |

---

## 1. End-to-end lifecycle

The skill transforms resources into self-contained HTML slides through five sequential phases:

```text
  User Prompt: /quiz [resource] [focus]
         │
         ▼
  +-----------------------------------------------------------+
  | Phase 1: Explore (read cwd, files, URLs, or outline TOC)  |
  +-----------------------------------------------------------+
         │
         ▼
  +-----------------------------------------------------------+
  | Phase 2: Draft (author N questions, default 20)           |
  +-----------------------------------------------------------+
         │
         ▼
  +-----------------------------------------------------------+
  | Phase 3: Blind Check (blind sub-agent verifies draft)     |
  +-----------------------------------------------------------+
         │
         ▼
  +-----------------------------------------------------------+
  | Phase 4: Build (build.mjs validates, shuffles, compiles)  |
  +-----------------------------------------------------------+
         │
         ▼
  +-----------------------------------------------------------+
  | Phase 5: Report (print relative path and deploy hint)     |
  +-----------------------------------------------------------+
         │
         ▼
  Output: quizzes/<slug>/index.html
```

### Phase details

1. **Explore:** The agent identifies target files. If no path is given, it scans the current
   directory while ignoring `.git`, `node_modules`, lock files, and `quizzes/`. For large PDFs,
   it reads the table of contents first. For URLs, it crawls up to 20 pages on the same domain.
2. **Draft:** The agent selects an unused folder `quizzes/<slug>` before authoring. If
   `quizzes/<slug>` exists, the agent increments the suffix to `<slug>-2`. The agent authors
   questions into `quizzes/<slug>/quiz.json` conforming to the `QuizDraft` schema. It creates
   four equal tiers: Fundamentals, Core, Advanced, and Expert. Each question has one correct
   choice, one obvious wrong choice, and two plausible wrong choices.
3. **Blind Check:** The agent runs `node <skill-dir>/build.mjs quizzes/<slug>/quiz.json --blind`
   to generate `quizzes/<slug>/quiz.blind.json`. Code removes `kind`, `rationale`, and
   `explanation`, and shuffles choices. The agent invokes an independent sub-agent with read
   access to the resource, instructing it never to read `quizzes/`. The sub-agent writes answers
   into `quizzes/<slug>/answers.json`. The agent runs
   `node <skill-dir>/build.mjs quizzes/<slug>/quiz.json --grade answers.json` to grade the
   answers. Code maps shuffled letters back to draft choices and reports failed questions. The
   agent repairs failed questions. After two failed repair rounds, the agent replaces the
   question with a new question of the same tier and informs the user.
4. **Build:** The agent executes `node <skill-dir>/build.mjs quizzes/<slug>/quiz.json` using the
   absolute path of the skill folder. The script validates the draft against schema rules,
   balances choice positions, compiles Markdown to safe HTML, inlines CSS and font assets, and
   generates `quizzes/<slug>/index.html`.
5. **Report:** The agent outputs the file path, an open command
   (`open ./quizzes/<slug>/index.html`), and a static hosting deployment hint.

---

## 2. Data contracts

The architecture separates the authoring draft from the compiled page data.

```text
+---------------------+               +---------------------+
|      QuizDraft      |               |      BuiltQuiz      |
|---------------------|               |---------------------|
| title: string       |               | id: string          |
| slug: string        |  build.mjs    | title: string       |
| source: string      | ------------> | slug: string        |
| questions: [...]    |   compiles    | source: string      |
+---------------------+               | createdAt: string   |
           │                          | questions: [...]    |
           ▼                          +---------------------+
+---------------------+                          │
|    DraftQuestion    |                          ▼
|---------------------|               +---------------------+
| tier: 1 | 2 | 3 | 4 |               |    BuiltQuestion    |
| prompt: string      |               |---------------------|
| explanation: string |               | id: number          |
| citation: {...}     |               | tier: 1 | 2 | 3 | 4 |
| choices: [4 items]  |               | tierName: string    |
+---------------------+               | promptHtml: string  |
           │                          | explanationHtml:... |
           ▼                          | citation: {...}     |
+---------------------+               | choices: [4 items]  |
|     DraftChoice     |               +---------------------+
|---------------------|                          │
| text: string        |                          ▼
| kind: ChoiceKind    |               +---------------------+
| rationale?: string  |               |     BuiltChoice     |
+---------------------+               |---------------------|
                                      | id: "a"|"b"|"c"|"d" |
                                      | textHtml: string    |
                                      | kind: ChoiceKind    |
                                      | rationaleHtml?: ... |
                                      +---------------------+
```

### TypeScript definitions

```typescript
export type ChoiceKind = 'correct' | 'plausible-wrong' | 'obvious-wrong';

export interface DraftCitation {
  /** Target file path relative to repository root, chapter, or URL */
  target: string;
  /** Start line number in source text */
  lineStart?: number;
  /** End line number in source text */
  lineEnd?: number;
  /** Page number for PDF citations */
  page?: number;
}

export interface DraftChoice {
  /** Option text in plain text or Markdown */
  text: string;
  /** Kind classification */
  kind: ChoiceKind;
  /** Rationale explaining error (present only on wrong choices) */
  rationale?: string;
}

export interface DraftQuestion {
  /** Difficulty tier from 1 to 4 */
  tier: 1 | 2 | 3 | 4;
  /** Markdown question prompt */
  prompt: string;
  /** Exactly four choices */
  choices: DraftChoice[];
  /** Detailed explanation for why the correct choice is right */
  explanation: string;
  /** Document citation */
  citation: DraftCitation;
}

export interface QuizDraft {
  /** Human-readable quiz title */
  title: string;
  /** Directory and URL slug matching ^[a-z0-9]+(-[a-z0-9]+)*$ */
  slug: string;
  /** Resource name or path */
  source: string;
  /** Ordered draft questions */
  questions: DraftQuestion[];
}

export interface BuiltCitation {
  /** Target file path relative to repository root, chapter, or URL */
  target: string;
  /** Start line number */
  lineStart?: number;
  /** End line number */
  lineEnd?: number;
  /** Page number for PDF citations */
  page?: number;
  /** Resolved web permalink when git remote exists */
  url?: string;
}

export interface BuiltChoice {
  /** Display letter after balance shuffle: a, b, c, or d */
  id: 'a' | 'b' | 'c' | 'd';
  /** Rendered safe HTML */
  textHtml: string;
  /** Kind classification */
  kind: ChoiceKind;
  /** Rendered safe HTML rationale for wrong choices */
  rationaleHtml?: string;
}

export interface BuiltQuestion {
  /** One-based sequence number */
  id: number;
  /** Difficulty tier */
  tier: 1 | 2 | 3 | 4;
  /** Tier display name */
  tierName: 'Fundamentals' | 'Core' | 'Advanced' | 'Expert';
  /** Rendered safe HTML prompt */
  promptHtml: string;
  /** Exactly four choices with balanced positions */
  choices: BuiltChoice[];
  /** Rendered safe HTML explanation */
  explanationHtml: string;
  /** Resolved citation */
  citation: BuiltCitation;
}

export interface BuiltQuiz {
  /** Content-derived quiz identifier */
  id: string;
  /** Quiz title */
  title: string;
  /** Directory and URL slug matching ^[a-z0-9]+(-[a-z0-9]+)*$ */
  slug: string;
  /** Resource description */
  source: string;
  /** ISO 8601 build timestamp */
  createdAt: string;
  /** Compiled questions */
  questions: BuiltQuestion[];
}
```

---

## 3. Build compiler

The compiler `build.mjs` sits in the skill folder. It runs as a script with zero external
dependencies. It requires Node.js version 18 or later for built-in crypto and test runner APIs.
When invoked from another project, `SKILL.md` resolves the absolute path to `build.mjs`.

### Command line interface

```bash
node <skill-dir>/build.mjs <path-to-quiz-draft.json> [--blind] [--grade <answers.json>]
```

`build.mjs` writes `index.html` directly into the directory containing the input draft JSON file.

When passed `--blind`, `build.mjs` produces `quiz.blind.json` in the draft directory. The compiler
removes `kind`, `rationale`, and `explanation` fields from all choices and questions, and shuffles
choices with the seeded generator. This prevents answer leakage to the verification sub-agent.

When passed `--grade <path-to-answers.json>`, `build.mjs` compares the sub-agent answers against
the draft key. Code maps shuffled choices back to draft choices using the question seed. The
compiler prints a JSON report of passed questions and failed questions with error reasons.

### Blind check verification loop

During Phase 3, the primary agent uses code to verify quiz quality:
1. The primary agent runs `node <skill-dir>/build.mjs quizzes/<slug>/quiz.json --blind`.
2. The agent invokes an independent sub-agent with read access to the source material. The
   sub-agent instructions forbid reading files in `quizzes/` to prevent answer key exposure.
3. The sub-agent evaluates each question in `quiz.blind.json` without the answer key.
4. For each question, the sub-agent records either its chosen choice ID (`'a'`, `'b'`, `'c'`, or
   `'d'`) or `'ambiguous'` with an explanation in `answers.json`.
5. The primary agent executes `build.mjs --grade` to evaluate the answers.
6. If a choice is wrong or marked `'ambiguous'`, the agent revises the prompt, distractors, or
   explanation to resolve the ambiguity.
7. The verification allows up to two repair rounds per question. If a question fails after two
   rounds, the agent replaces it with a new question of the same tier and notifies the user.

### Validation rules

Before emitting HTML, `build.mjs` checks:
1. `title` and `source` must be non-empty strings. `slug` must match `^[a-z0-9]+(-[a-z0-9]+)*$`
   to prevent directory traversal outside `quizzes/`.
2. `questions` array must contain at least one question.
3. Every question must have `tier` in `[1, 2, 3, 4]`.
4. Question tiers must be non-decreasing: `tier` never decreases from one question to the next.
5. Tier sizes must match D8: for `N` questions, each tier holds `Math.floor(N / 4)` questions,
   distributing remainders to earlier tiers.
6. The prompt, each choice text, the explanation, and the citation target must not be empty.
7. Every question must contain exactly four choices, and no two choices may have identical text.
8. Exactly one choice per question must have `kind: 'correct'`.
9. Exactly one choice per question must have `kind: 'obvious-wrong'`.
10. Exactly two choices per question must have `kind: 'plausible-wrong'`.
11. The correct choice must not define `rationale`.
12. All three wrong choices must define non-empty `rationale` strings.
13. If `lineStart` and `lineEnd` are present in a citation, `lineEnd` must not be less than
    `lineStart`.
14. Unknown fields in draft objects trigger validation errors to detect property typos.

### Error format

When validation fails, `build.mjs` prints structured error diagnostics to standard error and exits
with code 1:

```text
VALIDATION ERROR in quizzes/auth/quiz.json:
- Question 3: expected exactly one 'correct' choice, found 0
- Question 7, Choice 2 ('obvious-wrong'): missing required 'rationale'
```

---

## 4. Markdown and escaping

`build.mjs` compiles Markdown and escapes HTML entities at build time. The client browser performs
zero runtime Markdown parsing.

### Supported Markdown subset

The build compiler supports:
- Paragraphs separated by blank lines (`<p>...</p>`).
- Inline code wrapped in single backticks (`<code>...</code>`).
- Fenced code blocks with optional language tag (`<pre><code>...</code></pre>`).
- Strong text wrapped in double asterisks (`<strong>...</strong>`).
- Emphasis wrapped in single asterisks (`<em>...</em>`).
- Unordered lists beginning with hyphens (`<ul><li>...</li></ul>`).

### Escaping safeguards

1. Raw prompt and choice text passes through HTML entity encoding (`&`, `<`, `>`, `"`, `'`).
2. Fenced code block contents pass through HTML entity encoding before insertion into `<code>` tags.
3. Embedded JSON in the HTML page replaces every `<` character with the unicode escape
   `\u003c`. This single rule covers `</script>` and `<!--` sequences while keeping the payload
   valid JSON that `JSON.parse` parses directly in the browser.

---

## 5. Balanced shuffle

To prevent positional guessing, `build.mjs` distributes correct choices evenly across positions
`a`, `b`, `c`, and `d`.

### Shuffle algorithm

1. Determine target assignment counts for `N` questions: `Math.floor(N / 4)` questions per slot,
   distributing remainders to earlier slots.
2. Build an array of position targets (for example: `['a', 'b', 'c', 'd', 'a', 'b', ...]`).
3. Deterministically shuffle this target array using a seed derived from the quiz identifier
   (`quizId`, which combines the slug and the content hash).
4. For question `i`, place the correct choice into target position `P[i]`.
5. Shuffle the three distractors with the same seeded generator, and place them into the three
   open positions.
6. Assign choice IDs `'a'`, `'b'`, `'c'`, and `'d'` according to their final slot.

---

## 6. Identity and persistence

### Quiz identifier derivation

`build.mjs` computes the unique quiz identifier using the slug and a SHA-256 content hash:

```javascript
const hash = crypto.createHash('sha256')
  .update(JSON.stringify(draft.questions))
  .digest('hex')
  .slice(0, 8);
const quizId = `${draft.slug}-${hash}`;
```

This prevents collisions when multiple quizzes share a domain or when a quiz regenerates with new
questions.

### Local storage record

The browser persists state in `localStorage` under `quiz:<quizId>:state`:

```typescript
export interface StoredQuizState {
  /** Map of BuiltQuestion.id to chosen choice ID ('a'|'b'|'c'|'d') */
  answers: Record<number, 'a' | 'b' | 'c' | 'd'>;
  /** Current active slide index (0 = title, 1..N = questions, N+1 = end) */
  currentSlide: number;
}
```

The `answers` map keys by `BuiltQuestion.id` (one-based question sequence number).

At page load, slide navigation resolves with this precedence:
1. If the URL contains a valid slide hash (`#0` to `#(N+1)`), the URL hash wins and determines the
   active slide.
2. If the URL contains no hash, `currentSlide` from `localStorage` determines the active slide.
3. If `localStorage` holds no saved record, the presentation opens on slide 0 (title slide).

The title and end slides provide a "Restart" button that clears `quiz:<quizId>:state` from
`localStorage` and resets the presentation to slide 0.

---

## 7. Slide interface

### Slide states

The deck contains three distinct slide views:

1. **Title slide (index 0):** Shows quiz title, resource source, question count, tier legend, and a
   "Start Quiz" button.
2. **Question slide (index 1 to N):** Shows tier badge, question progress ("5 of 20"), question
   prompt, four interactive choice cards, explanation reveal panel, citation link, a "Back" button,
   and a "Next" button.
3. **End slide (index N + 1):** Shows total score percentage, score breakdown per tier, links to
   missed questions, a "Retry Missed Questions" button, and a "Restart" button.

### Keyboard bindings

| Key | Action |
|---|---|
| `1` or `a` | Select choice A |
| `2` or `b` | Select choice B |
| `3` or `c` | Select choice C |
| `4` or `d` | Select choice D |
| `Enter` or `Right Arrow` | Advance to next slide |
| `Left Arrow` | Return to previous slide |
| `t` | Toggle theme between light and dark |

The global key listener ignores inputs when the user focuses a form element or selects text on
the slide. To prevent double activation where `Enter` selects a choice button and immediately
advances the slide, the global handler ignores `Enter` when focus sits on a button.
The URL hash updates with each slide transition (`#0`, `#1`, ... `#21`) to enable browser history.

### Slide navigation and retry flow

1. **Answer selection requirement:** On question slides, the learner must select an answer
   before advancing. The "Next" button and keyboard forward keys (`Enter`, `Right Arrow`) remain
   disabled until a choice is clicked. Selecting a choice reveals the explanation panel and
   activates advancement controls.
2. **Backward navigation:** Learners can return to previous questions by clicking the "Back"
   button or pressing `Left Arrow`. Answered questions display the selected choice, distractor
   rationale, and correct explanation.
3. **Retry missed questions:** Clicking "Retry Missed Questions" keeps all questions in the deck
   and preserves correct answers in `answers`. It deletes only the keys for incorrect questions
   from `answers`, and navigates to the first missed question slide. When the learner returns
   to the end slide, the view recalculates and displays the updated score, updated tier breakdown,
   and any remaining missed questions.

---

## 8. Fonts and typography

### Typography stack

The visual design uses monochrome typography based on Geist and Geist Mono:

```css
:root {
  --font-sans: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: "Geist Mono", SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
```

### SIL Open Font License 1.1 compliance

Geist fonts are licensed under the SIL Open Font License 1.1 (OFL-1.1). Condition 2 of OFL-1.1
requires including the copyright notice and license text when bundling or redistributing font
software. Because each generated HTML page embeds the font software as base64 data, each output
page is a redistribution copy.

The upstream `OFL.txt` defines:
- Copyright notice:
  `Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font)`
- No Reserved Font Name (RFN), permitting subsetted fonts to keep the name "Geist".

The skill satisfies license requirements through three mechanisms:
1. **Repository license file:** `skills/quiz/assets/OFL.txt` vendors the complete license text
   (4,383 bytes) from `vercel/geist-font` on branch `main`.
2. **Asset header:** `skills/quiz/assets/fonts.css` begins with the exact copyright notice.
3. **Compiled HTML comment:** `build.mjs` embeds the full vendored `OFL.txt` license text as an
   HTML comment inside each generated page.

---

## 9. Permalinks and citations

The compiler resolves citation permalinks during compilation:

1. `build.mjs` checks if the cited file sits inside a git repository using
   `git rev-parse --show-toplevel`. Citation paths are relative to this repository root.
2. It checks whether `HEAD` is on a remote-tracking branch by running
   `git branch -r --contains HEAD`. If the command produces no output, the commit is not pushed
   to a remote, and `build.mjs` sets `citation.url` to `undefined`. This check reads local refs
   and makes no network calls.
3. It checks for uncommitted changes using `git status --porcelain <target-file>`. If the file has
   uncommitted changes, `citation.url` remains `undefined`.
4. It reads the remote URL using `git remote get-url origin`. If the remote URL uses the SSH form
   (`git@github.com:org/repo.git`), `build.mjs` converts it to HTTPS
   (`https://github.com/org/repo`).
5. Version 1 supports GitHub remotes only. If the repository points to GitHub, the compiler
   formats a direct link: `https://github.com/<org>/<repo>/blob/<commit>/<path>#L15-L32`.
   For PDF citations with a page number, it formats `#page=N`.
6. If any check fails, the slide displays plain text line numbers (`path/to/file.ts:15-32`) or
   page numbers (`document.pdf:p.12`).
7. All citation links open in a new tab with `target="_blank" rel="noopener noreferrer"`.

---

## 10. Skill instruction design

`SKILL.md` contains the operational instructions for the AI agent.

### Runtime environment check

The agent verifies that Node.js sits on the system path and meets the version requirement:
1. Run `node --version`.
2. Parse the major version number.
3. If Node.js is missing or below version 18, stop execution and report that the build compiler
   requires Node.js 18 or later.

### Path discovery

The agent identifies the absolute path to its skill folder from the location of `SKILL.md`. It uses
this directory path to access:
- `references/question-rules.md` during authoring.
- `build.mjs` during blind checks and compilation.
- `template.html` and assets during build operations.

### Prompt parsing

The agent extracts key parameters from natural language prompts:
- **Question count:** It parses explicit count phrases (for example, "10 questions", "count: 8").
  When omitted, the count defaults to 20 questions.
- **Language:** The agent generates questions in the language of the prompt. For a bare `/quiz`
  invocation with no prompt text, it uses the language of the conversation.

### Clarifying questions

The agent asks a clarifying question before authoring when:
1. The working directory is empty.
2. The working directory is the user home directory (`~`), where recursive scanning would inspect
   unrelated personal files.

### Canonical question rules

`skills/quiz/references/question-rules.md` holds the single canonical source of question authoring
rules. The agent reads this file during Phase 2. The file specifies:
- Progressive tiers from Fundamentals to Expert (D8).
- The prohibition on trivia such as arbitrary numbers or variable names.
- Choice composition: 1 correct, 1 obvious wrong, and 2 plausible wrong (D9).
- Quality standards for distractors and misconceptions (D10).

### Step sequence

`SKILL.md` directs the agent through nine execution steps:
1. Verify Node.js runtime version.
2. Resolve absolute skill directory path.
3. Parse prompt parameters and ask clarifying questions if the scope is ambiguous.
4. Scan and read source material.
5. Read `references/question-rules.md`.
6. Select an unused directory `quizzes/<slug>/`.
7. Author draft questions into `quiz.json`.
8. Execute blind verification: generate `quiz.blind.json` with `--blind`, invoke the sub-agent
   with instructions forbidding access to `quizzes/`, collect answers, and evaluate them with
   `build.mjs --grade`.
9. Compile the slide deck with `build.mjs` and report the local file path.

---

## 11. Visual design system and accessibility

`skills/quiz/tokens.css` defines the visual tokens specified in `vercel.com/design.md`.

### Design tokens

`skills/quiz/tokens.css` defines tokens sourced from `vercel-brand.css`. The interface designs in
monochrome in accordance with `design.md`. Color indicates only validation results and focus
states. Every color cue accompanies a non-color cue, such as an icon or status word. Each color
token uses CSS `light-dark(<light>, <dark>)`:

- **Surfaces (from `vercel-brand.css`):**
  - Canvas background: `--vbg-background-100: light-dark(oklch(1 0 0), oklch(0 0 0))`
  - Card surface: `--vbg-background-200: light-dark(oklch(0.984 0 0), oklch(0.027 0 0))`
- **Typography and borders (from `vercel-brand.css`):**
  - Primary text: `--vbg-gray-1000: light-dark(oklch(0.205 0 0), oklch(0.946 0 0))`
  - Secondary text: `--vbg-gray-900: light-dark(oklch(0.42 0 0), oklch(0.706 0 0))`
  - Subtle border: `--vbg-gray-alpha-300: light-dark(oklch(0 0 0 / 0.1), oklch(1 0 0 / 0.13))`
  - Default border: `--vbg-gray-alpha-400: light-dark(oklch(0 0 0 / 0.08), oklch(1 0 0 / 0.14))`
- **Semantic indicators (from `vercel-brand.css`):**
  - Focus ring (`--vbg-focus`): light uses blue-700 (`oklch(57.61% 0.2508 258.23)`), and dark uses
    blue-900 (`oklch(71.7% 0.1648 250.794)`).
  - Success (`--vbg-green-900`): light uses `oklch(51.75% 0.1453 147.65)`, and dark uses
    `oklch(73.1% 0.2158 148.29)`.
  - Error (`--vbg-red-700`): light uses `oklch(62.56% 0.2524 23.03)`, and dark uses
    `oklch(62.56% 0.2234 23.03)`.
- **Spacing scale (from `vercel-brand.css`):**
  Values map 4px (`--vbg-space-1`), 8px (`--vbg-space-2`), 12px (`--vbg-space-3`), 16px
  (`--vbg-space-4`), 20px (`--vbg-space-5`), 24px (`--vbg-space-6`), 32px (`--vbg-space-8`),
  40px (`--vbg-space-10`), 48px (`--vbg-space-12`), and 64px (`--vbg-space-16`).
- **Border radius (from `vercel-brand.css`):**
  `--vbg-radius-small: 6px` and `--vbg-radius: 8px`. The interface uses no other radii.
- **Type scale (from `vercel-brand.css`):**
  Display `3rem`, page title `2.5rem`, title `2rem`, section `1.5rem`, subsection `1.25rem`, lede
  `1.125rem`, body `1rem`, compact `0.875rem`, and label or metadata `0.8125rem`.
- **Typography families (from `vercel-brand.css`):**
  `"Geist"` for sans-serif text and `"Geist Mono"` for monospace code.

### Theme configuration and resolution

The page sets theme styling through the `data-theme` attribute on the root `<html>` element. The
browser persists the user choice under the `localStorage` key `quiz:theme`.

At page load, the client resolves theme state in this order:
1. `localStorage.getItem('quiz:theme')`: if the value is `'light'` or `'dark'`, this setting wins.
2. `window.matchMedia('(prefers-color-scheme: dark)')`: if matching, the page selects dark mode.
3. Fallback: if no setting or media preference matches, the page defaults to light mode.

Pressing `t` toggles `data-theme` between `'light'` and `'dark'`, and saves the new value into
`localStorage`.

### Motion and focus styles

Following the "Accessibility and responsive behavior" section of `vercel.com/design.md`:
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` disables slide transitions and
  animations (`transition: none; animation: none`).
- **Focus rings:** All interactive controls display a visible focus indicator using
  `:focus-visible` with a 2-pixel solid outline and a 2-pixel offset.

### Accessibility structure

The slide presentation complies with WCAG 2.1 AA requirements:
- **Interactive choice elements:** Each choice renders as an HTML `<button>` element with
  `type="button"`. This provides default keyboard activation through `Space` and `Enter`.
- **Screen reader announcements:** A container with `aria-live="polite"` and `aria-atomic="true"`
  announces answer validation outcomes and explanations when the learner selects a choice.

---

## 12. Filesystem layout

The skill components and outputs follow this file structure:

```text
skills/quiz/
├── SKILL.md              # Agent prompt instructions
├── build.mjs             # Zero-dependency compiler script
├── template.html         # HTML shell without inline fonts
├── tokens.css            # Design tokens copied from design.md
├── references/
│   └── question-rules.md # Canonical question authoring rules
└── assets/
    ├── fonts.css         # WOFF2 base64 webfonts and CSS rules
    └── OFL.txt           # SIL Open Font License 1.1 text

quizzes/
└── <slug>/
    ├── quiz.json         # Authoring draft (QuizDraft)
    └── index.html        # Compiled self-contained presentation (BuiltQuiz)
```

The agent picks an unused folder before writing the draft. If directory `quizzes/<slug>` exists,
the agent checks for `quizzes/<slug>-2`, incrementing the integer suffix until finding an unused
directory name. `build.mjs` writes `index.html` directly alongside `quiz.json`.

---

## 13. Test plan

Unit tests verify compiler behavior using the native `node:test` runner.

### Test suite: `test/build.test.mjs`

The automated test suite verifies:
1. **Validation gates:** Rejects drafts missing fields, drafts with invalid tier numbers, drafts
   with descending tiers, drafts with improper choice distributions, and drafts with invalid slugs
   (such as `../../slug`).
2. **Deterministic builds:** Accepts `SOURCE_DATE_EPOCH` or an environment override to set
   `createdAt` so tests produce reproducible output across runs.
3. **Shuffling balance:** Verifies that across 100 sample builds, choice positions A, B, C, and D
   receive equal allocation within a 1-position margin.
4. **HTML escaping:** Validates that `<script>`, `onerror`, and HTML tags in Markdown prompts are
   correctly encoded into safe HTML entities.
5. **Script boundary safety and parsing:** Validates that `</script>` and `<!--` within embedded
   JSON data are escaped with `\u003c`, extracts the embedded JSON payload directly from the
   generated HTML, and verifies that `JSON.parse` parses the payload without error.
6. **Offline self-containment:** Validates that the output file contains zero external HTTP or
   HTTPS requests in `<link>` tags, `<script>` tags, or CSS `url()` and `@import` rules.

---

## 14. Sources

- ASD-STE100 Simplified Technical English: <https://asd-ste100.org/>
- SIL Open Font License 1.1: <https://openfontlicense.org/>
- Geist Font OFL License: <https://github.com/vercel/geist-font/blob/main/OFL.txt>
- Vercel Brand Guidelines: <https://vercel.com/design.md>
- Node.js Test Runner: <https://nodejs.org/api/test.html>
- Node.js Releases: <https://nodejs.org/en/about/previous-releases>
- Reproducible Builds Specification: <https://reproducible-builds.org/specs/source-date-epoch/>
