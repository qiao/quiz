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

## 1. Inform user of scope and build steps

Determine the scope of the quiz from the user prompt, and send a message to the user stating the
scope and the steps to build the quiz before performing further work.

- **Determine scope:** Extract target resource, topic focus, question count, and language:
  - **Target and focus:** The prompt can provide a resource path, a focus topic, or both. If
    omitted, the target defaults to the current working directory.
  - **Focus versus topic:** If prompt words do not name a path or URL (for example,
    `/quiz authentication flow` or `/quiz TCP congestion control`):
    1. Search the current working directory for matching files or code symbols.
    2. If the working directory contains matching material, treat the words as a focus within the
       workspace.
    3. If the working directory has no matching material, treat the words as a free-standing topic.
       Gather facts using web search and model knowledge, cite URL sources, and state that the
       quiz uses web sources.
  - **Question count:** Parse explicit count requests (such as "10 questions"). If omitted, the
    count defaults to 20 questions.
  - **Language:** Author questions in the language of the prompt. For a bare `/quiz` invocation,
    author questions in the conversation language.
  - **Clarifying questions:** Ask a clarifying question only if:
    1. The target path does not exist.
    2. The prompt has no resource and no focus words (a bare `/quiz` or only a count), and the
       current working directory is empty.
    3. The prompt has no resource and no focus words (a bare `/quiz` or only a count), and the
       current working directory is the user home directory (`~`).
    4. The prompt specifies a free-standing topic, and the current working directory is the user
       home directory (`~`), to confirm where to save the quiz output directory.
    Do not ask confirmation questions for count, difficulty, or layout if valid defaults exist.
- **Message the user:** Send a message to the user before starting step 2. State:
  1. The scope of the quiz: the target resource or topic, the focus, the question count (spread
     across the four tiers: Fundamentals, Core, Advanced, and Expert), and the language.
  2. The steps that you will perform in sequence to build the quiz:
     - Verify the local Node.js runtime (version 20 or later).
     - Resolve the skill directory path.
     - Explore source material and write the core list.
     - Read the question authoring rules.
     - Select an unused output directory under `quizzes/<slug>/`.
     - Author draft questions in `quiz.json` across the four tiers.
     - Run blind sub-agent verification and grade the answers.
     - Build the HTML slide page and offer to open it in a browser.
  Do not wait for user approval to proceed unless a clarifying question was required. State the
  scope and planned steps, then immediately proceed to step 2.

Completion criterion: The user is informed of the quiz scope and planned build steps.

## 2. Verify Node.js runtime

Check that the local system has Node.js version 20 or later installed.

- Run `node -v` to inspect the installed version.
- If Node.js is missing or reports a major version earlier than 20, stop execution and inform the
  user that `build.mjs` requires Node.js 20 or later.

Completion criterion: Node.js 20 or later is confirmed available.

## 3. Resolve skill directory

Find the absolute path to this skill directory, denoted `<skill-dir>`.

- If the host environment states a base directory when loading this skill (for example,
  "Base directory for this skill: ..."), use that path as `<skill-dir>`.
- Otherwise, resolve the directory containing `SKILL.md` and `build.mjs`.
- Use this absolute path to run `build.mjs` or read references in later steps.

Completion criterion: `<skill-dir>` absolute path is known.

## 4. Explore source material

Inspect the target resource to understand architecture and component interactions.

- If inspecting a workspace or local directory, scan file trees and ignore `.git`, `node_modules`,
  lock files, build artifacts, and the `quizzes/` folder. Prioritize core logic, entry points,
  and public interfaces.
- If inspecting documentation URLs, crawl up to 20 linked pages within the initial hostname.
- If inspecting a large PDF document, read the table of contents before reading specific chapters.
- If the source material is small and cannot support 20 questions without trivia, reduce the
  question count and inform the user of the reduction.
- Write a core list of 5 to 10 lines before you draft: the purpose, the main entry points, the
  main flow from input to output, the main data types, the options that most users set, and the
  failures that a user sees most often. Take the subjects from the README, the main
  documentation page, or the table of contents if the resource has one. The list goes into the
  `core` field of the draft in step 7. Section 2 of the question rules defines the core. Every
  question comes from this list.

Completion criterion: Technical knowledge gathered from the resource, and the core list written.

## 5. Read question rules

Read `<skill-dir>/references/question-rules.md`. It is the one source of every authoring rule:
tiers, the core, trivia, choices, clarity, coverage, explanations, citations, and language.

Completion criterion: Authoring rules loaded before drafting.

## 6. Select unused output directory

Create an isolated directory under `quizzes/` using a URL-safe slug.

- Derive a short kebab-case slug representing the topic or resource, matching
  `^[a-z0-9]+(-[a-z0-9]+)*$`. Lowercase the topic or workspace name, replace non-alphanumeric
  characters with hyphens, and remove duplicate or edge hyphens.
- Target `quizzes/<slug>/`. If `quizzes/<slug>` exists, append `-2`, `-3`, and so on to select the
  first unused directory.
