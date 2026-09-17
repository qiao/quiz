---
name: quiz
description: >-
  Generate responsive multiple-choice quiz slides from a codebase, documentation, files, or
  technical topics for self-testing or team sharing. Use when the user runs /quiz, asks to
  generate a quiz, or requests questions to test comprehension.
---

# Quiz

Generate responsive HTML slide decks containing four difficulty tiers of multiple-choice questions
from code repositories, documentation sites, local files, or technical topics.

Follow these nine steps in sequence. Run all commands from the project root where `quizzes/` lives.

## 1. Verify Node.js runtime

Check that the local system has Node.js version 18 or later installed.

- Run `node -v` to inspect the installed version.
- If Node.js is missing or reports a major version earlier than 18, stop execution and inform the
  user that `build.mjs` requires Node.js 18 or later.

Completion criterion: Node.js 18 or later is confirmed available.

## 2. Resolve skill directory

Find the absolute path to this skill directory, denoted `<skill-dir>`.

- If the host environment states a base directory when loading this skill (for example,
  "Base directory for this skill: ..."), use that path as `<skill-dir>`.
- Otherwise, resolve the directory containing `SKILL.md` and `build.mjs`.
- Use this absolute path when executing `build.mjs` or reading references in later steps.

Completion criterion: `<skill-dir>` absolute path is known.

## 3. Parse prompt parameters and clarify

Extract resource target, topic focus, question count, and language from the user prompt.

- **Target and focus:** The prompt can provide a resource path, a focus topic, or both. If omitted,
  the target defaults to the current working directory.
- **Question count:** Parse explicit count requests (such as "10 questions"). If omitted, the count
  defaults to 20 questions.
- **Language:** Author questions in the language of the prompt. For a bare `/quiz` invocation,
  author questions in the conversation language.
- **Clarifying questions:** Ask a clarifying question only when:
  1. The target path does not exist.
  2. The current working directory is empty.
  3. The current working directory is the user home directory (`~`).
  Do not ask confirmation questions for count, difficulty, or layout when valid defaults exist.

Completion criterion: Target resource, focus topic, count, and language are determined, or user
clarification is received.

## 4. Explore source material

Inspect the target resource to understand architecture and component interactions.

- If inspecting a workspace or local directory, scan file trees and ignore `.git`, `node_modules`,
  lock files, build artifacts, and the `quizzes/` folder. Prioritize core logic, entry points,
  and public interfaces.
- If inspecting documentation URLs, crawl up to 20 linked pages within the initial hostname.
- If inspecting a large PDF document, read the table of contents before reading specific chapters.
- If the source material is small and cannot support 20 questions without trivia, reduce the
  question count and inform the user of the reduction.

Completion criterion: Technical knowledge gathered from the resource.

## 5. Read question rules

Read `<skill-dir>/references/question-rules.md` to review the canonical authoring requirements.

- Review the four progressive tiers: Fundamentals (1), Core (2), Advanced (3), and Expert (4).
- Review the prohibition on trivia.
- Review choice composition: exactly one correct choice, one obvious wrong choice, and two
  plausible wrong choices per question.

Completion criterion: Authoring rules loaded and understood before drafting.

## 6. Select unused output directory

Create an isolated directory under `quizzes/` using a URL-safe slug.

- Derive a short kebab-case slug representing the topic or resource, matching
  `^[a-z0-9]+(-[a-z0-9]+)*$`. Lowercase the topic or workspace name, replace non-alphanumeric
  characters with hyphens, and remove duplicate or edge hyphens.
- Target `quizzes/<slug>/`. If `quizzes/<slug>` exists, append `-2`, `-3`, and so on to select the
  first unused directory.
- Create the selected directory.

Completion criterion: An unused directory `quizzes/<slug>/` exists on disk.

## 7. Author draft questions

Write `quizzes/<slug>/quiz.json` conforming to the `QuizDraft` schema.

Structure the JSON payload:
- `title`: descriptive quiz title.
- `slug`: the directory slug selected in step 6.
- `source`: brief summary of the target resource.
- `questions`: array of question objects following non-decreasing tiers (tier 1 through tier 4).

Adhere strictly to these invariants:
- Tier balance: distribute questions so tier sizes differ by at most 1 question.
- Choices: exactly four choices per question. Exactly one with `kind: "correct"`, one with
  `kind: "obvious-wrong"`, and two with `kind: "plausible-wrong"`.
- Explanations and rationales: omit `rationale` on the correct choice. Provide a non-empty
  `rationale` on all three wrong choices. Provide a non-empty `explanation` on each question.
- Citations: provide a `target` path or URL. For local files, specify the path relative to the
  git repository root of the resource, with `lineStart` and `lineEnd`. For PDF documents, specify
  the `page` number.

