// @ts-check
/**
 * Compiles a quiz draft into one self-contained HTML slide page.
 *
 * The agent writes only the draft. This script checks the draft, derives every other field, and
 * writes the page. Section 3 of `docs/architecture.md` specifies the command line.
 */

import { createHash } from 'node:crypto';

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
