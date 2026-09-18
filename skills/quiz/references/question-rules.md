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
- Target: edge cases, error conditions, boundary behavior, hostile input, and combining rules.
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
- Target: design tradeoffs, architectural invariants, hidden assumptions, and limitations.
- Code example: Why did the designers pick this data structure, or what invariant breaks if these
  two calls run out of order?
- Book or docs example: What limitation does the author identify in a technique, or how do two
  competing guidelines balance against each other?

## 2. Prohibition on trivia

Every question must evaluate mental models and system comprehension. Trivia is strictly forbidden.

- Do not test recall of line numbers or source file offsets.
- Do not test arbitrary variable names, internal temporary values, or private function names.
- Do not test arbitrary numeric constants unless the constant represents a core domain constraint.
- Do not test superficial spelling or formatting details.
- Every question must test why code works in a specific way, how components interact, or what
  fails when assumptions change.

## 3. Choice composition

Every question must contain exactly four choices:

- Exactly one choice with `kind: "correct"`.
- Exactly one choice with `kind: "obvious-wrong"`.
- Exactly two choices with `kind: "plausible-wrong"`.
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

### Correct choice
- State the accurate technical answer directly.
- Ground the answer in the source material.
- Omit the `rationale` field. The correct choice must not define a `rationale`.

### Obvious wrong choice
- State an incorrect option that a developer with basic domain understanding identifies as false.
- Keep the distractor within the domain topic. Do not write comical or absurd choices.
- Provide a non-empty `rationale` string explaining why this choice is incorrect.

### Plausible wrong choices
- State incorrect options based on common developer misconceptions or partial truths.
- Model real engineering mistakes: inverted logic, missing edge cases, or confused terms.
- Provide a non-empty `rationale` string for each plausible distractor explaining why it fails.

## 4. Prompt clarity and verification

Design questions so that an independent reader reaches the exact correct choice:

- Each question must have exactly one answer that the source material supports. Another reader of
  the source must reach the same choice without ambiguity.
- The prompt must not give away the answer. Avoid distinctive words in the prompt that appear only
  in the correct choice.
- Avoid negative questions (such as "Which is NOT..."). If a negative question is needed, display
  "**NOT**" in bold.
- If a prompt refers to specific code behavior, include the relevant code snippet in a fenced code
  block, or state the exact file name.

## 5. Coverage

Spread questions across the target resource:

- No two questions may test the same fact. Every question must evaluate a distinct concept or
  mechanism.
- Spread questions across the modules, chapters, or documentation pages that the prompt or focus
  covers.
- Avoid clustering multiple questions around a single function, file, or paragraph.

## 6. Explanations and citations

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

## 7. Technical language

- Use exact programming terms and domain language from the source repository.
- Author questions in the language of the user prompt, or the conversation language.
- Format code identifiers in backticks (`code`).
- Format multiline code examples in fenced code blocks with language identifiers.
- Keep prompt statements direct and concise.
