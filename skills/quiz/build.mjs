// @ts-check
/**
 * Compiles a quiz draft into one self-contained HTML slide page.
 *
 * The agent writes only the draft. This script checks the draft, derives every other field, and
 * writes the page. Section 3 of `docs/architecture.md` specifies the command line.
 */

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
const COUNT_WORDS = ['0', '1', '2'];

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
        `${label}: expected exactly ${COUNT_WORDS[expected]} '${kind}' ${noun}, ` +
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
