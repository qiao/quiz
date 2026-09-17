// @ts-check
/**
 * Compiles a quiz draft into one self-contained HTML slide page.
 *
 * The agent writes only the draft. This script checks the draft, derives every other field, and
 * writes the page. Section 3 of `docs/architecture.md` specifies the command line.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * @typedef {'correct' | 'obvious-wrong' | 'plausible-wrong'} ChoiceKind
 *
 * @typedef {object} DraftCitation
 * @property {string} target File path from the repository root, chapter, or URL.
 * @property {number} [lineStart] First line of the cited range.
 * @property {number} [lineEnd] Last line of the cited range.
 * @property {number} [page] Page number for a PDF.
 *
 * @typedef {object} DraftChoice
 * @property {string} text Choice text in Markdown.
 * @property {ChoiceKind} kind Role of the choice.
 * @property {string} [rationale] Reason that a wrong choice is wrong.
 *
 * @typedef {object} DraftQuestion
 * @property {1 | 2 | 3 | 4} tier Difficulty tier.
 * @property {string} prompt Question text in Markdown.
 * @property {DraftChoice[]} choices Exactly 4 choices.
 * @property {string} explanation Reason that the correct choice is correct.
 * @property {DraftCitation} citation Source of the answer.
 *
 * @typedef {object} QuizDraft
 * @property {string} title Title of the quiz.
 * @property {string} slug Folder name of the quiz.
 * @property {string} source Resource that the quiz covers.
 * @property {DraftQuestion[]} questions Questions in tier order.
 */

/** Pattern that a slug must match, so that it cannot leave the `quizzes/` folder. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Names of the tiers, in tier order. */
export const TIER_NAMES = ['Fundamentals', 'Core', 'Advanced', 'Expert'];

const CHOICE_KINDS = ['correct', 'obvious-wrong', 'plausible-wrong'];

/** Largest length of the correct choice, as a multiple of the longest wrong choice. */
const MAX_CORRECT_LENGTH_RATIO = 1.2;
const KIND_COUNTS = { correct: 1, 'obvious-wrong': 1, 'plausible-wrong': 2 };

const QUIZ_FIELDS = ['title', 'slug', 'source', 'questions'];
const QUESTION_FIELDS = ['tier', 'prompt', 'choices', 'explanation', 'citation'];
const CHOICE_FIELDS = ['text', 'kind', 'rationale'];
const CITATION_FIELDS = ['target', 'lineStart', 'lineEnd', 'page'];

/**
 * Tells if a value is a plain object.
 *
 * @param {unknown} value Value to test.
 * @returns {value is Record<string, unknown>} True for an object that is not an array.
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Tells if a value is a string with at least one character that is not a space.
 *
 * @param {unknown} value Value to test.
 * @returns {boolean} True for a string that is not empty.
 */
function isFilledString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Adds one error for each field that the allowed list does not name.
 *
 * @param {Record<string, unknown>} object Object to check.
 * @param {string[]} allowed Field names that the object can have.
 * @param {string} label Start of each error message.
 * @param {string[]} errors List that receives the errors.
 * @param {string} [prefix] Text before each field name, for example `citation.`.
 */
function checkUnknownFields(object, allowed, label, errors, prefix = '') {
  for (const field of Object.keys(object)) {
    if (!allowed.includes(field)) errors.push(`${label}: unknown field '${prefix}${field}'`);
  }
}

/**
 * Checks the citation of one question.
 *
 * @param {unknown} citation Citation to check.
 * @param {string} label Start of each error message.
 * @param {string[]} errors List that receives the errors.
 */
function checkCitation(citation, label, errors) {
  if (!isObject(citation)) {
    errors.push(`${label}: 'citation' must be an object with a 'target'`);
    return;
  }
  checkUnknownFields(citation, CITATION_FIELDS, label, errors, 'citation.');
  if (!isFilledString(citation.target)) {
    errors.push(`${label}: 'citation.target' must be a string that is not empty`);
  }
  for (const field of ['lineStart', 'lineEnd', 'page']) {
    const value = citation[field];
    // A missing number is valid, and 0 is not, so compare with undefined.
    if (value !== undefined && !(Number.isInteger(value) && Number(value) >= 1)) {
      errors.push(`${label}: 'citation.${field}' must be a whole number of 1 or more`);
    }
  }
  const { lineStart, lineEnd } = citation;
  const bothLines = Number.isInteger(lineStart) && Number.isInteger(lineEnd);
  if (bothLines && Number(lineEnd) < Number(lineStart)) {
    errors.push(
      `${label}: 'citation.lineEnd' (${lineEnd}) is less than 'citation.lineStart' (${lineStart})`,
    );
  }
}

/**
 * Rejects a correct choice that is much longer than every wrong choice.
 *
 * A learner who picks the longest choice must not find the answer. The check runs only when the
 * question has one correct choice and every choice has text.
 *
 * @param {unknown[]} choices The 4 choices of the question.
 * @param {string} label Start of each error message.
 * @param {string[]} errors List that receives the errors.
 */