Completion criterion: `quizzes/<slug>/quiz.json` is written to disk.

## 8. Run blind check verification

Validate questions with an independent sub-agent that cannot see the answer key.

### Step 8a: Generate blind quiz payload
Run the build compiler with the `--blind` flag from the project root:

```bash
node <skill-dir>/build.mjs quizzes/<slug>/quiz.json --blind
```

Command behavior and exit codes:
- Validation runs first. If draft validation fails, the command exits with code 1 and writes
  diagnostics to standard error. Usage errors (such as missing files) exit with code 2.
- When validation succeeds, the command exits with code 0, writes `quizzes/<slug>/quiz.blind.json`
  with stripped answer keys and shuffled choices, and prints the generated path.

### Step 8b: Invoke the blind sub-agent
Read the complete content of `quizzes/<slug>/quiz.blind.json`.

Start a sub-agent with read access to the source material. Provide these instructions:
1. Include the JSON content of `quiz.blind.json` directly in the sub-agent prompt. Do not give
   the sub-agent the draft `quiz.json`, the explanations, the rationales, or any hint about the
   answers.
2. Instruct the sub-agent that it must never read any file under `quizzes/`.
3. The sub-agent must answer every question using only the source material.
4. For each question, the sub-agent selects choice letter `'a'`, `'b'`, `'c'`, or `'d'`. If a
   question has multiple valid answers or no correct answer, the sub-agent selects `'ambiguous'`
   and explains why in `reason`.
5. The sub-agent returns its answers in its final message as valid JSON matching
   `SubAgentAnswerFile`:

```json
{
  "answers": [
    { "questionId": 1, "choice": "b" },
    { "questionId": 2, "choice": "ambiguous", "reason": "Choices b and c are both accurate." }
  ]
}
```

### Step 8c: Grade sub-agent answers
Write the returned JSON from the sub-agent message into `quizzes/<slug>/answers.json`.

Run the grading command from the project root:

```bash
node <skill-dir>/build.mjs quizzes/<slug>/quiz.json --grade quizzes/<slug>/answers.json
```

Command behavior and exit codes:
- The command exits with code 0 when execution succeeds, or code 1 if validation of the draft or
  answers file fails. Usage errors exit with code 2.
- The command prints a `GradeReport` as JSON.
- Parse the report and inspect the `passed` field.
- If `passed` is `true`, proceed to step 9.
- If `passed` is `false`, inspect the `failures` array.

### Step 8d: Repair failed questions
Any edit to `quiz.json` changes the quiz identifier hash, which changes the choice shuffle seed
for every question. Editing one question can change choice letters across the entire quiz.

When repairing or replacing questions:
1. **Batch repair round:** Revise all failed questions in `quizzes/<slug>/quiz.json` in one
   editing pass to resolve ambiguity or incorrect facts.
2. **Single re-check:** Run `--blind` once to produce an updated `quiz.blind.json`. Send the
   checker all questions in one prompt, overwrite `quizzes/<slug>/answers.json`, and re-run
   `--grade`. Do not re-check failed questions individually.
3. Allow up to two batch repair rounds.
4. **Replacement:** If a question still fails after two repair rounds, replace it with one new
   question of the same tier. The replacement question receives up to two batch repair rounds.
5. **Removal:** If the replacement question also fails after two repair rounds, delete the question
   from `quizzes/<slug>/quiz.json`. Inform the user of the question removal and the revised total
   count. Re-run `--blind`, collect answers for all remaining questions, and re-grade.
   Tier sizes must still differ by at most 1 question across all tiers.

Completion criterion: All questions in `quizzes/<slug>/quiz.json` pass grading, or unresolvable
questions are removed within the allowed limits.

## 9. Compile and report

Compile the final responsive HTML slide deck and deliver the result to the user.

- Run the compiler without flags from the project root:

```bash
node <skill-dir>/build.mjs quizzes/<slug>/quiz.json
```

Command behavior and exit codes:
- The command exits with code 0 on success, code 1 on validation failure, and code 2 on usage error.
- The compiler validates the draft, balances answer positions across choices, compiles Markdown to
  safe HTML, inlines CSS and font assets, and writes `quizzes/<slug>/index.html`.
- Print the relative output path: `quizzes/<slug>/index.html`.
- Print a browser command to view the slides: `open ./quizzes/<slug>/index.html` on macOS,
  `xdg-open ./quizzes/<slug>/index.html` on Linux, or `start quizzes\<slug>\index.html`
  on Windows.
- Print a one-line deployment hint for static hosting (for example,
  `npx vercel quizzes/<slug>` or `npx netlify deploy --dir=quizzes/<slug>`).

Completion criterion: `quizzes/<slug>/index.html` exists on disk and the user receives the file
path, open command, and deployment hint.