- Create the selected directory. From here on, `<slug>` means the name of that directory, with
  its suffix, and the `slug` field of `quiz.json` holds that name.

Completion criterion: An unused directory `quizzes/<slug>/` exists on disk.

## 7. Author draft questions

Write `quizzes/<slug>/quiz.json` conforming to the authoring rules in
`<skill-dir>/references/question-rules.md`.

Format `quiz.json` with this structure:

```json
{
  "title": "Descriptive Quiz Title",
  "slug": "<slug>",
  "source": "Summary of resource or topic",
  "core": [
    "The purpose and the main output",
    "The main entry points",
    "The main flow from input to output",
    "The main data types",
    "The failures that a user sees most often"
  ],
  "questions": [
    {
      "tier": 1,
      "prompt": "Question prompt in Markdown.",
      "answer": "Correct choice",
      "obviousWrong": { "text": "Obvious wrong", "rationale": "Why wrong." },
      "plausibleWrong": [
        { "text": "Plausible wrong 1", "rationale": "Why wrong." },
        { "text": "Plausible wrong 2", "rationale": "Why wrong." }
      ],
      "explanation": "Why the correct choice is accurate.",
      "citation": { "target": "path/to/file.ts", "lineStart": 10, "lineEnd": 25 }
    }
  ]
}
```

Write every question from the core list of step 4. Section 2 of the rules defines the core and the
regular-user test: a person who uses the resource every week needs the fact to use the resource
correctly. A question about an exit code, a license clause, a rare fallback, or an internal helper
fails the test.

Write every text in the draft so that a reader understands it on the first read. Section 8 of
the rules gives the sentence rules of ASD-STE100 Simplified Technical English: short sentences,
one idea per sentence, the active voice, simple tenses, and the technical names of the source.

Write each question in one pass, and review it one time with the regular-user test. Replace a
question that fails the test. The build checks the structure, the tier sizes, and the choice
lengths. The blind check in step 8 finds ambiguous questions. A repair round costs less time than
a long review of alternative questions before the draft exists.

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
- If validation succeeds (exit code 0), the command generates `quizzes/<slug>/quiz.blind.json`
  with stripped answer keys and shuffled choices, and prints its file path.

### Step 8b: Invoke the blind sub-agent
Start a sub-agent with read access to the source material. Give it the path of the blind quiz,
not its content, so that you do not write the quiz again. The prompt holds only the path and
these instructions:
1. Read the quiz at `quizzes/<slug>/quiz.blind.json`. Never read, list, or search any other path
   under `quizzes/`, because the answer key is there.
2. Answer every question using only the source material.
3. For each question, select choice letter `'a'`, `'b'`, `'c'`, or `'d'`. If a question has
   multiple valid answers or no correct answer, select `'ambiguous'` and explain why in `reason`.
4. Return the answers in the final message as valid JSON matching `SubAgentAnswerFile`:

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

- Exit code 0: all questions passed verification (`passed: true`). The same command compiled the
  draft into `quizzes/<slug>/index.html`, and the `page` field of the report gives that path.
  Proceed to step 9.
- Exit code 3: one or more questions failed verification (`passed: false`). Inspect the
  `failures` array in the standard output JSON and repair failed questions in step 8d.
- Exit code 1: validation error in `quiz.json` or `answers.json`. Repair the file and re-run.

### Step 8d: Repair failed questions
An edit to `quiz.json` changes the shuffle seed, so the letters of every question can change.
Repair in rounds:

1. Revise all failed questions in one pass.
2. Repeat steps 8a to 8c for the whole quiz.
3. After two failed rounds, replace a question with a new question of the same tier. After two
   more failed rounds, remove it, and tell the user the new question count.

Completion criterion: All questions in `quizzes/<slug>/quiz.json` pass grading, or unresolvable
questions are removed within the allowed limits.

## 9. Report and offer to open the page

The passed grade in step 8c already wrote `quizzes/<slug>/index.html`. Deliver the result to the
user:
- Print the relative output path: `quizzes/<slug>/index.html`.
- Print a browser command to view the slides: `open ./quizzes/<slug>/index.html` on macOS,
  `xdg-open ./quizzes/<slug>/index.html` on Linux, or `start quizzes\<slug>\index.html`
  on Windows.
- Print a one-line deployment hint for static hosting (for example,
  `npx vercel deploy --cwd quizzes/<slug> --yes --prod`).
- If the quiz covers a free-standing topic, state in the report that the quiz uses web sources.

Then offer to open the page. Do not wait for the user to ask:
- Ask one question: open the quiz in the browser now? If the host has a tool for questions to
  the user, use that tool, with "Open it now" as the first option and "Not now" as the second.
  Otherwise, ask in the final message.
- If the user accepts, run the browser command for the operating system.
- If the session cannot wait for an answer, for example a headless run, print the command and
  stop.

Completion criterion: `quizzes/<slug>/index.html` exists on disk, the user receives the file path,
open command, and deployment hint, and the user has answered the offer to open the page, or the
session cannot ask.
