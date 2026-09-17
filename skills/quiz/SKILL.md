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
- **Focus versus topic:** When prompt words do not name a path or URL (for example,
  `/quiz authentication flow` or `/quiz TCP congestion control`):
  1. Search the current working directory for matching files or code symbols.
  2. If the working directory contains matching material, treat the words as a focus within the
     workspace.
  3. If the working directory has no matching material, treat the words as a free-standing topic.
     Gather facts using web search and model knowledge, cite URL sources, and state in the final
     report that the quiz uses web sources.
- **Question count:** Parse explicit count requests (such as "10 questions"). If omitted, the count
  defaults to 20 questions.
- **Language:** Author questions in the language of the prompt. For a bare `/quiz` invocation,
  author questions in the conversation language.
- **Clarifying questions:** Ask a clarifying question only when:
  1. The target path does not exist.
  2. The prompt has no resource and no focus words (a bare `/quiz` or only a count), and the
     current working directory is empty.
  3. The prompt has no resource and no focus words (a bare `/quiz` or only a count), and the
     current working directory is the user home directory (`~`).
  4. The prompt specifies a free-standing topic, and the current working directory is the user home
     directory (`~`), to confirm where to save the quiz output directory.
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

Write `quizzes/<slug>/quiz.json` conforming to the authoring rules in
`<skill-dir>/references/question-rules.md` and the validation rules in Section 3 of
`docs/architecture.md`.

Format `quiz.json` with this structure:

```json
{
  "title": "Descriptive Quiz Title",
  "slug": "<slug>",
  "source": "Summary of resource or topic",
  "questions": [
    {
      "tier": 1,
      "prompt": "Question prompt in Markdown.",
      "choices": [
        { "text": "Correct choice", "kind": "correct" },
        { "text": "Obvious wrong", "kind": "obvious-wrong", "rationale": "Why wrong." },
        { "text": "Plausible wrong 1", "kind": "plausible-wrong", "rationale": "Why wrong." },
        { "text": "Plausible wrong 2", "kind": "plausible-wrong", "rationale": "Why wrong." }
      ],
      "explanation": "Why the correct choice is accurate.",
      "citation": { "target": "path/to/file.ts", "lineStart": 10, "lineEnd": 25 }
    }
  ]
}
```

Key authoring requirements:
- Questions follow non-decreasing tiers (1 to 4). Tier sizes must differ by at most 1 question.
- Each question has exactly 4 choices: 1 `correct` (no rationale), 1 `obvious-wrong`
  (with rationale), and 2 `plausible-wrong` (with rationale).
- The correct choice text must not exceed 1.2 times the length of the longest wrong choice.
- Local citations use paths relative to the repository root. PDF citations specify `page`.

Completion criterion: `quizzes/<slug>/quiz.json` is written to disk.

## 8. Run blind check verification

Validate questions with an independent sub-agent that cannot see the answer key.

### Step 8a: Generate blind quiz payload
Run the build compiler with `--blind` immediately after drafting:

```bash
node <skill-dir>/build.mjs quizzes/<slug>/quiz.json --blind
```

- If validation fails (exit code 1), read the errors on standard error, repair `quiz.json`,
  and run `--blind` again. Do not invoke the sub-agent until `--blind` exits with code 0.
- When validation succeeds (exit code 0), the command generates `quizzes/<slug>/quiz.blind.json`
  with stripped answer keys and shuffled choices, and prints its file path.

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

- Exit code 0: all questions passed verification (`passed: true`). Proceed to step 9.
- Exit code 3: one or more questions failed verification (`passed: false`). Inspect the
  `failures` array in the standard output JSON and repair failed questions in step 8d.
- Exit code 1: validation error in `quiz.json` or `answers.json`. Repair the file and re-run.
Section 3 of `docs/architecture.md` specifies the full exit code and error format.

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

The compiler validates the draft, balances answer positions across choices, compiles Markdown to
safe HTML, inlines CSS and font assets, and writes `quizzes/<slug>/index.html`. Exit code 0
indicates success.

Deliver the results to the user:
- Print the relative output path: `quizzes/<slug>/index.html`.
- Print a browser command to view the slides: `open ./quizzes/<slug>/index.html` on macOS,
  `xdg-open ./quizzes/<slug>/index.html` on Linux, or `start quizzes\<slug>\index.html`
  on Windows.
- Print a one-line deployment hint for static hosting (for example,
  `npx vercel quizzes/<slug>` or `npx netlify deploy --dir=quizzes/<slug>`).
- If the quiz covers a free-standing topic, state in the report that the quiz uses web sources.

Completion criterion: `quizzes/<slug>/index.html` exists on disk and the user receives the file
path, open command, and deployment hint.
