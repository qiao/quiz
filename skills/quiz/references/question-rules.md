# Question authoring rules

This reference defines the canonical rules for authoring draft quiz questions. The agent reads this
document during Phase 2 before authoring `quizzes/<slug>/quiz.json`.

## 1. Progressive tiers

Organize all questions into four progressive difficulty tiers. Arrange questions in non-decreasing
tier order: all Tier 1 questions first, followed by Tier 2, Tier 3, and Tier 4.

Tier sizes must differ by at most 1 question across all four tiers. For total count N, allocate
`Math.floor(N / 4)` questions to each tier, and distribute remainders to earlier tiers.

### Tier 1: Fundamentals
- Purpose: verifies understanding of primary responsibilities, public entry points, and patterns.
- Target: tests what the system does and why the system exists.
- Focus: module roles, system boundaries, public API surfaces, and high-level patterns.

### Tier 2: Core
- Purpose: verifies ability to trace standard execution flows and component interactions.
- Target: tests how components coordinate during normal operation.
- Focus: request lifecycles, event pipelines, state transitions, and data transformations.

### Tier 3: Advanced
- Purpose: verifies comprehension of edge cases, boundary conditions, and error recovery.
- Target: tests how the system handles stress, errors, and concurrent actions.
- Focus: retry policies, race conditions, timeout handling, cache invalidation, and cleanup logic.

### Tier 4: Expert
- Purpose: verifies comprehension of architectural compromises and subtle design invariants.
- Target: tests understanding of systemic tradeoffs, failure modes, and unwritten invariants.
- Focus: consistency models, deadlock prevention, split-brain recovery, protocol limits, and limits
  of scalability.

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

## 4. Explanations and citations

### Explanations
- Every question must provide a non-empty `explanation`.
- Explain why the correct choice is right by describing the underlying technical mechanism.
- Do not duplicate text from distractor rationales.
- Write explanations that teach the core concept to a learner who selected an incorrect choice.

### Citations
- Every question must provide a `citation` object.
- Provide a non-empty `target` identifying the relative file path, documentation URL, or topic.
- For local files, include `lineStart` and `lineEnd` when the fact lives in a specific code block.
  `lineEnd` must be greater than or equal to `lineStart`.
- For PDF documents, specify the `page` number.

## 5. Technical language

- Use exact programming terms and domain language from the source repository.
- Author questions in the language of the user prompt, or the conversation language.
- Format code identifiers in backticks (`code`).
- Format multiline code examples in fenced code blocks with language identifiers.
- Keep prompt statements direct and concise.
