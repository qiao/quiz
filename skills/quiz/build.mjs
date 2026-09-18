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
 * @typedef {1 | 2 | 3 | 4} Tier
 *
 * @typedef {object} DraftCitation
 * @property {string} target File path from the repository root, chapter, or URL.
 * @property {number} [lineStart] First line of the cited range.
 * @property {number} [lineEnd] Last line of the cited range.
 * @property {number} [page] Page number for a PDF.
 *
 * @typedef {object} WrongChoice
 * @property {string} text Choice text in Markdown.
 * @property {string} rationale Reason that the choice is wrong, in Markdown.
 *
 * @typedef {object} DraftQuestion
 * @property {Tier} tier Difficulty tier.
 * @property {string} prompt Question text in Markdown.
 * @property {string} answer Text of the correct choice in Markdown.
 * @property {WrongChoice} obviousWrong Wrong choice that basic domain knowledge rules out.
 * @property {WrongChoice[]} plausibleWrong Exactly 2 wrong choices that model real mistakes.
 * @property {string} explanation Reason that the correct choice is correct.
 * @property {DraftCitation} citation Source of the answer.
 *
 * @typedef {object} Choice
 * @property {string} field Draft field of the choice, for example `plausibleWrong[1]`.
 * @property {ChoiceKind} kind Role of the choice.
 * @property {string} text Choice text in Markdown.
 * @property {string} [rationale] Reason that a wrong choice is wrong.
 *
 * @typedef {object} QuizDraft
 * @property {string} title Title of the quiz.
 * @property {string} slug Folder name of the quiz.
 * @property {string} source Resource that the quiz covers.
 * @property {DraftQuestion[]} questions Questions in tier order.
 */

/**
 * Pattern that a slug must match. The slug names the quiz folder and starts the quiz id in the
 * storage key, so it holds only lower-case letters, digits, and single hyphens. The build writes
 * next to the draft path that the command line gives, so this pattern does not limit where the
 * build writes.
 */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Names of the tiers, in tier order. */
export const TIER_NAMES = ['Fundamentals', 'Core', 'Advanced', 'Expert'];

/** Letters that name the choice positions on a slide. */
export const CHOICE_LETTERS = /** @type {const} */ (['a', 'b', 'c', 'd']);

/** Largest length of the correct choice, as a multiple of the longest wrong choice. */
const MAX_CORRECT_LENGTH_RATIO = 1.2;

const QUIZ_FIELDS = ['title', 'slug', 'source', 'questions'];
const QUESTION_FIELDS = [
  'tier',
  'prompt',
  'answer',
  'obviousWrong',
  'plausibleWrong',
  'explanation',
  'citation',
];
const WRONG_CHOICE_FIELDS = ['text', 'rationale'];
const CITATION_FIELDS = ['target', 'lineStart', 'lineEnd', 'page'];

/**
 * Lists the 4 choices of a valid question: the answer, the obvious wrong choice, and the 2
 * plausible wrong choices, in that order.
 *
 * @param {DraftQuestion} question Valid question.
 * @returns {Choice[]} The choices, each with its draft field and its kind.
 */
function choicesOf(question) {
  return [
    { field: 'answer', kind: 'correct', text: question.answer },
    { field: 'obviousWrong', kind: 'obvious-wrong', ...question.obviousWrong },
    ...question.plausibleWrong.map((choice, index) => ({
      field: `plausibleWrong[${index}]`,
      kind: /** @type {ChoiceKind} */ ('plausible-wrong'),
      ...choice,
    })),
  ];
}

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
 * Joins values into an English list with a final "or", for example `'a', 'b', or 'c'`.
 *
 * @param {readonly (string | number)[]} values Values in order.
 * @param {(value: string | number) => string} [format] Text for one value.
 * @returns {string} The list.
 */
