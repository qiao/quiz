# Technical design: quiz skill architecture

Status: current. Date: 2026-09-16.

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
3. **Blind Check:** The agent runs `node <skill-dir>/build.mjs quizzes/<slug>/quiz.json --blind` to
   generate `quizzes/<slug>/quiz.blind.json`. Code keeps only the prompt, the citation, and the four
   choice texts of each question, so no field shows the answer, and shuffles choices. The agent
   starts an independent sub-agent with read access to the resource, giving it the path of
   `quiz.blind.json` and instructing it never to read any other path in `quizzes/`. The sub-agent
   returns its answers in its final message as JSON matching `SubAgentAnswerFile`. The agent writes
   that JSON to `quizzes/<slug>/answers.json` and runs `node <skill-dir>/build.mjs
   quizzes/<slug>/quiz.json --grade quizzes/<slug>/answers.json`. Code maps shuffled letters back to
   draft choices and reports failed questions. The agent repairs failed questions. After any edit,
   the agent re-runs `--blind` and re-verifies all questions. After two failed repair rounds, the
   agent replaces the question with a new question of the same tier. If the replacement question
   also fails after two repair rounds, the agent removes the question, reports the removal to the
   user, and proceeds.
4. **Build:** When every question passes, the same `--grade` command builds the page, so the
   agent runs no separate build command. The script validates the draft against schema rules,
   balances choice positions, compiles Markdown to safe HTML, inlines CSS and font assets, and
   generates `quizzes/<slug>/index.html`. The command with no flag
   (`node <skill-dir>/build.mjs quizzes/<slug>/quiz.json`) builds the same page with no grade, for
   example after a template change.
5. **Report:** The agent outputs the file path, an operating system open command (`open` on
   macOS, `xdg-open` on Linux, `start` on Windows), and a static hosting deployment hint (for
   example, `npx vercel quizzes/<slug>`). The agent then offers to open the page in the browser,
   and runs the open command only when the user accepts. A session that cannot wait for an
   answer prints the command and stops.

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
| answer: string      |               | id: number          |
| obviousWrong: {...} |               | tier: 1 | 2 | 3 | 4 |
| plausibleWrong: [2] |               | tierName: string    |
| explanation: string |               | promptHtml: string  |
| citation: {...}     |               | explanationHtml:... |
+---------------------+               | citation: {...}     |
           │                          | choices: [4 items]  |
           ▼                          +---------------------+
+---------------------+                          │
|     WrongChoice     |                          ▼
|---------------------|               +---------------------+
| text: string        |               |     BuiltChoice     |
| rationale: string   |               |---------------------|
+---------------------+               | id: "a"|"b"|"c"|"d" |
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

export interface WrongChoice {
  /** Option text in plain text or Markdown */
  text: string;
  /** Reason that the choice is wrong, in Markdown */
  rationale: string;
}