function checkChoiceLengths(choices, label, errors) {
  const valid = choices.every((choice) => isObject(choice) && isFilledString(choice.text));
  if (!valid) return;
  const typed = /** @type {DraftChoice[]} */ (choices);
  const correct = typed.filter((choice) => choice.kind === 'correct');
  if (correct.length !== 1) return;

  const correctLength = correct[0].text.trim().length;
  const wrongLengths = typed
    .filter((choice) => choice.kind !== 'correct')
    .map((choice) => choice.text.trim().length);
  const longestWrong = Math.max(...wrongLengths);
  if (correctLength > longestWrong * MAX_CORRECT_LENGTH_RATIO) {
    errors.push(
      `${label}: the correct choice has ${correctLength} characters, and the longest wrong ` +
        `choice has ${longestWrong}. Make the lengths closer, so that the length does not show ` +
        'the answer',
    );
  }
}

/**
 * Checks the choices of one question.
 *
 * @param {unknown} choices Choices to check.
 * @param {string} label Start of each error message.
 * @param {string[]} errors List that receives the errors.
 */
function checkChoices(choices, label, errors) {
  if (!Array.isArray(choices) || choices.length !== 4) {
    const found = Array.isArray(choices) ? choices.length : 'no array';
    errors.push(`${label}: expected exactly 4 choices, found ${found}`);
    return;
  }
  /** @type {Record<string, number>} */
  const counts = { correct: 0, 'obvious-wrong': 0, 'plausible-wrong': 0 };
  /** @type {Map<string, number>} */
  const seenTexts = new Map();

  choices.forEach((choice, index) => {
    const number = index + 1;
    if (!isObject(choice)) {
      errors.push(`${label}, Choice ${number}: the choice must be a JSON object`);
      return;
    }
    const kind = String(choice.kind);
    const validKind = CHOICE_KINDS.includes(kind);
    const choiceLabel = validKind
      ? `${label}, Choice ${number} ('${kind}')`
      : `${label}, Choice ${number}`;

    checkUnknownFields(choice, CHOICE_FIELDS, choiceLabel, errors);
    if (validKind) {
      counts[kind] += 1;
    } else {
      errors.push(
        `${choiceLabel}: 'kind' must be 'correct', 'obvious-wrong', or 'plausible-wrong', ` +
          `found '${kind}'`,
      );
    }
    if (isFilledString(choice.text)) {
      const key = String(choice.text).trim();
      const first = seenTexts.get(key);
      if (first) errors.push(`${label}: choices ${first} and ${number} have the same text`);
      else seenTexts.set(key, number);
    } else {
      errors.push(`${choiceLabel}: 'text' must be a string that is not empty`);
    }

    if (kind === 'correct' && 'rationale' in choice) {
      errors.push(
        `${choiceLabel}: remove 'rationale', because 'explanation' covers the correct choice`,
      );
    } else if (validKind && kind !== 'correct' && choice.rationale === undefined) {
      errors.push(`${choiceLabel}: missing required 'rationale'`);
    } else if (validKind && kind !== 'correct' && !isFilledString(choice.rationale)) {
      errors.push(`${choiceLabel}: 'rationale' must be a string that is not empty`);
    }
  });

  checkChoiceLengths(choices, label, errors);

  for (const kind of CHOICE_KINDS) {
    const expected = KIND_COUNTS[/** @type {ChoiceKind} */ (kind)];
    if (counts[kind] !== expected) {
      const noun = expected === 1 ? 'choice' : 'choices';
      errors.push(
        `${label}: expected exactly ${expected} '${kind}' ${noun}, ` +
          `found ${counts[kind]}`,
      );
    }
  }
}

/**
 * Checks a quiz draft against the rules of section 3 of `docs/architecture.md`.
 *
 * @param {unknown} draft Parsed content of `quiz.json`.
 * @returns {string[]} One message for each broken rule. An empty list means that the draft is
 *   valid.
 * @example
 * const errors = validateDraft(JSON.parse(readFileSync('quiz.json', 'utf8')));
 * if (errors.length) console.error(errors.join('\n'));
 */
