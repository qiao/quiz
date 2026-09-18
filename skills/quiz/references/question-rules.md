# Question authoring rules

This reference defines the canonical rules for authoring draft quiz questions. The agent reads this
document before it writes `quiz.json`.

## 1. Progressive tiers

Organize all questions into four progressive difficulty tiers. Arrange questions in non-decreasing
tier order: all Tier 1 questions first, followed by Tier 2, Tier 3, and Tier 4.

Tier sizes must differ by at most 1 question across all four tiers. For total count N, allocate
`Math.floor(N / 4)` questions to each tier, and distribute remainders to earlier tiers.

### Tier 1: Fundamentals
- Thinking type: Recall.
- Target: basic facts, core terms, main purposes, and primary entry points.
- Code example: What does this module export, or which command flag initiates a build?
- Book or docs example: What is the definition of a key concept, or what does chapter 1 state as
  the main goal?

### Tier 2: Core
- Thinking type: Understand.
- Target: execution flows, component interactions, and main mechanisms.
- Code example: How does data flow from the parser to the validator, or what does this function
  return on valid input?
- Book or docs example: Why does the author recommend one approach over another, or how does a
  described process work step by step?

### Tier 3: Advanced
- Thinking type: Apply.
- Target: the main flow at its edges: invalid input, missing input, hostile input, the limits
  that the source states, and rules that combine.
- Code example: What error occurs when a file is missing, or how does the cache behave on invalid
  keys?
- Threat example: What happens when a caller sends a path with `../` or a field with HTML in it?
  Which check stops it, and what breaks without that check?
- When the resource has a trust boundary (user input, files or data from outside, network input,
  or a third party), write at least one Tier 3 question about hostile input at that boundary. Base
  the answer on a check or a limit that the source shows.
- Book or docs example: How does a principle apply to a new scenario, or what exception does the
  text specify for a general rule?

### Tier 4: Expert
- Thinking type: Analyze.
- Target: the main design choices: tradeoffs, invariants, hidden assumptions, and limits.
- Code example: Why did the designers pick this data structure, or what invariant breaks if these
  two calls run out of order?
- Tradeoff example: Why does the design use X instead of Y? Name the rejected alternative Y in the
  prompt or in a choice, so that the learner weighs the two options.
- Ask why the designers chose X only when the source states the reason, for example in a decision
  record, a design document, or a code comment. When the source gives no reason, ask what the
  choice causes: what breaks, what it costs, or what it permits.
- Book or docs example: What limitation does the author identify in a technique, or how do two
  competing guidelines balance against each other?

## 2. Focus on the core

Test the part of the resource that every user meets. A niche question tests a detail that a
regular user can ignore.

Before you write, list the core of the resource in 5 to 10 lines:

- The purpose and the main output.
- The main entry points: the commands, the public functions, or the first pages of a document.
- The main flow from input to output, and the component that each step uses.
- The main data types and what each field holds.
- The options that most users set.
- The failures that a user sees most often, and the check that stops each one.

Write every question from this list. The four tiers go deeper into the same core. They do not
move to the edges. Tier 3 asks what the main flow does with bad input. Tier 4 asks why the main
design is the way it is.

Apply the regular-user test to each question: a person who uses the resource every week needs
the fact to use it correctly. When the test fails, replace the question.

The documentation of the resource anchors the test: the README, the main documentation page, or
the table of contents. A subject that the documentation names is core. A subject that only the
code shows is core only when it is the main flow from input to output.

Niche subjects, which fail the test:

- An exit code, a rare flag, or an option that most users never set.
- A license clause, a copyright line, or a credit.
- A fallback for a rare environment, for example reduced motion or blocked storage.
- An internal helper that no public path names, or the order of the steps inside one function.
- An error for a call that no documented use makes, for example a required argument left out.
- An old format, a removed option, or a changelog entry that the current documentation does not
  describe.
- A number that the source can change with no visible effect for the user.
- The reason for a wording choice in a document.

## 3. Prohibition on trivia

Every question must evaluate mental models and system comprehension. Trivia is strictly forbidden.

- Do not test recall of line numbers or source file offsets.
- Do not test arbitrary variable names, internal temporary values, or private function names.
- Do not test arbitrary numeric constants unless the constant represents a core domain constraint.
- Do not test superficial spelling or formatting details.
- Every question must test why code works in a specific way, how components interact, or what
  fails when assumptions change.

## 4. Choice composition

