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
| 10 | Filesystem layout | Where do built files and assets live? |
| 11 | Test plan | How do unit tests verify compiler reliability? |
| 12 | Sources | Where are the primary specifications? |

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
  | Phase 2: Draft (author 20 questions in 4 difficulty tiers)|
  +-----------------------------------------------------------+
         │
         ▼
  +-----------------------------------------------------------+
  | Phase 3: Blind Check (independent sub-agent verifies draft)|
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
   access to the resource. The sub-agent returns its chosen choice ID or reports `'ambiguous'` with
   a reason. The primary agent compares returned choices against the answer key and repairs
   failed questions. After two failed repair rounds, the agent removes the question, rebalances
   tier sizes, and informs the user.
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

The compiler `build.mjs` sits in the skill folder and operates as a script with zero external
dependencies. It requires Node.js version 18 or later for built-in crypto and test runner APIs.
When invoked from another project, `SKILL.md` resolves the absolute path to `build.mjs`.

### Command line interface

```bash
node <skill-dir>/build.mjs <path-to-quiz-draft.json> [--blind]
```

`build.mjs` writes `index.html` directly into the directory containing the input draft JSON file.

When passed `--blind`, `build.mjs` produces `quiz.blind.json` in the draft directory. The compiler
removes `kind`, `rationale`, and `explanation` fields from all choices and questions, and shuffles
choices. This prevents answer leakage to the verification sub-agent.

### Blind check verification loop

During Phase 3, the primary agent uses the blind payload to verify quiz quality:
1. The agent invokes an independent sub-agent with read access to the source material.
2. The sub-agent evaluates each question in `quiz.blind.json` without the answer key.
3. For each question, the sub-agent returns either its chosen choice ID (`'a'`, `'b'`, `'c'`, or
   `'d'`) or `'ambiguous'` with a concise explanation.
4. The primary agent checks returned answers against the draft answer key.
5. If the sub-agent selected a distractor or marked `'ambiguous'`, the agent revises the prompt,
   distractors, or explanation to resolve the ambiguity.
6. The verification allows up to two repair rounds per question. If a question fails after two
   rounds, the agent deletes the question, rebalances tier counts, and notifies the user.

### Validation rules

Before emitting HTML, `build.mjs` checks:
1. `title` and `source` must be non-empty strings. `slug` must match `^[a-z0-9]+(-[a-z0-9]+)*$`
   to prevent directory traversal outside `quizzes/`.
2. `questions` array must contain at least one question.
3. Every question must have `tier` in `[1, 2, 3, 4]`.
4. Every question must contain exactly four choices.
5. Exactly one choice per question must have `kind: 'correct'`.
6. Exactly one choice per question must have `kind: 'obvious-wrong'`.
7. Exactly two choices per question must have `kind: 'plausible-wrong'`.
8. Correct choice must not define `rationale`.
9. All three wrong choices must define non-empty `rationale` strings.

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
  /** Map of question index to chosen choice ID ('a'|'b'|'c'|'d') */
  answers: Record<number, 'a' | 'b' | 'c' | 'd'>;
  /** Current active slide index (0 = title, 1..N = questions, N+1 = end) */
  currentSlide: number;
}
```

The title and end slides provide a "Restart" button that clears this storage record and returns
the user to slide 0.

---

## 7. Slide interface

### Slide states

The deck contains three distinct slide views:

1. **Title slide (index 0):** Shows quiz title, resource source, question count, tier legend, and a
   "Start Quiz" button.
2. **Question slide (index 1 to N):** Shows tier badge, question progress ("5 of 20"), question
   prompt, four interactive choice cards, explanation reveal panel, citation link, and a "Next"
   button.
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

Event listeners ignore key inputs if the user focuses a form element or selects text on the slide.
The URL hash updates with each slide transition (`#0`, `#1`, ... `#21`) to enable browser history.

---

## 8. Fonts and typography

### Typography stack

The visual design uses monochrome typography based on Geist Sans and Geist Mono:

```css
:root {
  --font-sans: "Geist Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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

## 10. Filesystem layout

The skill components and outputs follow this file structure:

```text
skills/quiz/
├── SKILL.md              # Agent prompt instructions
├── build.mjs             # Zero-dependency compiler script
├── template.html         # HTML shell without inline fonts
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

## 11. Test plan

The build compiler undergoes unit testing using the native `node:test` runner.

### Test suite: `test/build.test.mjs`

The automated test suite verifies:
1. **Validation gates:** Rejects drafts missing fields, drafts with invalid tier numbers, and
   drafts with improper choice distributions.
2. **Shuffling balance:** Verifies that across 100 sample builds, choice positions A, B, C, and D
   receive equal allocation within 1 position margin.
3. **HTML escaping:** Validates that `<script>`, `onerror`, and HTML tags in Markdown prompts are
   correctly encoded.
4. **Script boundary safety:** Validates that `</script>` and `<!--` within embedded JSON data are
   escaped, reads the embedded JSON back from the generated HTML, and verifies that `JSON.parse`
   successfully parses the payload.
5. **Offline self-containment:** Validates that the output file contains zero external HTTP/HTTPS
   URL requests in `<link>` or `<script>` tags.

---

## 12. Sources

- ASD-STE100 Simplified Technical English: <https://asd-ste100.org/>
- SIL Open Font License 1.1: <https://openfontlicense.org/>
- Geist Font OFL License: <https://github.com/vercel/geist-font/blob/main/OFL.txt>
- Vercel Brand Guidelines: <https://vercel.com/design.md>
- Node.js Test Runner: <https://nodejs.org/api/test.html>
- Node.js Releases: <https://nodejs.org/en/about/previous-releases>