export function validateDraft(draft) {
  /** @type {string[]} */
  const errors = [];
  if (!isObject(draft)) return ['Quiz: the draft must be a JSON object'];

  checkUnknownFields(draft, QUIZ_FIELDS, 'Quiz', errors);
  for (const field of ['title', 'source']) {
    if (!isFilledString(draft[field])) {
      errors.push(`Quiz: '${field}' must be a string that is not empty`);
    }
  }
  if (typeof draft.slug !== 'string' || !SLUG_PATTERN.test(draft.slug)) {
    errors.push(`Quiz: 'slug' must match ${SLUG_PATTERN.source}, found '${draft.slug}'`);
  }
  if (!Array.isArray(draft.questions) || draft.questions.length === 0) {
    errors.push("Quiz: 'questions' must be an array with at least one question");
    return errors;
  }

  const tierSizes = [0, 0, 0, 0];
  let previousTier = 0;
  draft.questions.forEach((question, index) => {
    const label = `Question ${index + 1}`;
    if (!isObject(question)) {
      errors.push(`${label}: the question must be a JSON object`);
      return;
    }
    checkUnknownFields(question, QUESTION_FIELDS, label, errors);

    const { tier } = question;
    if (tier === 1 || tier === 2 || tier === 3 || tier === 4) {
      tierSizes[tier - 1] += 1;
      if (tier < previousTier) {
        errors.push(
          `${label}: tier ${tier} comes after tier ${previousTier}, but the tier must not go down`,
        );
      }
      previousTier = Math.max(previousTier, tier);
    } else {
      errors.push(`${label}: 'tier' must be 1, 2, 3, or 4, found ${JSON.stringify(tier)}`);
    }

    for (const field of ['prompt', 'explanation']) {
      if (!isFilledString(question[field])) {
        errors.push(`${label}: '${field}' must be a string that is not empty`);
      }
    }
    checkChoices(question.choices, label, errors);
    checkCitation(question.citation, label, errors);
  });

  if (Math.max(...tierSizes) - Math.min(...tierSizes) > 1) {
    errors.push(
      `Quiz: tier sizes must differ by at most 1 question, found ${tierSizes.join(', ')}`,
    );
  }
  return errors;
}

/** @type {Record<string, string>} */
const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Replaces the five characters that HTML treats as markup with entities.
 *
 * @param {string} text Raw text.
 * @returns {string} Text that is safe inside an element or an attribute value.
 */
export function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

/**
 * Renders inline code, strong text, and emphasis in one line of Markdown.
 *
 * @param {string} text One line of Markdown.
 * @returns {string} Safe HTML.
 */
function renderInline(text) {
  return text
    .split(/(`[^`\n]+`)/)
    .map((part, index) => {
      // Odd parts are code spans, so their Markdown characters stay as text.
      if (index % 2 === 1) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      return escapeHtml(part)
        .replace(/\*\*([^*\s](?:[^*]*[^*\s])?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*\s](?:[^*]*[^*\s])?)\*/g, '<em>$1</em>');
    })
    .join('');
}

const FENCE_START = /^\s*```\s*([\w+-]*)\s*$/;
const FENCE_END = /^\s*```\s*$/;
const LIST_ITEM = /^\s*- /;

/**
 * Renders the Markdown subset of section 4 of `docs/architecture.md` as safe HTML.
 *
 * The subset is paragraphs, lists with hyphens, fenced code, inline code, strong text, and
 * emphasis. Every other character is escaped, so raw HTML in the draft shows as text.
 *
 * @param {string} markdown Markdown text from the draft.
 * @returns {string} Safe HTML.
 * @example
 * renderMarkdown('Use `<br>`'); // '<p>Use <code>&lt;br&gt;</code></p>'
 */
export function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  /** @type {string[]} */
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const fence = FENCE_START.exec(line);
    if (fence) {
      /** @type {string[]} */
      const code = [];
      index += 1;
      while (index < lines.length && !FENCE_END.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      const language = fence[1] ? ` data-lang="${escapeHtml(fence[1])}"` : '';
      blocks.push(`<pre${language}><code>${escapeHtml(code.join('\n'))}</code></pre>`);
    } else if (line.trim() === '') {
      index += 1;
    } else if (LIST_ITEM.test(line)) {
      /** @type {string[]} */
      const items = [];
      while (index < lines.length && LIST_ITEM.test(lines[index])) {
        items.push(`<li>${renderInline(lines[index].replace(LIST_ITEM, ''))}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
    } else {
      /** @type {string[]} */
      const words = [];
      while (
        index < lines.length &&
        lines[index].trim() !== '' &&
        !FENCE_START.test(lines[index]) &&
        !LIST_ITEM.test(lines[index])
      ) {
        words.push(lines[index].trim());
        index += 1;
      }
      blocks.push(`<p>${renderInline(words.join(' '))}</p>`);
    }
  }
  return blocks.join('');
}

/**
 * Derives the quiz id from the slug and a hash of the questions.
 *
 * A new quiz at an old slug gets a new id, so the page does not load old saved progress.
 *
 * @param {QuizDraft} draft Valid draft.
 * @returns {string} The slug, a hyphen, and the first 8 hex characters of a SHA-256 hash.
 */
export function quizIdOf(draft) {
  const hash = createHash('sha256').update(JSON.stringify(draft.questions)).digest('hex');
  return `${draft.slug}-${hash.slice(0, 8)}`;
}