Every question has exactly four choices, and each field of the draft holds one role:

- `answer`: the text of the one correct choice.
- `obviousWrong`: one wrong choice, with `text` and `rationale`.
- `plausibleWrong`: an array of exactly two wrong choices, each with `text` and `rationale`.
- Never use "All of the above", "None of the above", or combination choices such as "Both A and B".
- Choice text must be unique within each question. No two choices may have identical text.
- Do not add choice letter prefixes (`A.`, `B.`, etc.). The compiler balances and assigns letters.
- Write all four choices with similar length and the same grammatical form.
- The correct choice must not be the most detailed choice or the only choice with a qualifier
  (such as "usually" or "in most cases").
- The build measures choice lengths, so that a learner who picks the longest choice does not win
  by guessing. It rejects a correct choice over 1.2 times as long as the longest wrong choice. It
  also rejects a quiz where the correct choice is the longest choice in more than a quarter of the
  questions. Let the build measure, and fix the questions that its errors name.

### Correct choice (`answer`)
- State the accurate technical answer directly.
- Ground the answer in the source material.
- Write only the text. The `explanation` of the question covers why the answer is correct.

### Obvious wrong choice (`obviousWrong`)
- State an incorrect option that a developer with basic domain understanding identifies as false.
- Keep the distractor within the domain topic. Do not write comical or absurd choices.
- Provide a non-empty `rationale` string explaining why this choice is incorrect.

### Plausible wrong choices (`plausibleWrong`)
- State incorrect options based on common developer misconceptions or partial truths.
- Model real engineering mistakes: inverted logic, missing edge cases, or confused terms.
- Provide a non-empty `rationale` string for each plausible distractor explaining why it fails.

## 5. Prompt clarity and verification

Design questions so that an independent reader reaches the exact correct choice:

- Each question must have exactly one answer that the source material supports. Another reader of
  the source must reach the same choice without ambiguity.
- The prompt must not give away the answer. Avoid distinctive words in the prompt that appear only
  in the correct choice.
- Avoid negative questions (such as "Which is NOT..."). If a negative question is needed, display
  "**NOT**" in bold.
- If a prompt refers to specific code behavior, include the relevant code snippet in a fenced code
  block, or state the exact file name.

## 6. Coverage

Spread questions across the core of the target resource:

- No two questions may test the same fact. Every question must evaluate a distinct concept or
  mechanism.
- Spread questions across the modules, chapters, or documentation pages of the core list. A
  module that a regular user does not meet gets no question.
- Avoid clustering multiple questions around a single function, file, or paragraph.

## 7. Explanations and citations

### Explanations
- Every question must provide a non-empty `explanation`.
- Explain why the correct choice is right by describing the underlying technical mechanism.
- Do not duplicate text from distractor rationales.
- Write explanations that teach the core concept to a learner who selected an incorrect choice.

### Citations
- Every question must provide a `citation` object.
- Provide a non-empty `target` identifying the file path, documentation URL, or topic. For local
  files, specify the path relative to the git repository root of the resource. The build compiler
  uses this root path to resolve git permalinks.
- For local files, include `lineStart` and `lineEnd` when the fact lives in a specific code block.
  Both numbers must be positive integers of 1 or more, and `lineEnd` must be at least `lineStart`.
- For PDF documents, specify the `page` number as a positive integer of 1 or more.

## 8. Language

Write every generated text so that a reader understands it on the first read: the title, the
source line, each prompt, each choice, each rationale, and each explanation. Follow ASD-STE100
Simplified Technical English:

- Write short sentences. Keep a sentence under 20 words.
- Put one idea in one sentence.
- Use the active voice. Name the subject that does the action.
- Use the simple present, past, or future tense.
- Use one word for one meaning, and the same word for the same thing in every sentence.
- Do not use idioms, slang, filler words, or jargon that the source does not use.
- Keep the technical names of the source: programming terms, framework terms, and code
  identifiers. Simplified Technical English permits technical names. Do not replace them with
  plain words, because a plain word is less exact.
- Describe an internal component by its role, for example "the function that assigns the answer
  letters". Its name can follow the role in backticks, but the question must make sense to a
  reader who does not know the name. A public name can stand alone: a command flag, an exported
  API, a configuration key, or a file name.
- Author questions in the language of the user prompt, or the conversation language. Apply the
  same sentence rules in that language.
- Format code identifiers in backticks (`code`).
- Format multiline code examples in fenced code blocks with language identifiers.