function oneOf(values, format = (value) => `'${value}'`) {
  const items = values.map(format);
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
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
 * Adds one error for each field that is not a string with text.
 *
 * @param {Record<string, unknown>} object Object to check.
 * @param {string[]} fields Field names that must hold text.
 * @param {string} label Start of each error message.
 * @param {string[]} errors List that receives the errors.
 * @param {string} [prefix] Text before each field name, for example `citation.`.
 */
function checkFilledStrings(object, fields, label, errors, prefix = '') {
  for (const field of fields) {
    if (!isFilledString(object[field])) {
      errors.push(`${label}: '${prefix}${field}' must be a string that is not empty`);
    }
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
  checkFilledStrings(citation, ['target'], label, errors, 'citation.');
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
 * A learner who picks the longest choice must not find the answer.
 *
 * @param {string[]} texts The 4 choice texts, the correct choice first.
 * @param {string} label Start of each error message.
 * @param {string[]} errors List that receives the errors.
 * @returns {ChoiceLengths} The trimmed lengths of the answer and of the longest wrong choice.
 */
function checkChoiceLengths(texts, label, errors) {
  const [answer, ...wrongLengths] = texts.map((text) => text.trim().length);
  const longestWrong = Math.max(...wrongLengths);
  if (answer > longestWrong * MAX_CORRECT_LENGTH_RATIO) {
    errors.push(
      `${label}: the correct choice has ${answer} characters, and the longest wrong ` +
        `choice has ${longestWrong}. Make the lengths closer, so that the length does not show ` +
        'the answer',
    );
  }
  return { answer, longestWrong };
}

/**
 * @typedef {object} ChoiceLengths
 * @property {number} answer Trimmed length of the correct choice.
 * @property {number} longestWrong Trimmed length of the longest wrong choice.
 *
 * @typedef {ChoiceLengths & { question: number }} LongAnswer
 */

/**
 * Rejects a quiz where the correct choice is the longest choice too often.
 *
 * A learner who always picks the longest choice must not do better than a random guess, so the
 * limit is a quarter of the questions. The error gives the lengths, smallest gap first, so that
 * the agent can choose the smallest edits without a count of its own.
 *
 * @param {LongAnswer[]} longAnswers The questions where the correct choice is longer than every
 *   wrong choice, in question order.
 * @param {number} questionCount Number of questions in the quiz.
 * @param {string[]} errors List that receives the errors.
 */
function checkLongestCorrectCount(longAnswers, questionCount, errors) {
  const limit = Math.ceil(questionCount / CHOICE_LETTERS.length);
  const excess = longAnswers.length - limit;
  if (excess <= 0) return;
  const gap = (/** @type {LongAnswer} */ item) => item.answer - item.longestWrong;
  const items = [...longAnswers]
    .sort((first, second) => gap(first) - gap(second) || first.question - second.question)
    .map((item) => `${item.question} (${item.answer} vs ${item.longestWrong})`);
  errors.push(
    `Quiz: the correct choice is the longest choice in ${longAnswers.length} questions, and the ` +
      `limit is ${limit}. Make a wrong choice longer than the correct choice in ${excess} or ` +
      'more of these questions. Each item gives the question, the length of the correct ' +
      'choice, and the length of the longest wrong choice, smallest gap first: ' +
      items.join(', '),
  );
}

/**
 * Checks the answer and the 3 wrong choices of one question.
 *
 * @param {Record<string, unknown>} question Question to check.
 * @param {string} label Start of each error message.
 * @param {string[]} errors List that receives the errors.
 * @returns {ChoiceLengths | null} The choice lengths, or null when a choice text is missing.
 */
function checkChoices(question, label, errors) {
  checkFilledStrings(question, ['answer'], label, errors);
  /** @type {[string, unknown][]} */
  const texts = [['answer', question.answer]];

  /** @type {[string, unknown][]} */
  const wrongChoices = [['obviousWrong', question.obviousWrong]];
  const { plausibleWrong } = question;
  if (Array.isArray(plausibleWrong) && plausibleWrong.length === 2) {
    plausibleWrong.forEach((choice, index) => {
      wrongChoices.push([`plausibleWrong[${index}]`, choice]);
    });
  } else {
    const found = Array.isArray(plausibleWrong)
      ? `${plausibleWrong.length} ${plausibleWrong.length === 1 ? 'item' : 'items'}`
      : 'no array';
    errors.push(`${label}: 'plausibleWrong' must be an array of 2 choices, found ${found}`);
  }
  for (const [field, choice] of wrongChoices) {
    if (!isObject(choice)) {
      errors.push(`${label}: '${field}' must be an object with 'text' and 'rationale'`);
      continue;
    }
    checkUnknownFields(choice, WRONG_CHOICE_FIELDS, label, errors, `${field}.`);
    checkFilledStrings(choice, WRONG_CHOICE_FIELDS, label, errors, `${field}.`);
    texts.push([`${field}.text`, choice.text]);
  }

  // The text checks need all 4 texts.
  if (texts.length !== 4 || !texts.every(([, text]) => isFilledString(text))) return null;
  /** @type {Map<string, string>} */
  const seen = new Map();
  for (const [field, text] of texts) {
    const key = String(text).trim();
    const first = seen.get(key);
    if (first) errors.push(`${label}: '${first}' and '${field}' have the same text`);
    else seen.set(key, field);
  }
  return checkChoiceLengths(texts.map(([, text]) => String(text)), label, errors);
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
  checkFilledStrings(draft, ['title', 'source'], 'Quiz', errors);
  if (typeof draft.slug !== 'string' || !SLUG_PATTERN.test(draft.slug)) {
    errors.push(`Quiz: 'slug' must match ${SLUG_PATTERN.source}, found '${draft.slug}'`);
  }
  if (!Array.isArray(draft.questions) || draft.questions.length === 0) {
    errors.push("Quiz: 'questions' must be an array with at least one question");
    return errors;
  }

  const tierSizes = [0, 0, 0, 0];
  /** @type {LongAnswer[]} */
  const longAnswers = [];
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
      const tiers = oneOf([1, 2, 3, 4], String);
      errors.push(`${label}: 'tier' must be ${tiers}, found ${JSON.stringify(tier)}`);
    }

    checkFilledStrings(question, ['prompt', 'explanation'], label, errors);
    const lengths = checkChoices(question, label, errors);
    if (lengths && lengths.answer > lengths.longestWrong) {
      longAnswers.push({ question: index + 1, ...lengths });
    }
    checkCitation(question.citation, label, errors);
  });

  if (Math.max(...tierSizes) - Math.min(...tierSizes) > 1) {
    errors.push(
      `Quiz: tier sizes must differ by at most 1 question, found ${tierSizes.join(', ')}`,
    );
  }
  checkLongestCorrectCount(longAnswers, draft.questions.length, errors);
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
function escapeHtml(text) {
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
 * emphasis. The function escapes every other character, so raw HTML in the draft shows as text.
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

  /**
   * Moves past the lines that pass a test, from the current line.
   *
   * @param {(line: string) => boolean} test Test for one line.
   * @returns {string[]} The lines that passed, in order.
   */
  const takeWhile = (test) => {
    const start = index;
    while (index < lines.length && test(lines[index])) index += 1;
    return lines.slice(start, index);
  };

  while (index < lines.length) {
    const line = lines[index];
    const fence = FENCE_START.exec(line);
    if (fence) {
      index += 1;
      const code = takeWhile((next) => !FENCE_END.test(next));
      index += 1;
      const language = fence[1] ? ` data-lang="${escapeHtml(fence[1])}"` : '';
      blocks.push(`<pre${language}><code>${escapeHtml(code.join('\n'))}</code></pre>`);
    } else if (line.trim() === '') {
      index += 1;
    } else if (LIST_ITEM.test(line)) {
      const items = takeWhile((next) => LIST_ITEM.test(next));
      const html = items.map((item) => `<li>${renderInline(item.replace(LIST_ITEM, ''))}</li>`);
      blocks.push(`<ul>${html.join('')}</ul>`);
    } else {
      const paragraph = takeWhile(
        (next) => next.trim() !== '' && !FENCE_START.test(next) && !LIST_ITEM.test(next),
      );
      blocks.push(`<p>${renderInline(paragraph.map((part) => part.trim()).join(' '))}</p>`);
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
 * @typedef {typeof CHOICE_LETTERS[number]} ChoiceLetter
 *
 * @typedef {object} PlacedChoice
 * @property {ChoiceLetter} letter Letter of the position on the page.
 * @property {Choice} choice Choice from the draft, with its field and its kind.
 */

/**
 * Places the choices of each question on the page.
 *
 * The correct choice goes to each of the 4 positions an equal number of times, and the remainder
 * goes to the earlier positions. The wrong choices fill the open positions in a random order. The
 * seed is the quiz id, so the blind copy, the grade, and the page all use the same placement.
 *
 * @param {QuizDraft} draft Valid draft.
 * @returns {PlacedChoice[][]} For each question, its choices in page order.
 * @example
 * placeChoices(draft)[0][0]; // { letter: 'a', choice: { field: 'plausibleWrong[1]', ... } }
 */
export function placeChoices(draft) {
  const random = createRandom(quizIdOf(draft));
  const correctSlots = draft.questions.map((_, index) => index % CHOICE_LETTERS.length);
  shuffleInPlace(correctSlots, random);

  return draft.questions.map((question, questionIndex) => {
    const choices = choicesOf(question);
    // Index 0 is the answer, so only the wrong choices shuffle.
    const order = [1, 2, 3];
    shuffleInPlace(order, random);
    order.splice(correctSlots[questionIndex], 0, 0);
    return order.map((index, slot) => ({ letter: CHOICE_LETTERS[slot], choice: choices[index] }));
  });
}

/**
 *
 * @typedef {object} BlindQuestion
 * @property {number} id Question number, from 1.
 * @property {Tier} tier Difficulty tier.
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
 * @property {string} [reason] Reason that the question is ambiguous.
 *
 * @typedef {object} GradeFailure
 * @property {number} questionId Question number, from 1.
 * @property {Tier} tier Difficulty tier.
 * @property {string} reason Description of what the checker did.
 *
 * @typedef {object} GradeReport
 * @property {boolean} passed Flag that is true when every question passed.
 * @property {number} totalQuestions Number of questions in the draft.
 * @property {number} passedCount Number of questions that passed.
 * @property {GradeFailure[]} failures One item for each question that failed.
 * @property {string} [page] Path of the `index.html` that the command wrote, only when every
 *   question passed.
 */

/**
 * Makes the copy of the quiz that the blind checker reads.
 *
 * @param {QuizDraft} draft Valid draft.
 * @returns {BlindQuiz} The quiz with no `kind`, `rationale`, or `explanation`, and with the choices
 *   in page order.
 */
export function blindQuiz(draft) {
  const placed = placeChoices(draft);
  return {
    title: draft.title,
    slug: draft.slug,
    source: draft.source,
    questions: draft.questions.map((question, index) => ({
      id: index + 1,
      tier: question.tier,
      prompt: question.prompt,
      choices: placed[index].map(({ letter, choice }) => ({ id: letter, text: choice.text })),
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
    const choices = [...CHOICE_LETTERS, 'ambiguous'];
    if (!choices.includes(String(choice))) {
      errors.push(`${label}: 'choice' must be ${oneOf(choices)}, found '${choice}'`);
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
  const placed = placeChoices(draft);
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
      const choices = placed[index];
      const chosen = /** @type {PlacedChoice} */ (
        choices.find((item) => item.letter === answer.choice)
      );
      const correct = /** @type {PlacedChoice} */ (
        choices.find((item) => item.choice.kind === 'correct')
      );
      if (chosen !== correct) {
        const note = answer.reason ? ` The checker said: ${answer.reason}` : '';
        fail(
          `The checker chose ${answer.choice}, which is '${chosen.choice.field}': ` +
            `"${chosen.choice.text}". The correct choice is ${correct.letter}.${note}`,
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
 * @property {string} webUrl Web address of the GitHub repository.
 * @property {Set<string>} linkable Cited paths that git tracks and that have no uncommitted change.
 */

/**
 * Makes a git runner for a folder.
 *
 * @param {string} folder Folder where git runs.
 * @returns {GitRunner} A runner that returns the standard output with no trailing newline, or null
 *   when git fails.
 */
function gitRunnerFor(folder) {
  return (args) => {
    try {
      const output = execFileSync('git', ['-C', folder, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      // Only the end is trimmed: a status entry such as " M file" starts with a space.
      return output.trimEnd();
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
 * Tells if a citation target is a web address.
 *
 * @param {string} target Citation target.
 * @returns {boolean} True for an `http` or `https` URL.
 */
function isUrl(target) {
  return /^https?:\/\//.test(target);
}

/**
 * Gives the path of a cited file from the repository root.
 *
 * @param {string} target Citation target that is not a URL.
 * @returns {string} The path with no leading `./`.
 */
function repoPath(target) {
  return target.replace(/^\.\//, '');
}

/**
 * Reads the paths in the `-z` output of `git status --porcelain`.
 *
 * @param {string} output Entries that end with a NUL character.
 * @returns {string[]} Every path in the output, including the old path of a rename or a copy.
 */
function changedPaths(output) {
  return output
    .split('\0')
    .filter(Boolean)
    .map((entry) => (/^[ A-Z?!]{2} /.test(entry) ? entry.slice(3) : entry));
}

/**
 * Reads the git facts that permalinks need.
 *
 * The number of git processes does not grow with the number of citations. The function stops at
 * the first fact that makes a link impossible.
 *
 * @param {GitRunner} git Runner for the folder where the build runs.
 * @param {string[]} paths Cited file paths from the repository root.
 * @returns {GitFacts | null} The facts, or null when no citation can get a link: no cited file, no
 *   git repository, no GitHub remote, or `HEAD` on no remote-tracking branch.
 */
export function readGitFacts(git, paths) {
  if (paths.length === 0) return null;
  const [root, commit] = (git(['rev-parse', '--show-toplevel', 'HEAD']) ?? '').split('\n');
  if (!root || !commit) return null;
  const remote = git(['remote', 'get-url', 'origin']);
  const webUrl = remote ? githubWebUrl(remote) : null;
  if (!webUrl) return null;
  // No output means that a remote-tracking branch holds HEAD.
  if (git(['rev-list', '-n1', 'HEAD', '--not', '--remotes']) !== '') return null;

  const inRoot = (/** @type {string[]} */ args) => git(['-C', root, ...args]);
  const tracked = inRoot(['ls-files', '-z', '--', ...paths]);
  const status = inRoot(['status', '--porcelain', '-z', '--untracked-files=no', '--', ...paths]);
  if (tracked === null || status === null) return null;
  const changed = new Set(changedPaths(status));
  const linkable = tracked.split('\0').filter((path) => path && !changed.has(path));
  return { commit, webUrl, linkable: new Set(linkable) };
}

/**
 * Adds a link to a citation when a reader can open the cited source.
 *
 * A URL target links to itself. A file links to a GitHub permalink only when the file is tracked,
 * has no uncommitted change, and `HEAD` is on a remote-tracking branch. In every other case the
 * citation stays plain text, so a link never points to the wrong lines.
 *
 * @param {DraftCitation} citation Citation from the draft.
 * @param {GitFacts | null} facts Git facts, or null when no file can get a link.
 * @returns {BuiltCitation} The citation, with `url` when a link is safe.
 */
export function resolveCitation(citation, facts) {
  if (isUrl(citation.target)) return { ...citation, url: citation.target };
  const path = repoPath(citation.target);
  if (!facts || !facts.linkable.has(path)) return { ...citation };

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
 * @property {Tier} tier Difficulty tier.
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
  const placed = placeChoices(draft);
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
      choices: placed[index].map(({ letter, choice }) => {
        /** @type {BuiltChoice} */
        const built = { id: letter, textHtml: renderMarkdown(choice.text), kind: choice.kind };
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
 * Writes the self-contained page for a built quiz.
 *
 * The quiz data goes into a JSON script tag. Each `<` becomes `\u003c`, so the data cannot close
 * the tag or open a comment, and `JSON.parse` still reads it. The function fills every placeholder
 * in one pass, so a value that holds placeholder text stays as text.
 *
 * @param {BuiltQuiz} quiz Built quiz.
 * @param {PageParts} parts Template and assets.
 * @returns {string} The complete HTML page.
 * @throws {Error} When the template does not hold each placeholder exactly once.
 */
export function renderPage(quiz, parts) {
  /** @type {Record<string, string>} */
  const values = {
    '{{TITLE}}': escapeHtml(quiz.title),
    '/*{{TOKENS_CSS}}*/': parts.tokensCss.trim(),
    '/*{{FONTS_CSS}}*/': parts.fontsCss.trim(),
    '<!--{{LICENSE}}-->': `<!--\n${parts.license.trim().replaceAll('-->', '-- >')}\n-->`,
    '{{QUIZ_DATA}}': JSON.stringify(quiz).replace(/</g, '\\u003c'),
  };
  const placeholders = Object.keys(values);
  for (const placeholder of placeholders) {
    const found = parts.template.split(placeholder).length - 1;
    if (found !== 1) {
      throw new Error(`template.html must hold ${placeholder} exactly once, found ${found}`);
    }
  }
  const escaped = placeholders.map((placeholder) => placeholder.replace(/[{}*/]/g, '\\$&'));
  const pattern = new RegExp(escaped.join('|'), 'g');
  return parts.template.replace(pattern, (placeholder) => values[placeholder]);
}

const USAGE = `Usage:
  node <skill-dir>/build.mjs <quiz.json>
      Write index.html next to the draft.
  node <skill-dir>/build.mjs <quiz.json> --blind
      Write quiz.blind.json for the blind checker.
  node <skill-dir>/build.mjs <quiz.json> --grade <answers.json>
      Print a grade report as JSON. When every question passed, also write index.html next to
      the draft, and give its path in the "page" field of the report.

Run the command from the project folder. Relative paths start from that folder.

Exit codes:
  0  The command worked.
  1  The draft or the answer file is not valid.
  2  The command line has a mistake, or a file cannot be read.
  3  --grade found at least one failed question.
`;

/**
 * @typedef {object} MainIo
 * @property {string} cwd Folder that relative paths start from.
 * @property {Record<string, string | undefined>} env Environment variables.
 * @property {string} skillDir Folder that holds `template.html` and the assets.
 * @property {(text: string) => void} stdout Function that writes to standard output.
 * @property {(text: string) => void} stderr Function that writes to standard error.
 *
 * @typedef {{ kind: 'help' }
 *   | { kind: 'build' | 'blind', draftPath: string }
 *   | { kind: 'grade', draftPath: string, answersPath: string }} Command
 */

/** Error that stops the command with a given exit code and message. */
class CommandError extends Error {
  /**
   * Makes an error for the command line.
   *
   * @param {1 | 2} code Exit code.
   * @param {string} message Text for standard error.
   */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Makes the error for a mistake in the command line arguments.
 *
 * @param {string} message Text for standard error.
 * @returns {CommandError} An error with code 2 whose message ends with the usage text.
 */
function usageError(message) {
  return new CommandError(2, `${message}\n\n${USAGE.trimEnd()}`);
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
 * Reads a JSON file for the command line.
 *
 * @param {string} path Path as the user wrote it.
 * @param {string} cwd Folder that a relative path starts from.
 * @returns {unknown} The parsed value.
 * @throws {CommandError} With code 2 when the file cannot be read, or code 1 when it is not JSON.
 */
function readJsonFile(path, cwd) {
  const fullPath = resolve(cwd, path);
  if (!existsSync(fullPath)) {
    throw new CommandError(2, `Error: cannot read ${path}: the file does not exist`);
  }
  let text;
  try {
    text = readFileSync(fullPath, 'utf8');
  } catch (error) {
    const reason = /** @type {NodeJS.ErrnoException} */ (error).code ?? String(error);
    throw new CommandError(2, `Error: cannot read ${path}: ${reason}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    stopOnErrors([`The file is not valid JSON: ${/** @type {Error} */ (error).message}`], path);
  }
}

/**
 * Reads the command line arguments.
 *
 * @param {string[]} args Arguments after the script name.
 * @returns {Command} The command to run.
 * @throws {CommandError} With code 2 for a mistake in the arguments.
 */
function parseArgs(args) {
  /** @type {string[]} */
  const paths = [];
  let blind = false;
  /** @type {string | null} */
  let answersPath = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') return { kind: 'help' };
    if (arg === '--blind') {
      blind = true;
    } else if (arg === '--grade') {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        throw usageError('Error: --grade needs the path to answers.json');
      }
      answersPath = next;
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
  if (blind && answersPath) throw usageError('Error: use --blind or --grade, not both');
  const draftPath = paths[0];
  if (answersPath) return { kind: 'grade', draftPath, answersPath };
  return { kind: blind ? 'blind' : 'build', draftPath };
}

/**
 * Reads the template and the assets from the skill folder.
 *
 * @param {string} skillDir Folder of the skill.
 * @returns {PageParts} The page parts.
 * @throws {CommandError} With code 2 when a file is missing, because the skill is not complete.
 */
function readPageParts(skillDir) {
  /**
   * Reads one file from the skill folder.
   *
   * @param {string} name File name in the skill folder.
   * @returns {string} The file content.
   */
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
 * Makes the page for a valid draft.
 *
 * @param {QuizDraft} draft Valid draft.
 * @param {MainIo} io Folders and environment.
 * @returns {string} The complete HTML page.
 * @throws {CommandError} With code 2 when the template or an asset is not usable.
 */
function makePage(draft, io) {
  const targets = draft.questions.map((question) => question.citation.target);
  const paths = [...new Set(targets.filter((target) => !isUrl(target)).map(repoPath))];
  const quiz = buildQuiz(draft, {
    createdAt: buildTime(io.env),
    gitFacts: readGitFacts(gitRunnerFor(io.cwd), paths),
  });
  const parts = readPageParts(io.skillDir);
  try {
    return renderPage(quiz, parts);
  } catch (error) {
    throw new CommandError(2, `Error: ${/** @type {Error} */ (error).message}`);
  }
}

/**
 * Writes an output file next to the draft.
 *
 * @param {string} draftPath Path of the draft as the user wrote it.
 * @param {string} name File name of the output.
 * @param {string} content File content.
 * @param {MainIo} io Folders and environment.
 * @returns {string} Path of the output, in the same form as the draft path.
 */
function writeOutput(draftPath, name, content, io) {
  const outPath = join(dirname(draftPath), name);
  writeFileSync(resolve(io.cwd, outPath), content);
  return outPath;
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
    const command = parseArgs(args);
    if (command.kind === 'help') {
      io.stdout(USAGE);
      return 0;
    }
    const draft = readJsonFile(command.draftPath, io.cwd);
    stopOnErrors(validateDraft(draft), command.draftPath);
    const validDraft = /** @type {QuizDraft} */ (draft);

    if (command.kind === 'grade') {
      const file = readJsonFile(command.answersPath, io.cwd);
      stopOnErrors(validateAnswers(file, validDraft.questions.length), command.answersPath);
      const report = gradeAnswers(validDraft, /** @type {{ answers: SubAgentAnswer[] }} */ (file));
      // A passed grade is always followed by the build, so the same command writes the page.
      if (report.passed) {
        report.page = writeOutput(command.draftPath, 'index.html', makePage(validDraft, io), io);
      }
      io.stdout(`${JSON.stringify(report, null, 2)}\n`);
      return report.passed ? 0 : 3;
    }

    const [name, content] = command.kind === 'blind'
      ? ['quiz.blind.json', `${JSON.stringify(blindQuiz(validDraft), null, 2)}\n`]
      : ['index.html', makePage(validDraft, io)];
    io.stdout(`${writeOutput(command.draftPath, name, content, io)}\n`);
    return 0;
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    io.stderr(`${error.message}\n`);
    return error.code;
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