/**
 * Creates a random number generator that always gives the same numbers for the same seed.
 *
 * The generator is mulberry32, with its state from the first 4 bytes of a SHA-256 hash of the seed.
 *
 * @param {string} seed Any text.
 * @returns {() => number} A function that returns a number from 0 (included) to 1 (excluded).
 */
function createRandom(seed) {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Shuffles an array in place with the Fisher-Yates method.
 *
 * @template T
 * @param {T[]} items Array to shuffle.
 * @param {() => number} random Random number generator.
 */
function shuffleInPlace(items, random) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
}

/**
 * Decides the display order of the choices of each question.
 *
 * The correct choice goes to each of the 4 positions an equal number of times, and the remainder
 * goes to the earlier positions. The wrong choices fill the open positions in a random order. The
 * seed is the quiz id, so the blind copy, the grade, and the page all use the same order.
 *
 * @param {QuizDraft} draft Valid draft.
 * @returns {number[][]} For each question, the draft indices of its choices in display order.
 * @example
 * choiceOrders(draft)[0]; // [2, 0, 3, 1]: position a shows draft choice 2
 */
export function choiceOrders(draft) {
  const random = createRandom(quizIdOf(draft));
  const correctSlots = draft.questions.map((_, index) => index % 4);
  shuffleInPlace(correctSlots, random);

  return draft.questions.map((question, questionIndex) => {
    const correctIndex = question.choices.findIndex((choice) => choice.kind === 'correct');
    const wrongIndexes = [0, 1, 2, 3].filter((index) => index !== correctIndex);
    shuffleInPlace(wrongIndexes, random);
    const correctSlot = correctSlots[questionIndex];
    return [0, 1, 2, 3].map((slot) =>
      slot === correctSlot ? correctIndex : /** @type {number} */ (wrongIndexes.shift()),
    );
  });
}

/** Letters that name the choice positions on a slide. */
export const CHOICE_LETTERS = /** @type {const} */ (['a', 'b', 'c', 'd']);

/**
 * @typedef {typeof CHOICE_LETTERS[number]} ChoiceLetter
 *
 * @typedef {object} BlindQuestion
 * @property {number} id Question number, from 1.
 * @property {1 | 2 | 3 | 4} tier Difficulty tier.
 * @property {string} prompt Question text in Markdown.
 * @property {{ id: ChoiceLetter, text: string }[]} choices Choices in page order.
 * @property {DraftCitation} citation Source of the answer.
 *
 * @typedef {object} BlindQuiz
 * @property {string} title Title of the quiz.
 * @property {string} slug Folder name of the quiz.
 * @property {string} source Resource that the quiz covers.
 * @property {BlindQuestion[]} questions Questions with no answer key.
 *
 * @typedef {object} SubAgentAnswer
 * @property {number} questionId Question number, from 1.
 * @property {ChoiceLetter | 'ambiguous'} choice Letter that the checker chose.
 * @property {string} [reason] Why the question is ambiguous.
 *
 * @typedef {object} GradeFailure
 * @property {number} questionId Question number, from 1.
 * @property {1 | 2 | 3 | 4} tier Difficulty tier.
 * @property {string} reason What the checker did.
 *
 * @typedef {object} GradeReport
 * @property {boolean} passed True when every question passed.
 * @property {number} totalQuestions Number of questions in the draft.
 * @property {number} passedCount Number of questions that passed.
 * @property {GradeFailure[]} failures One item for each question that failed.
 */

/**
 * Makes the copy of the quiz that the blind checker reads.
 *
 * @param {QuizDraft} draft Valid draft.
 * @returns {BlindQuiz} The quiz with no `kind`, `rationale`, or `explanation`, and with the choices
 *   in page order.
 */
export function blindQuiz(draft) {
  const orders = choiceOrders(draft);
  return {
    title: draft.title,
    slug: draft.slug,
    source: draft.source,
    questions: draft.questions.map((question, index) => ({
      id: index + 1,
      tier: question.tier,
      prompt: question.prompt,
      choices: orders[index].map((choiceIndex, slot) => ({
        id: CHOICE_LETTERS[slot],
        text: question.choices[choiceIndex].text,
      })),
      citation: question.citation,
    })),
  };
}

const ANSWER_FIELDS = ['questionId', 'choice', 'reason'];

/**
 * Checks the answer file that the blind checker returned.
 *
 * @param {unknown} file Parsed content of `answers.json`.
 * @param {number} questionCount Number of questions in the draft.
 * @returns {string[]} One message for each broken rule. An empty list means that the file is
 *   valid.
 */