export interface DraftQuestion {
  /** Difficulty tier from 1 to 4 */
  tier: 1 | 2 | 3 | 4;
  /** Markdown question prompt */
  prompt: string;
  /** Text of the one correct choice, in Markdown */
  answer: string;
  /** Wrong choice that basic domain knowledge rules out */
  obviousWrong: WrongChoice;
  /** Exactly two wrong choices that model real mistakes */
  plausibleWrong: [WrongChoice, WrongChoice];
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

export interface BlindChoice {
  /** Display letter after balance shuffle: 'a' | 'b' | 'c' | 'd' */
  id: 'a' | 'b' | 'c' | 'd';
  /** Option text without answer markers */
  text: string;
}

export interface BlindQuestion {
  /** One-based sequence number matching draft position */
  id: number;
  /** Difficulty tier from 1 to 4 */
  tier: 1 | 2 | 3 | 4;
  /** Markdown question prompt */
  prompt: string;
  /** Exactly four choices shuffled deterministically */
  choices: BlindChoice[];
  /** Document citation */
  citation: DraftCitation;
}

export interface BlindQuiz {
  /** Human-readable quiz title */
  title: string;
  /** Directory and URL slug matching ^[a-z0-9]+(-[a-z0-9]+)*$ */
  slug: string;
  /** Resource name or path */
  source: string;
  /** Ordered blind questions stripped of answer keys */
  questions: BlindQuestion[];
}

export interface SubAgentAnswer {
  /** One-based question sequence number matching BlindQuestion.id */
  questionId: number;
  /** Selected choice letter or 'ambiguous' flag */
  choice: 'a' | 'b' | 'c' | 'd' | 'ambiguous';
  /** Explanation required when choice is 'ambiguous' */
  reason?: string;
}

export interface SubAgentAnswerFile {
  /** Collection of evaluated question answers */
  answers: SubAgentAnswer[];
}

export interface GradeFailure {
  /** One-based question sequence number */
  questionId: number;
  /** Difficulty tier from 1 to 4 */
  tier: 1 | 2 | 3 | 4;
  /** Diagnosis explaining why verification failed */
  reason: string;
}

export interface GradeReport {
  /** Boolean indicating whether all questions passed verification */
  passed: boolean;
  /** Total count of evaluated questions */
  totalQuestions: number;
  /** Count of questions verified successfully */
  passedCount: number;
  /** Detailed list of verification failures */
  failures: GradeFailure[];
  /** Path of the index.html that the command wrote, present only when passed is true */
  page?: string;
}
```

---

## 3. Build compiler

The compiler `build.mjs` sits in the skill folder. It runs as a script with zero external
dependencies. It requires Node.js version 20 or later. The CI workflow tests versions 20, 22, and
24, and Node.js 18 reached its end of life on 2025-04-30.
When invoked from another project, `SKILL.md` resolves the absolute path to `build.mjs`.

### Command line interface

```bash
node <skill-dir>/build.mjs <path-to-quiz-draft.json> [--blind | --grade <answers.json>]
```

`build.mjs` writes `index.html` directly into the directory containing the input draft JSON file.
The flags `--blind` and `--grade` are mutually exclusive options.

Validation runs first for all three commands. If the draft or answers file fails validation,
the command reports errors to standard error and exits with code 1 before performing subsequent
actions.

When passed `--blind`, `build.mjs` validates the draft, keeps only the prompt, the citation, and
the four choice texts of each question, shuffles choices with the seeded generator, and produces
`quizzes/<slug>/quiz.blind.json` (`BlindQuiz`) in the draft directory. This prevents answer
leakage to the verification sub-agent.

When passed `--grade <path-to-answers.json>`, `build.mjs` compares the sub-agent answers
(`SubAgentAnswerFile`) against the draft key. A relative path resolves from the current working
directory (for example, `quizzes/<slug>/answers.json`). Code maps shuffled choices back to draft
choices using the question seed. The compiler prints a JSON report (`GradeReport`) of passed
questions and failed questions with error reasons. When every question passes, the command also
writes `index.html` next to the draft and gives its path in the `page` field. A passed grade is
always followed by the build, so one command saves the agent a turn.

### Blind check verification loop

During Phase 3, the primary agent uses code to verify quiz quality:
1. The primary agent runs `node <skill-dir>/build.mjs quizzes/<slug>/quiz.json --blind`.
2. The agent starts an independent sub-agent with read access to the source material. The prompt
   holds the path `quizzes/<slug>/quiz.blind.json`, not its content, so the agent does not write
   the whole quiz a second time. In one measured run, that copy took 43 s and 6,500 output tokens.
   The sub-agent instructions forbid reading any other path in `quizzes/` to prevent answer key
   exposure. The agent does not provide the draft, explanations, rationales, or any answer hints.
3. The sub-agent evaluates each question in `quiz.blind.json` without the answer key.
4. For each question, the sub-agent records either its chosen choice ID (`'a'`, `'b'`, `'c'`, or
   `'d'`) or `'ambiguous'` with an explanation in its final response message matching
   `SubAgentAnswerFile`.
5. The primary agent writes the returned JSON to `quizzes/<slug>/answers.json`.
6. The primary agent executes:
   `node <skill-dir>/build.mjs quizzes/<slug>/quiz.json --grade quizzes/<slug>/answers.json`.
   When every question passes, this command also writes `quizzes/<slug>/index.html`.
7. If a choice is wrong or marked `'ambiguous'`, the agent revises the prompt, distractors, or
   explanation to resolve the ambiguity. Any edit to `quiz.json` changes the hash seed, requiring
   a fresh `--blind` run and complete sub-agent re-check.
8. The verification allows up to two repair rounds per question. If a question fails after two
   rounds, the agent replaces it with one new question of the same tier. If the replacement also
   fails after two repair rounds, the agent removes the question, re-verifies, and notifies the
   user of the removal and the revised question count.

### Validation rules

Before emitting HTML, `build.mjs` checks:
1. `title` and `source` must be non-empty strings. `slug` must match `^[a-z0-9]+(-[a-z0-9]+)*$`,
   because the slug names the quiz folder and starts the quiz id in the storage key. The build
   writes next to the draft path that the command line gives, so this rule does not limit where the
   build writes.
2. `questions` array must contain at least one question.
3. Every question must have `tier` in `[1, 2, 3, 4]`.
4. Question tiers must be non-decreasing: `tier` never decreases from one question to the next.
5. The sizes of the four tiers differ by at most 1 question. The D8 split (`Math.floor(N / 4)`
   questions for each tier, with the remainder in the earlier tiers) passes this rule. A quiz that
   lost questions after the replacement limit passes only if its tier sizes still meet this rule.
6. The prompt, each choice text, the explanation, and the citation target must not be empty.
7. Every question has exactly four choices: `answer` is a string, `obviousWrong` is an object
   with `text` and `rationale`, and `plausibleWrong` is an array of exactly two such objects. Each
   field holds one role, so a draft cannot hold a wrong count of a kind, and `build.mjs` derives
   the `ChoiceKind` of each choice from its field.
8. No two of the four choice texts may be identical after trimming spaces.
9. If `lineStart` and `lineEnd` are present in a citation, both must be positive integers of 1 or
   more, and `lineEnd` must not be less than `lineStart`. When `page` is present, it must be a
   positive integer of 1 or more.
10. Unknown fields in draft objects trigger validation errors to detect property typos. The old
    `choices` list with `kind` fields fails this rule.
11. The correct choice must not exceed 1.2 times the character count of the longest wrong
    choice (after trimming spaces), so that choice length does not reveal the answer.
12. The correct choice can be longer than every wrong choice in at most `Math.ceil(N / 4)`
    questions. A learner who always picks the longest choice then does no better than a random
    guess. The error lists each question with the length of its correct choice and of its longest
    wrong choice, smallest gap first. The agent then picks the smallest edits and fixes them in
    one pass, with no count of its own.

### Error format and exit codes

`build.mjs` uses standard process exit codes:
- `0`: The command executed successfully. For `--grade`, all questions passed verification, and
  the command wrote `index.html`.
- `1`: Validation failed. The draft JSON or answers JSON contains schema errors. `build.mjs`
  prints structured error diagnostics to standard error.
- `2`: Usage error. The invocation is missing required file arguments, files do not exist,
  or unknown command-line options were passed. The usage text prints only for mistakes in
  arguments, not for missing files.
- `3`: Verification failed. The `--grade` command found at least one failed question. The grade
  report outputs to standard output as JSON.

When validation fails, `build.mjs` prints structured error diagnostics to standard error and exits
with code 1:

```text
VALIDATION ERROR in quizzes/auth/quiz.json:
- Question 3: 'plausibleWrong' must be an array of 2 choices, found 1 item
- Question 7: 'obviousWrong.rationale' must be a string that is not empty
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
   active slide. Navigation clamps the target to `lastOpenSlide()` (the first unanswered question,
   or the end slide if all are answered) to prevent skipping ahead.
2. If the URL contains no hash, `currentSlide` from `localStorage` determines the active slide,
   clamped to `lastOpenSlide()`.
3. If `localStorage` holds no saved record, the presentation opens on slide 0 (title slide).

The title and end slides provide a "Restart" button that clears `quiz:<quizId>:state` from
`localStorage` and resets the presentation to slide 0.

---

## 7. Slide interface

### Slide states

The deck contains three distinct slide views:

1. **Title slide (index 0):** Shows five blocks in this order: the quiz title, a lede with the
   question count and the tier count ("20 questions in 4 tiers"), a tier strip, the buttons, and
   the notes. The tier strip is an ordered list with one segment per tier. Each segment has a
   2 px rule on top, the tier name, and the question count of that tier. The segments have the
   same width and sit in one row, or in two rows of two on a screen up to 600 px wide. The
   buttons are "Start the quiz" (or "Continue the quiz" when resuming) and an optional "Restart"
   button. The start button ends with an "Enter" key hint, which is hidden from screen readers.
   The notes are a small description list with two rows: "Source" gives the resource source, and
   "Keys" lists the key bindings in columns of at least 240 px. A device with no keyboard and no
   hover, for example a phone, shows neither the "Keys" row nor the key hint in the button. On
   the title slide, the bar shows no title, because the heading carries it. On the title and end
   slides, the bar shows the answered count only when at least one question has an answer.
2. **Question slide (index 1 to N):** Starts at a fixed distance from the top, so content does not
   jump after an answer. The distance is half the window height minus 300 px, at least 40 px, so a
   block of about 600 px sits in the middle. A narrow screen uses 24 px. Shows tier badge,
   question progress ("5 of 20"), question prompt, four interactive choice cards, an explanation
   reveal panel, citation link, a "Back" button, and a forward button ("Next" on
   questions 1 to N - 1, or "See the score" on question N). In review when all questions have
   answers, a tertiary "See the score" button appears between "Back" and "Next". Choice status
   displays drawn check and cross icons next to the status text.
3. **End slide (index N + 1):** Shows a thin score ring (144 px, 3 px stroke) that holds the count
   and percent in its center and replaces the big score heading. The heading label keeps the full
   text for screen readers. Shows a score band summary line, score breakdown per tier (each row
   has an 8 px dot in the band color of that tier, hidden from screen readers), and action
   buttons ("Try the missed questions again" and "Restart"). The slide lists no missed
   questions. The retry button and the "Back" button on the question slides reach them. Reaching
   the end slide from the last question animates the ring fill and count-up over 800 ms, and
   drops confetti after the ring closes for a 100% score.

### Keyboard bindings

| Key | Action |
|---|---|
| `1` or `a` | Choose answer A |
| `2` or `b` | Choose answer B |
| `3` or `c` | Choose answer C |
| `4` or `d` | Choose answer D |
| `Enter` or `Right Arrow` | Go on |
| `Left Arrow` | Go back |
| `t` | Change the theme |

The global key listener ignores inputs when the user focuses a form element or selects text on
the slide. To prevent double activation where `Enter` selects a choice button and immediately
advances the slide, the global handler ignores `Enter` when focus sits on a button.
The URL hash updates with each slide transition (`#0`, `#1`, ... `#21`) to enable browser history.

### Slide navigation and retry flow

1. **Answer selection requirement:** On question slides, the learner must select an answer
   before advancing. The "Next" button and keyboard forward keys (`Enter`, `Right Arrow`) remain
   disabled until a choice is clicked. Selecting a choice reveals the explanation panel, displays
   a drawn check or cross icon next to the choice status, and moves focus to the explanation
   section without scrolling so `Enter` can advance to the next slide.
2. **Backward navigation:** Learners can return to previous questions by clicking the "Back"
   button or pressing `Left Arrow`. Answered questions display the selected choice, distractor
   rationale, and correct explanation.
3. **Retry missed questions:** Clicking "Retry Missed Questions" keeps all questions in the deck
   and preserves correct answers in `answers`. It deletes only the keys for incorrect questions
   from `answers`, and navigates to the first missed question slide. When the learner returns
   to the end slide, the view recalculates and displays the updated score and the updated tier
   breakdown.

### Slide transitions and feedback

Transitions provide visual feedback during navigation and answers without blocking user input:

1. **Slide enter transition:** Moving to a new slide with "Next" or "Back" slides the new content
   in from the direction of travel over 250 ms (`--duration-fast`) using `--ease-smooth-out`. The
   content translates 8 pixels (`--distance-base`), fades from opacity 0 to 1, and clears a 3 pixel
   blur (`--blur-medium`). Moving forward translates from positive 8 pixels. Moving backward
   translates from negative 8 pixels. Initial page loads and reloads render without animation. The
   previous slide does not animate out because the application renders one slide at a time.
2. **Answer status icon draw:** When the learner selects a choice, the check or cross SVG icon
   draws its stroke over 350 ms (`--duration-medium`) with `--ease-smooth-out`. The stroke uses
   `stroke-dasharray` and `stroke-dashoffset` with path lengths of 14 units for check and 23 units
   for cross.
3. **Choice notes reveal:** When the learner selects a choice, the notes under each choice (the
   status and the rationale) open from zero height and rise 8 pixels (`--distance-base`) with a
   fade from opacity 0 to 1 and a 3 pixel blur over 350 ms (`--duration-medium`) with
   `--ease-smooth-out`. A grid row animates from `0fr` to `1fr`, so the choices below move down
   smoothly. All notes move together, with no stagger (see the stillness record in
   `docs/decisions.md`).
4. **Explanation panel rise:** When the learner selects a choice, the feedback section rises 12
   pixels (`--distance-medium`) with a fade from opacity 0 to 1 and a 3 pixel blur over 500 ms
   (`--duration-very-slow`) with `--ease-smooth-out`. Keyboard shortcuts and focus work immediately
   without waiting for the transition to finish.
5. **End slide score ring and count-up:** The end slide presents the score in a thin ring (144 px,
   3 px stroke). The track uses `--vbg-gray-400`. The fill has a rounded cap and starts at 12
   o'clock. The fill and the percent use the color of the score band: green (`--vbg-green-900`)
   for 70% or more, amber (`--vbg-amber-900`) for 40% or more, and red (`--vbg-red-900`) below
   40%. The thresholds are the same as for the score band line (item 6). The count stays ink. At
   zero, only the track shows. The heading wraps the ring, count, and percent, and keeps the full
   text in its `aria-label` for screen readers. On a real finish from the last question, the fill
   moves with the 800 ms count-up from empty to final value, while the count and percent count up
   in 20 steps over 800 ms.
6. **End slide score band line:** After the 800 ms count-up completes, one summary line rises into
   view using the 500 ms rise animation. The line matches the score percentage:
   - 100%: "Every answer is correct."
   - 70% or more: "A good result. The missed questions show what to read next."
   - 40% or more: "Good progress. Read the explanation of each missed question."
   - Below 40%: "A first pass. Every explanation is one slide away."
7. **Perfect score celebration:** When the score reaches 100% on completion, confetti starts after
   800 ms once the ring closes. Sixty confetti pieces drop from the top edge. Each piece measures
   8 by 14 pixels and uses page colors: primary ink (`--vbg-gray-1000`), success green
   (`--vbg-green-900`), or secondary gray (`--vbg-gray-900`). Pieces fall over 1.2 to 2 seconds
   with random delays up to 400 ms and rotate across a random angle. The confetti container ignores
   pointer events, carries `aria-hidden="true"`, and detaches from the DOM after 2.4 seconds.
8. **Static fallbacks:** Reloading the page, following a direct hash link to `#<N+1>`, or enabling
   `prefers-reduced-motion: reduce` draws the final state at once without count-up or confetti.

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

1. If the citation target begins with `http://` or `https://`, the compiler assigns `citation.url`
   directly to that target URL.
2. For local file paths, `build.mjs` runs git in the folder where the build runs. It stops at the
   first check that fails, and then no local citation gets a link. When no citation is a local
   file, it runs no git command.
3. `git rev-parse --show-toplevel HEAD` gives the repository root and the commit SHA. Citation
   paths are relative to this root, and a leading `./` is removed.
4. `git remote get-url origin` gives the remote. Version 1 supports GitHub remotes only: the SSH
   form (`git@github.com:org/repo.git`), the SSH URL form, and the HTTPS form become
   `https://github.com/org/repo`. Any other host stops the checks.
5. `git rev-list -n1 HEAD --not --remotes` checks that a remote-tracking branch holds `HEAD`. Any
   output means that `HEAD` has commits that no remote branch holds, which stops the checks. This
   check reads local refs and makes no network calls.
6. `git ls-files -z` and `git status --porcelain -z --untracked-files=no` run one time each, with
   all cited paths. A file gets a link only when git tracks it and it has no uncommitted change.
   The number of git processes is 5 at most, for any number of citations.
7. A linked file gets `https://github.com/<org>/<repo>/blob/<commit>/<path>` with an anchor:
   `#page=N` for a PDF page, `#L15-L32` for a line range, or `#L15` for one line.
8. The citation label is the path with its lines (`path/to/file.ts:15-32`) or its page
   (`document.pdf, page 12`). A linked citation uses the label as link text. If any check fails,
   the slide shows the label as code text with no link.
9. All citation links open in a new tab with `target="_blank" rel="noopener noreferrer"`.

---

## 10. Skill instruction design

`SKILL.md` contains the operational instructions for the AI agent.

### Runtime environment check

The agent verifies that Node.js sits on the system path and meets the version requirement:
1. Run `node --version`.
2. Parse the major version number.
3. If Node.js is missing or below version 20, stop execution and report that the build compiler
   requires Node.js 20 or later.

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
- **Focus versus topic:** When prompt words name neither a path nor a URL, the agent searches the
  working directory first. If matching source files exist, it treats the prompt as a focus within
  the local workspace. If no matching material exists, it treats the prompt as a free-standing
  topic using web search and URL citations.

### Clarifying questions

The agent asks a clarifying question before authoring when:
1. A specified target path does not exist.
2. The prompt has no resource and no focus words (such as a bare `/quiz` or only a question count),
   and the working directory is empty.
3. The prompt has no resource and no focus words (such as a bare `/quiz` or only a question count),
   and the working directory is the user home directory (`~`), where recursive scanning would
   inspect unrelated personal files.
4. The prompt specifies a free-standing topic, and the working directory is the user home directory
   (`~`), to confirm where to save the quiz output folder.

### Canonical question rules

`skills/quiz/references/question-rules.md` holds the single canonical source of question authoring
rules. The agent reads this file during Phase 2. The file specifies:
- Progressive tiers from Fundamentals to Expert (D8).
- The prohibition on trivia such as arbitrary numbers or variable names.
- Choice composition: 1 correct, 1 obvious wrong, and 2 plausible wrong (D9).
- Quality standards for distractors and misconceptions (D10).
- Language: the sentence rules of ASD-STE100 for every generated text, with the technical names
  of the source kept (D12).

### Step sequence

`SKILL.md` directs the agent through nine execution steps:
1. Verify Node.js runtime version.
2. Resolve absolute skill directory path.
3. Parse prompt parameters and ask clarifying questions if the scope is ambiguous.
4. Scan and read source material.
5. Read `references/question-rules.md`.
6. Select an unused directory `quizzes/<slug>/`.
7. Author draft questions into `quiz.json`.
8. Execute blind verification: generate `quiz.blind.json` with `--blind`, give its path to the
   sub-agent with instructions forbidding every other path in `quizzes/`, collect answers, and
   evaluate them with `build.mjs --grade`.
9. Report the local file path of the slide deck that the passed grade wrote, and offer to open
   the page in the browser.

---

## 11. Visual design system and accessibility

`skills/quiz/tokens.css` defines the visual tokens specified in `vercel.com/design.md`.

### Design tokens

`skills/quiz/tokens.css` defines tokens sourced from `vercel-brand.css`. The interface designs in
monochrome in accordance with `design.md`. Color indicates only validation results, score bands,
and focus states. Every color cue accompanies a non-color cue, such as an icon, a status word, or
a count. Each color
token uses CSS `light-dark(<light>, <dark>)`:

- **Surfaces (from `vercel-brand.css`):**
  - Canvas background: `--vbg-background-100: light-dark(oklch(1 0 0), oklch(0 0 0))`
  - Card surface: `--vbg-background-200: light-dark(oklch(0.984 0 0), oklch(0.027 0 0))`
- **Typography and borders (from `vercel-brand.css`):**
  - Primary text: `--vbg-gray-1000: light-dark(oklch(0.205 0 0), oklch(0.946 0 0))`
  - Secondary text: `--vbg-gray-900: light-dark(oklch(0.42 0 0), oklch(0.706 0 0))`
  - Track border: `--vbg-gray-400: light-dark(oklch(0.937 0 0), oklch(0.301 0 0))`
  - Subtle border: `--vbg-gray-alpha-300: light-dark(oklch(0 0 0 / 0.1), oklch(1 0 0 / 0.13))`
  - Default border: `--vbg-gray-alpha-400: light-dark(oklch(0 0 0 / 0.08), oklch(1 0 0 / 0.14))`
- **Semantic indicators (from `vercel-brand.css`):**
  - Focus ring (`--vbg-focus`): light uses blue-700 (`oklch(57.61% 0.2508 258.23)`), and dark uses
    blue-900 (`oklch(71.7% 0.1648 250.794)`).
  - Success (`--vbg-green-900`): light uses `oklch(51.75% 0.1453 147.65)`, and dark uses
    `oklch(73.1% 0.2158 148.29)`.
  - Warning (`--vbg-amber-900`): light uses `oklch(52.79% 0.1496 54.65)`, and dark uses
    `oklch(77.21% 0.1991 64.28)`. The end slide uses it for the middle score band. Its contrast on
    the canvas is 5.60 to 1 in the light theme and 9.41 to 1 in the dark theme.
  - Error (`--vbg-red-900`): light uses `oklch(54.99% 0.232 25.29)`, and dark uses
    `oklch(69.96% 0.2136 22.03)`. Red-900 replaces red-700 because red-700 had a contrast of
    4.04 to 1 in the light theme, failing the WCAG AA minimum of 4.5 to 1.
- **Spacing scale (from `vercel-brand.css`):**
  Values map 4px (`--vbg-space-1`), 8px (`--vbg-space-2`), 12px (`--vbg-space-3`), 16px
  (`--vbg-space-4`), 20px (`--vbg-space-5`), 24px (`--vbg-space-6`), 32px (`--vbg-space-8`),
  40px (`--vbg-space-10`), 48px (`--vbg-space-12`), and 64px (`--vbg-space-16`).
- **Border radius (from `vercel-brand.css`):**
  `--vbg-radius-small: 6px` and `--vbg-radius: 8px`. The interface uses no other radii.
- **Type scale (from `vercel-brand.css`):**
  Page title `2.5rem`, title `2rem`, section `1.5rem`, subsection `1.25rem`, lede `1.125rem`,
  body `1rem`, compact `0.875rem`, and label or metadata `0.8125rem`.
- **Typography families (from `vercel-brand.css`):**
  `"Geist"` for sans-serif text and `"Geist Mono"` for monospace code.
- **Motion tokens (from `transitions.dev`):**
  `skills/quiz/tokens.css` defines motion tokens sourced from repository
  `Jakubantalik/transitions.dev`, file `skills/transitions-dev/_root.css`, at commit
  `598d3d6ad89dabb4bdf742fd2e887ca53914a888`:
  - `--duration-stagger: 40ms`: step interval for the score count-up timer.
  - `--duration-quick: 150ms`: button and choice card hover transitions.
  - `--duration-fast: 250ms`: slide enter transition.
  - `--duration-medium: 350ms`: SVG check and cross icon stroke drawing, and the choice notes
    reveal.
  - `--duration-very-slow: 500ms`: explanation panel and score band line elevation.
  - `--ease-smooth-out: cubic-bezier(0.22, 1, 0.36, 1)`: primary easing curve.
  - `--distance-base: 8px`: slide enter horizontal offset, and choice notes vertical offset.
  - `--distance-medium: 12px`: explanation panel vertical offset.
  - `--blur-medium: 3px`: slide, choice notes, and feedback enter blur.

### Theme configuration and resolution

The page sets theme styling through the `data-theme` attribute on the root `<html>` element. The
browser persists the user choice under the `localStorage` key `quiz:theme`.

At page load, the client resolves theme state in this order:
1. `localStorage.getItem('quiz:theme')`: if the value is `'light'` or `'dark'`, this setting wins.
2. `window.matchMedia('(prefers-color-scheme: dark)')`: if matching, the page selects dark mode.
3. Fallback: if no setting or media preference matches, the page defaults to light mode.

Pressing `t` or the theme button in the bar toggles `data-theme` between `'light'` and `'dark'`,
and saves the new value into `localStorage`. The button shows only an icon of the other theme: a
sun in the dark theme and a moon in the light theme. Its `aria-label` names the action ("Use light
theme" or "Use dark theme"), and its tooltip adds the key ("Use light theme (T)"). The button is
32 px square, and 44 px square on a device with a coarse pointer.

### Motion and focus styles

Transitions follow `prefers-reduced-motion` settings:
- **Reduced motion rule:** All motion resides inside the media query
  `@media (prefers-reduced-motion: no-preference)`. When a user enables reduced motion, no CSS
  transitions or animations run. Script code checks `window.matchMedia` for reduced motion to skip
  the score count-up and confetti. The page renders complete and static immediately.
- **Animated states and source recipes:** When motion is permitted, the interface animates four
  state transitions using tokens from `transitions.dev`:
  1. Slide enter: 250 ms translation, fade, and blur using the enter pattern of recipe
     `08-page-side-by-side.md`.
  2. Answer status icons: 350 ms SVG stroke draw using the pattern of recipe
     `25-checkbox-check.md`.
  3. Feedback panel: 500 ms rise with fade and blur using the pattern of recipe
     `18-texts-reveal.md`.
  4. End slide score reveal: 800 ms score ring fill and count-up, followed by the 500 ms rise of
     the score band line, and a 2.4-second confetti drop for a 100% score.
- **Focus rings:** All interactive controls display a visible focus indicator using
  `:focus-visible` with a 2-pixel solid outline and a 2-pixel offset.
- **Cursor:** The page sets `cursor: default` on the body, so the cursor is an arrow on every
  text and surface, as in a slide deck. Buttons, links, and open choices show a hand. A disabled
  button shows `not-allowed`. An answered choice shows the arrow. Text selection still works.

### Accessibility structure

The page targets WCAG 2.1 AA:
- **Interactive choice elements:** Each choice renders as an HTML `<button>` element with
  `type="button"`. This provides default keyboard activation through `Space` and `Enter`.
- **Screen reader announcements:** A container with `aria-live="polite"` and `aria-atomic="true"`
  announces answer validation outcomes and explanations when the learner selects a choice.
- **Touch targets:** Buttons use a minimum height of 44 pixels on devices with a coarse pointer.

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
directory name. The `slug` field of `quiz.json` holds the directory name with its suffix, so the
quiz id and the storage key match the folder. `build.mjs` writes `index.html` directly alongside
`quiz.json`.

---

## 13. Test plan

Unit tests verify compiler behavior using the native `node:test` runner. Run the test suite with:

```bash
node --test 'test/*.test.mjs'
```

### Test suite: `test/build.test.mjs`

The automated test suite organizes tests into fourteen groups:

1. **`validateDraft`:** Checks draft schema rules. Tests accept the valid fixture and reject
   non-objects, missing or empty fields, slugs that are not kebab-case, invalid or descending tiers,
   tier size disparities greater than 1, a wrong count of plausible wrong choices, wrong choices
   that are not objects, missing rationales, the old `choices` list, duplicate choice text across
   the four fields, bad citation lines or pages, a correct choice
   over 1.2 times the longest wrong choice, and a correct choice that is the longest choice in
   more than a quarter of the questions.
2. **`renderMarkdown`:** Verifies Markdown compilation. Tests verify HTML entity escaping, inline
   code, bold, italics, fenced code blocks with language tags, unclosed fences, paragraphs, and
   lists.
3. **`quizIdOf`:** Verifies quiz identifier derivation. Tests verify slug prefix format, 8-character
   hex content hashes, and hash changes when question content changes.
4. **`placeChoices`:** Verifies deterministic choice placement. Tests confirm reproducible
   placement, one use of each letter, distractor order shuffling, and answer slot balance within
   1 question across counts from 1 to 40.
5. **`blindQuiz`:** Verifies blind check generation. Tests verify that no `kind`, `rationale`,
   `explanation`, `answer`, or wrong choice field remains, and that the choices keep the displayed
   order.
6. **`validateAnswers`:** Verifies sub-agent answer payloads. Tests accept valid answer objects and
   reject invalid choice letters, duplicate answers, out-of-bounds IDs, missing reasons for
   ambiguous choices, and unknown fields.
7. **`gradeAnswers`:** Verifies answer grading. Tests confirm full passes for correct answer keys,
   and verify structured failure reporting for wrong choices, ambiguous selections, and missing
   answers.
8. **`githubWebUrl`:** Verifies remote URL parsing. Tests convert the SSH, SSH URL, and HTTPS
   forms of a GitHub remote into web URLs and reject non-GitHub hosts.
9. **`readGitFacts`:** Verifies the git checks with a fake git runner. Tests confirm no git command
   when no citation is a file, 5 git commands for any number of cited files, and a stop after the
   remote when the host is not GitHub.
10. **`resolveCitation`:** Verifies citation links. Tests link direct URLs, produce permalinks with
    git commit hashes and line or page anchors for clean tracked files, and omit links for
    changed, renamed, untracked, or unpushed files, and outside a GitHub repository.
11. **`buildQuiz`:** Verifies presentation data assembly. Tests derive IDs, tier names, formatted
    HTML, and mapped choice letters from valid drafts.
12. **`renderPage`:** Verifies template assembly. Tests confirm placeholder replacement in one
    pass, license embedding, script tag escaping with `\u003c`, and an error when the template
    does not hold each placeholder exactly once.
13. **`main`:** Verifies CLI execution and exit codes. Tests verify index builds, permalinks in a
    real git repository, `--blind` output, `--grade` outputs with exit code 0 and a written page
    or exit code 3 and no page, validation failure exit code 1, usage exit code 2 with
    argument-specific usage printing, and `--help`.
14. **`the real skill folder`:** Verifies end-to-end packaging with real assets. Tests verify zero
    remaining template placeholders and zero external network requests in links, scripts, and CSS.

---

## 14. Sources

- ASD-STE100 Simplified Technical English: <https://asd-ste100.org/>
- SIL Open Font License 1.1: <https://openfontlicense.org/>
- Geist Font OFL License: <https://github.com/vercel/geist-font/blob/main/OFL.txt>
- Vercel Brand Guidelines: <https://vercel.com/design.md>
- transitions.dev Repository and Terms: <https://transitions.dev/terms.html>
- Node.js Test Runner: <https://nodejs.org/api/test.html>
- Node.js Releases: <https://nodejs.org/en/about/previous-releases>
- Reproducible Builds Specification: <https://reproducible-builds.org/specs/source-date-epoch/>