export function validateAnswers(file, questionCount) {
  if (!isObject(file) || !Array.isArray(file.answers)) {
    return ["Answers: the file must be a JSON object with an 'answers' array"];
  }
  /** @type {string[]} */
  const errors = [];
  const seen = new Set();
  file.answers.forEach((answer, index) => {
    const label = `Answer ${index + 1}`;
    if (!isObject(answer)) {
      errors.push(`${label}: the answer must be a JSON object`);
      return;
    }
    checkUnknownFields(answer, ANSWER_FIELDS, label, errors);
    const { questionId, choice, reason } = answer;
    const inRange = Number(questionId) >= 1 && Number(questionId) <= questionCount;
    if (!Number.isInteger(questionId) || !inRange) {
      errors.push(
        `${label}: 'questionId' must be a question number from 1 to ${questionCount}, ` +
          `found ${JSON.stringify(questionId)}`,
      );
    } else if (seen.has(questionId)) {
      errors.push(`${label}: question ${questionId} already has an answer`);
    } else {
      seen.add(questionId);
    }
    if (![...CHOICE_LETTERS, 'ambiguous'].includes(String(choice))) {
      errors.push(
        `${label}: 'choice' must be 'a', 'b', 'c', 'd', or 'ambiguous', found '${choice}'`,
      );
    }
    if (choice === 'ambiguous' && !isFilledString(reason)) {
      errors.push(`${label}: an 'ambiguous' answer needs a 'reason' that is not empty`);
    }
  });
  return errors;
}

/**
 * Compares the answers of the blind checker with the answer key of the draft.
 *
 * @param {QuizDraft} draft Valid draft.
 * @param {{ answers: SubAgentAnswer[] }} file Valid answer file.
 * @returns {GradeReport} The result for the whole quiz, with one failure for each question that
 *   the checker missed, marked as ambiguous, or did not answer.
 */
export function gradeAnswers(draft, file) {
  const orders = choiceOrders(draft);
  const answers = new Map(file.answers.map((answer) => [answer.questionId, answer]));
  /** @type {GradeFailure[]} */
  const failures = [];

  draft.questions.forEach((question, index) => {
    const questionId = index + 1;
    const answer = answers.get(questionId);
    const fail = (/** @type {string} */ reason) =>
      failures.push({ questionId, tier: question.tier, reason });

    if (!answer) {
      fail('The checker gave no answer for this question.');
    } else if (answer.choice === 'ambiguous') {
      fail(`The checker marked the question as ambiguous: ${answer.reason}`);
    } else {
      const slot = CHOICE_LETTERS.indexOf(answer.choice);
      const choiceIndex = orders[index][slot];
      const chosen = question.choices[choiceIndex];
      if (chosen.kind !== 'correct') {
        const correctLetter = CHOICE_LETTERS[orders[index].findIndex(
          (other) => question.choices[other].kind === 'correct',
        )];
        const note = answer.reason ? ` The checker said: ${answer.reason}` : '';
        fail(
          `The checker chose ${answer.choice}, which is draft choice ${choiceIndex + 1} ` +
            `('${chosen.kind}'): "${chosen.text}". The correct choice is ${correctLetter}.${note}`,
        );
      }
    }
  });

  return {
    passed: failures.length === 0,
    totalQuestions: draft.questions.length,
    passedCount: draft.questions.length - failures.length,
    failures,
  };
}

/**
 * @typedef {DraftCitation & { url?: string }} BuiltCitation
 *
 * @typedef {(args: string[]) => string | null} GitRunner
 *
 * @typedef {object} GitFacts
 * @property {string} commit Full SHA of `HEAD`.
 * @property {string | null} webUrl Web address of the GitHub repository, or null.
 * @property {boolean} pushed True when a remote-tracking branch contains `HEAD`.
 * @property {GitRunner} git Runner that works in the repository root.
 */

/**
 * Makes a git runner for a folder.
 *
 * @param {string} folder Folder where git runs.
 * @returns {GitRunner} A runner that returns the trimmed standard output, or null when git fails.
 */
export function gitRunnerFor(folder) {
  return (args) => {
    try {
      const output = execFileSync('git', ['-C', folder, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return output.trim();
    } catch {
      return null;
    }
  };
}

/** Pattern for the SSH, SSH URL, and HTTPS forms of a GitHub remote. */
const GITHUB_REMOTE = new RegExp(
  '^(?:git@github\\.com:|ssh://git@github\\.com/|https://(?:[^@/]+@)?github\\.com/)' +
    '([^/]+)/([^/]+?)(?:\\.git)?/?$',
);

/**
 * Converts a GitHub remote URL to the web address of the repository.
 *
 * @param {string} remote Output of `git remote get-url origin`.
 * @returns {string | null} For example `https://github.com/acme/app`, or null for another host.
 */
export function githubWebUrl(remote) {
  const match = GITHUB_REMOTE.exec(remote.trim());
  return match ? `https://github.com/${match[1]}/${match[2]}` : null;
}

/**
 * Reads the git facts that a permalink needs.
 *
 * @param {GitRunner} git Runner for the folder where the build runs.
 * @param {(folder: string) => GitRunner} [runnerAt] Makes a runner for the repository root.
 * @returns {GitFacts | null} The facts, or null when the folder is not in a git repository.
 */
export function readGitFacts(git, runnerAt = gitRunnerFor) {
  const root = git(['rev-parse', '--show-toplevel']);
  const commit = git(['rev-parse', 'HEAD']);
  if (!root || !commit) return null;
  const remote = git(['remote', 'get-url', 'origin']);
  return {
    commit,
    webUrl: remote ? githubWebUrl(remote) : null,
    pushed: Boolean(git(['branch', '-r', '--contains', 'HEAD'])),
    git: runnerAt(root),
  };
}

/**
 * Adds a link to a citation when a reader can open the cited source.
 *
 * A URL target links to itself. A file links to a GitHub permalink only when the file is tracked,
 * has no uncommitted change, and `HEAD` is on a remote-tracking branch. In every other case the
 * citation stays plain text, so a link never points to the wrong lines.
 *
 * @param {DraftCitation} citation Citation from the draft.
 * @param {GitFacts | null} facts Git facts, or null outside a repository.
 * @returns {BuiltCitation} The citation, with `url` when a link is safe.
 */
export function resolveCitation(citation, facts) {
  if (/^https?:\/\//.test(citation.target)) return { ...citation, url: citation.target };
  if (!facts || !facts.webUrl || !facts.pushed) return { ...citation };

  const path = citation.target.replace(/^\.\//, '');
  // An empty string from git status means "no change", so compare with '' and not for truth.
  const tracked = facts.git(['ls-files', '--', path]) === path;
  const clean = facts.git(['status', '--porcelain', '--', path]) === '';
  if (!tracked || !clean) return { ...citation };

  let anchor = '';
  if (citation.page) {
    anchor = `#page=${citation.page}`;
  } else if (citation.lineStart) {
    const end = citation.lineEnd;
    anchor = end && end !== citation.lineStart
      ? `#L${citation.lineStart}-L${end}`
      : `#L${citation.lineStart}`;
  }
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return { ...citation, url: `${facts.webUrl}/blob/${facts.commit}/${encodedPath}${anchor}` };
}

/**
 * @typedef {object} BuiltChoice
 * @property {ChoiceLetter} id Letter of the position on the slide.
 * @property {string} textHtml Choice text as safe HTML.
 * @property {ChoiceKind} kind Role of the choice.
 * @property {string} [rationaleHtml] Reason that a wrong choice is wrong, as safe HTML.
 *
 * @typedef {object} BuiltQuestion
 * @property {number} id Question number, from 1.
 * @property {1 | 2 | 3 | 4} tier Difficulty tier.
 * @property {string} tierName Name of the tier.
 * @property {string} promptHtml Question text as safe HTML.
 * @property {BuiltChoice[]} choices Choices in page order.
 * @property {string} explanationHtml Reason that the correct choice is correct, as safe HTML.
 * @property {BuiltCitation} citation Source of the answer, with a link when one is safe.
 *
 * @typedef {object} BuiltQuiz
 * @property {string} id Quiz id from `quizIdOf`.
 * @property {string} title Title of the quiz, as plain text.
 * @property {string} slug Folder name of the quiz.
 * @property {string} source Resource that the quiz covers, as plain text.
 * @property {string} createdAt Build time in ISO 8601 form.
 * @property {BuiltQuestion[]} questions Questions in tier order.
 */

/**
 * Derives the page data from a valid draft.
 *
 * @param {QuizDraft} draft Valid draft.
 * @param {{ createdAt: string, gitFacts: GitFacts | null }} options Build time and git facts.
 * @returns {BuiltQuiz} The data that the page reads.
 */
export function buildQuiz(draft, { createdAt, gitFacts }) {
  const orders = choiceOrders(draft);
  return {
    id: quizIdOf(draft),
    title: draft.title,
    slug: draft.slug,
    source: draft.source,
    createdAt,
    questions: draft.questions.map((question, index) => ({
      id: index + 1,
      tier: question.tier,
      tierName: TIER_NAMES[question.tier - 1],
      promptHtml: renderMarkdown(question.prompt),
      choices: orders[index].map((choiceIndex, slot) => {
        const choice = question.choices[choiceIndex];
        /** @type {BuiltChoice} */
        const built = {
          id: CHOICE_LETTERS[slot],
          textHtml: renderMarkdown(choice.text),
          kind: choice.kind,
        };
        if (choice.rationale) built.rationaleHtml = renderMarkdown(choice.rationale);
        return built;
      }),
      explanationHtml: renderMarkdown(question.explanation),
      citation: resolveCitation(question.citation, gitFacts),
    })),
  };
}

/**
 * @typedef {object} PageParts
 * @property {string} template Content of `template.html`.
 * @property {string} tokensCss Content of `tokens.css`.
 * @property {string} fontsCss Content of `assets/fonts.css`.
 * @property {string} license Content of `assets/OFL.txt`.
 */

/**
 * Replaces the one copy of a placeholder in the template.
 *
 * Split and join keep `$&` and other replacement patterns in the value as plain text.
 *
 * @param {string} template Template text.
 * @param {string} placeholder Exact placeholder text.
 * @param {string} value Text to insert.
 * @returns {string} The template with the value in place of the placeholder.
 */
function fillPlaceholder(template, placeholder, value) {
  const parts = template.split(placeholder);
  if (parts.length !== 2) {
    throw new Error(
      `template.html must hold ${placeholder} exactly once, found ${parts.length - 1}`,
    );
  }
  return parts.join(value);
}

/**
 * Writes the self-contained page for a built quiz.
 *
 * The quiz data goes into a JSON script tag. Each `<` becomes `<`, so the data cannot close
 * the tag or open a comment, and `JSON.parse` still reads it.
 *
 * @param {BuiltQuiz} quiz Built quiz.
 * @param {PageParts} parts Template and assets.
 * @returns {string} The complete HTML page.
 */
export function renderPage(quiz, parts) {
  let page = parts.template;
  page = fillPlaceholder(page, '{{TITLE}}', escapeHtml(quiz.title));
  page = fillPlaceholder(page, '/*{{TOKENS_CSS}}*/', parts.tokensCss.trim());
  page = fillPlaceholder(page, '/*{{FONTS_CSS}}*/', parts.fontsCss.trim());
  page = fillPlaceholder(
    page,
    '<!--{{LICENSE}}-->',
    `<!--\n${parts.license.trim().replaceAll('-->', '-- >')}\n-->`,
  );
  page = fillPlaceholder(page, '{{QUIZ_DATA}}', JSON.stringify(quiz).replace(/</g, '\\u003c'));
  return page;
}

const USAGE = `Usage:
  node <skill-dir>/build.mjs <quiz.json>
      Write index.html next to the draft.
  node <skill-dir>/build.mjs <quiz.json> --blind
      Write quiz.blind.json for the blind checker.
  node <skill-dir>/build.mjs <quiz.json> --grade <answers.json>
      Print a grade report as JSON.

Run the command from the project folder. Relative paths start from that folder.
Exit codes: 0 when the command worked, 1 for a validation error, 2 for a usage error,
3 when --grade found at least one failed question.
`;

/**
 * @typedef {object} MainIo
 * @property {string} cwd Folder that relative paths start from.
 * @property {Record<string, string | undefined>} env Environment variables.
 * @property {string} skillDir Folder that holds `template.html` and the assets.
 * @property {(text: string) => void} stdout Writes to standard output.
 * @property {(text: string) => void} stderr Writes to standard error.
 */

/** Error that stops the command with a given exit code and message. */
class CommandError extends Error {
  /**
   * Makes an error for the command line.
   *
   * @param {1 | 2} code Exit code.
   * @param {string} message Text for standard error.
   * @param {{ showUsage?: boolean }} [options] True in `showUsage` for a mistake in the arguments.
   */
  constructor(code, message, { showUsage = false } = {}) {
    super(message);
    this.code = code;
    this.showUsage = showUsage;
  }
}

/**
 * Makes the error for a mistake in the command line arguments.
 *
 * @param {string} message Text for standard error.
 * @returns {CommandError} An error with code 2 that also prints the usage text.
 */
function usageError(message) {
  return new CommandError(2, message, { showUsage: true });
}

/**
 * Reads a JSON file for the command line.
 *
 * @param {string} path Path as the user wrote it.
 * @param {string} cwd Folder that a relative path starts from.
 * @returns {unknown} The parsed value.
 * @throws {CommandError} With code 2 when the file does not exist, or code 1 when it is not JSON.
 */
function readJsonFile(path, cwd) {
  const fullPath = resolve(cwd, path);
  if (!existsSync(fullPath)) {
    throw new CommandError(2, `Error: cannot read ${path}: the file does not exist`);
  }
  try {
    return JSON.parse(readFileSync(fullPath, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const message = `VALIDATION ERROR in ${path}:\n- The file is not valid JSON: ${reason}`;
    throw new CommandError(1, message);
  }
}

/**
 * Stops the command when a validation step found errors.
 *
 * @param {string[]} errors Messages from a validation function.
 * @param {string} path Path of the file that the messages describe.
 * @throws {CommandError} With code 1 when the list is not empty.
 */
function stopOnErrors(errors, path) {
  if (errors.length) {
    const list = errors.map((error) => `- ${error}`).join('\n');
    throw new CommandError(1, `VALIDATION ERROR in ${path}:\n${list}`);
  }
}

/**
 * Reads the command line arguments.
 *
 * @param {string[]} args Arguments after the script name.
 * @returns {{ help: boolean, draftPath: string, blind: boolean, gradePath: string | null }}
 *   The parsed arguments.
 * @throws {CommandError} With code 2 for a usage error.
 */
function parseArgs(args) {
  /** @type {string[]} */
  const paths = [];
  let blind = false;
  /** @type {string | null} */
  let gradePath = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') return { help: true, draftPath: '', blind, gradePath };
    if (arg === '--blind') {
      blind = true;
    } else if (arg === '--grade') {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        throw usageError('Error: --grade needs the path to answers.json');
      }
      gradePath = next;
      index += 1;
    } else if (arg.startsWith('-')) {
      throw usageError(`Error: unknown option '${arg}'`);
    } else {
      paths.push(arg);
    }
  }
  if (paths.length === 0) throw usageError('Error: missing the path to quiz.json');
  if (paths.length > 1) {
    throw usageError(`Error: expected one draft path, found ${paths.length}`);
  }
  if (blind && gradePath) throw usageError('Error: use --blind or --grade, not both');
  return { help: false, draftPath: paths[0], blind, gradePath };
}

/**
 * Reads the template and the assets from the skill folder.
 *
 * @param {string} skillDir Folder of the skill.
 * @returns {PageParts} The page parts.
 * @throws {CommandError} With code 2 when a file is missing, because the skill is not complete.
 */
function readPageParts(skillDir) {
  /** @param {string} name File name in the skill folder. */
  const read = (name) => {
    const path = join(skillDir, name);
    if (!existsSync(path)) {
      throw new CommandError(2, `Error: cannot read ${path}: the skill folder is not complete`);
    }
    return readFileSync(path, 'utf8');
  };
  return {
    template: read('template.html'),
    tokensCss: read('tokens.css'),
    fontsCss: read('assets/fonts.css'),
    license: read('assets/OFL.txt'),
  };
}

/**
 * Gives the build time from `SOURCE_DATE_EPOCH`, or the current time.
 *
 * @param {Record<string, string | undefined>} env Environment variables.
 * @returns {string} Time in ISO 8601 form.
 */
function buildTime(env) {
  const epoch = env.SOURCE_DATE_EPOCH;
  if (epoch && /^\d+$/.test(epoch)) return new Date(Number(epoch) * 1000).toISOString();
  return new Date().toISOString();
}

/**
 * Runs the command line.
 *
 * @param {string[]} args Arguments after the script name.
 * @param {MainIo} io Folders, environment, and output streams.
 * @returns {0 | 1 | 2 | 3} The exit code.
 * @example
 * process.exitCode = main(process.argv.slice(2), { cwd: process.cwd(), ... });
 */
export function main(args, io) {
  try {
    const { help, draftPath, blind, gradePath } = parseArgs(args);
    if (help) {
      io.stdout(USAGE);
      return 0;
    }
    const draft = readJsonFile(draftPath, io.cwd);
    stopOnErrors(validateDraft(draft), draftPath);
    const validDraft = /** @type {QuizDraft} */ (draft);
    const outFolder = dirname(draftPath);

    if (blind) {
      const outPath = join(outFolder, 'quiz.blind.json');
      const blindJson = JSON.stringify(blindQuiz(validDraft), null, 2);
      writeFileSync(resolve(io.cwd, outPath), `${blindJson}\n`);
      io.stdout(`${outPath}\n`);
      return 0;
    }

    if (gradePath) {
      const file = readJsonFile(gradePath, io.cwd);
      stopOnErrors(validateAnswers(file, validDraft.questions.length), gradePath);
      const report = gradeAnswers(validDraft, /** @type {{ answers: SubAgentAnswer[] }} */ (file));
      io.stdout(`${JSON.stringify(report, null, 2)}\n`);
      return report.passed ? 0 : 3;
    }

    const quiz = buildQuiz(validDraft, {
      createdAt: buildTime(io.env),
      gitFacts: readGitFacts(gitRunnerFor(io.cwd)),
    });
    const page = renderPage(quiz, readPageParts(io.skillDir));
    const outPath = join(outFolder, 'index.html');
    writeFileSync(resolve(io.cwd, outPath), page);
    io.stdout(`${outPath}\n`);
    return 0;
  } catch (error) {
    if (error instanceof CommandError) {
      io.stderr(`${error.message}\n${error.showUsage ? `\n${USAGE}` : ''}`);
      return error.code;
    }
    throw error;
  }
}

/**
 * Tells if Node.js started this file as the main script.
 *
 * Node.js loads a module by its real path, so the check also works when the skill folder is a
 * symlink.
 *
 * @returns {boolean} True when `node build.mjs` runs this file.
 */
function isMainScript() {
  const script = process.argv[1];
  if (!script || !existsSync(script)) return false;
  return import.meta.url === pathToFileURL(realpathSync(script)).href;
}

if (isMainScript()) {
  process.exitCode = main(process.argv.slice(2), {
    cwd: process.cwd(),
    env: process.env,
    skillDir: dirname(fileURLToPath(import.meta.url)),
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  });
}
