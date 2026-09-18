// @ts-check
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import {
  blindQuiz,
  buildQuiz,
  githubWebUrl,
  gradeAnswers,
  main,
  placeChoices,
  quizIdOf,
  readGitFacts,
  renderMarkdown,
  renderPage,
  resolveCitation,
  validateAnswers,
  validateDraft,
} from '../skills/quiz/build.mjs';

const FIXTURE_URL = new URL('./fixtures/valid-draft.json', import.meta.url);

/** @type {string[]} Temporary folders that the tests made, which the suite removes at the end. */
const tempFolders = [];
after(() => {
  for (const folder of tempFolders) rmSync(folder, { recursive: true, force: true });
});

/**
 * Makes a temporary folder that the suite removes at the end.
 *
 * @param {string} prefix Start of the folder name.
 * @returns {string} The folder path.
 */
function tempFolder(prefix) {
  const folder = mkdtempSync(join(tmpdir(), prefix));
  tempFolders.push(folder);
  return folder;
}

/**
 * Loads a fresh copy of the valid draft fixture.
 *
 * @returns {any} A draft that a test can change.
 */
function loadDraft() {
  return JSON.parse(readFileSync(FIXTURE_URL, 'utf8'));
}

/**
 * Sets the text of each correct choice, so that it is the longest choice only in given questions.
 *
 * @param {any} draft Valid draft.
 * @param {number[]} longest Numbers of the questions where the correct choice is the longest.
 */
function setLongestCorrect(draft, longest) {
  draft.questions.forEach((/** @type {any} */ question, /** @type {number} */ index) => {
    const wrong = [question.obviousWrong, ...question.plausibleWrong];
    const length = Math.max(...wrong.map((choice) => choice.text.length));
    question.answer = 'x'.repeat(longest.includes(index + 1) ? length + 1 : length - 1);
  });
}

describe('validateDraft', () => {
  it('accepts the valid fixture', () => {
    assert.deepEqual(validateDraft(loadDraft()), []);
  });

  it('rejects a draft that is not an object', () => {
    assert.deepEqual(validateDraft([]), ['Quiz: the draft must be a JSON object']);
  });

  it('rejects an empty title and an unknown field', () => {
    const draft = loadDraft();
    draft.title = ' ';
    draft.titel = 'typo';
    assert.deepEqual(validateDraft(draft), [
      "Quiz: unknown field 'titel'",
      "Quiz: 'title' must be a string that is not empty",
    ]);
  });

  it('rejects a slug that is not a kebab-case name', () => {
    const draft = loadDraft();
    draft.slug = '../../etc';
    assert.deepEqual(validateDraft(draft), [
      "Quiz: 'slug' must match ^[a-z0-9]+(-[a-z0-9]+)*$, found '../../etc'",
    ]);
  });

  it('rejects a draft with no questions', () => {
    const draft = loadDraft();
    draft.questions = [];
    assert.deepEqual(validateDraft(draft), [
      "Quiz: 'questions' must be an array with at least one question",
    ]);
  });

  it('rejects a tier that is not 1 to 4', () => {
    const draft = loadDraft();
    draft.questions[7].tier = 5;
    assert.ok(validateDraft(draft).includes("Question 8: 'tier' must be 1, 2, 3, or 4, found 5"));
  });

  it('rejects a tier that goes down', () => {
    const draft = loadDraft();
    [draft.questions[1], draft.questions[2]] = [draft.questions[2], draft.questions[1]];
    assert.deepEqual(validateDraft(draft), [
      'Question 3: tier 1 comes after tier 2, but the tier must not go down',
    ]);
  });

  it('accepts tier sizes that differ by 1, and rejects a bigger difference', () => {
    const draft = loadDraft();
    draft.questions.splice(7, 1);
    assert.deepEqual(validateDraft(draft), []);
    draft.questions.splice(6, 1);
    assert.deepEqual(validateDraft(draft), [
      'Quiz: tier sizes must differ by at most 1 question, found 2, 2, 2, 0',
    ]);
  });

  it('rejects empty text fields', () => {
    const draft = loadDraft();
    draft.questions[0].prompt = '';
    draft.questions[0].explanation = '';
    draft.questions[0].answer = '';
    draft.questions[0].citation.target = '';
    assert.deepEqual(validateDraft(draft), [
      "Question 1: 'prompt' must be a string that is not empty",
      "Question 1: 'explanation' must be a string that is not empty",
      "Question 1: 'answer' must be a string that is not empty",
      "Question 1: 'citation.target' must be a string that is not empty",
    ]);
  });

  it('rejects a question with 1 plausible wrong choice', () => {
    const draft = loadDraft();
    draft.questions[0].plausibleWrong.pop();
    assert.deepEqual(validateDraft(draft), [
      "Question 1: 'plausibleWrong' must be an array of 2 choices, found 1 item",
    ]);
  });

  it('rejects the old choices list with kinds', () => {
    const draft = loadDraft();
    const question = draft.questions[0];
    question.choices = [{ text: question.answer, kind: 'correct' }];
    delete question.answer;
    assert.deepEqual(validateDraft(draft), [
      "Question 1: unknown field 'choices'",
      "Question 1: 'answer' must be a string that is not empty",
    ]);
  });

  it('rejects a missing rationale and an unknown field on a wrong choice', () => {
    const draft = loadDraft();
    delete draft.questions[6].obviousWrong.rationale;
    draft.questions[6].plausibleWrong[1].kind = 'plausible-wrong';
    assert.deepEqual(validateDraft(draft), [
      "Question 7: 'obviousWrong.rationale' must be a string that is not empty",
      "Question 7: unknown field 'plausibleWrong[1].kind'",
    ]);
  });

  it('rejects a correct choice that is more than 20% longer than every wrong choice', () => {
    const draft = loadDraft();
    const question = draft.questions[1];
    question.answer = 'In the task queue, until the call stack is empty';
    question.obviousWrong.text = 'In the browser address bar';
    question.plausibleWrong[0].text = 'In the microtask queue';
    question.plausibleWrong[1].text = 'On the call stack, below';
    assert.deepEqual(validateDraft(draft), [
      'Question 2: the correct choice has 48 characters, and the longest wrong choice has 26. ' +
        'Make the lengths closer, so that the length does not show the answer',
    ]);
    question.obviousWrong.text = 'In the browser address bar, next to the URL';
    assert.deepEqual(validateDraft(draft), []);
  });

  it('rejects a correct choice that is the longest in over a quarter of questions', () => {
    const draft = loadDraft();
    setLongestCorrect(draft, [2, 5]);
    assert.deepEqual(validateDraft(draft), []);
    setLongestCorrect(draft, [2, 5, 7]);
    assert.deepEqual(validateDraft(draft), [
      'Quiz: the correct choice is the longest choice in 3 questions (2, 5, 7), and the limit ' +
        'is 2. Make a wrong choice longer than the correct choice in 1 or more of these questions',
    ]);
  });

  it('reports a wrong choice that is not an object and does not throw', () => {
    const draft = loadDraft();
    draft.questions[0].obviousWrong = null;
    draft.questions[0].plausibleWrong[0] = 'Only text';
    assert.deepEqual(validateDraft(draft), [
      "Question 1: 'obviousWrong' must be an object with 'text' and 'rationale'",
      "Question 1: 'plausibleWrong[0]' must be an object with 'text' and 'rationale'",
    ]);
  });

  it('rejects two choices with the same text', () => {
    const draft = loadDraft();
    const question = draft.questions[1];
    question.plausibleWrong[1].text = question.plausibleWrong[0].text;
    question.obviousWrong.text = ` ${question.answer}`;
    assert.deepEqual(validateDraft(draft), [
      "Question 2: 'answer' and 'obviousWrong.text' have the same text",
      "Question 2: 'plausibleWrong[0].text' and 'plausibleWrong[1].text' have the same text",
    ]);
  });

  it('rejects bad line numbers and unknown citation fields', () => {
    const draft = loadDraft();
    draft.questions[2].citation = { target: 'src/a.ts', lineStart: 12, lineEnd: 10, line: 3 };
    draft.questions[3].citation = { target: 'book.pdf', page: 0 };
    assert.deepEqual(validateDraft(draft), [
      "Question 3: unknown field 'citation.line'",
      "Question 3: 'citation.lineEnd' (10) is less than 'citation.lineStart' (12)",
      "Question 4: 'citation.page' must be a whole number of 1 or more",
    ]);
  });
});

describe('renderMarkdown', () => {
  it('escapes HTML in text', () => {
    assert.equal(
      renderMarkdown('<script>alert(1)</script> and <img src=x onerror="go()">'),
      '<p>&lt;script&gt;alert(1)&lt;/script&gt; and &lt;img src=x onerror=&quot;go()&quot;&gt;</p>',
    );
  });

  it('renders inline code, strong, and emphasis', () => {
    assert.equal(
      renderMarkdown("Use `a<b>` with **care** and *thought*, and don't mind 2 * 3 * 4"),
      '<p>Use <code>a&lt;b&gt;</code> with <strong>care</strong> and <em>thought</em>, ' +
        'and don&#39;t mind 2 * 3 * 4</p>',
    );
  });

  it('keeps Markdown characters inside inline code', () => {
    assert.equal(renderMarkdown('`**not bold**`'), '<p><code>**not bold**</code></p>');
  });

  it('renders a fenced code block with its indent and escapes its content', () => {
    assert.equal(
      renderMarkdown('Look:\n\n```js\nif (a < b) {\n  end("</script>");\n}\n```\nAfter'),
      '<p>Look:</p><pre data-lang="js"><code>if (a &lt; b) {\n  end(&quot;&lt;/script&gt;&quot;);' +
        '\n}</code></pre><p>After</p>',
    );
  });

  it('renders the rest of the text as code when a fence has no end', () => {
    assert.equal(renderMarkdown('```\nx <y'), '<pre><code>x &lt;y</code></pre>');
  });

  it('renders paragraphs and lists', () => {
    assert.equal(
      renderMarkdown('One\nline\n\n- first `x`\n- second\n\nTwo'),
      '<p>One line</p><ul><li>first <code>x</code></li><li>second</li></ul><p>Two</p>',
    );
  });
});

/**
 * Makes a draft with a given number of questions, based on the first fixture question.
 *
 * @param {number} count Number of questions.
 * @param {string} [salt] Text that changes the content, and so the quiz id.
 * @returns {any} A draft with tiers in order.
 */
function makeDraft(count, salt = '') {
  const draft = loadDraft();
  const template = draft.questions[0];
  draft.questions = Array.from({ length: count }, (_, index) => ({
    ...structuredClone(template),
    tier: Math.floor((index * 4) / count) + 1,
    prompt: `Question ${index + 1} ${salt}`,
  }));
  return draft;
}

describe('quizIdOf', () => {
  it('joins the slug and 8 hex characters of the content hash', () => {
    assert.match(quizIdOf(loadDraft()), /^js-event-loop-[0-9a-f]{8}$/);
  });

  it('changes when a question changes', () => {
    const draft = loadDraft();
    const before = quizIdOf(draft);
    draft.questions[0].prompt += '?';
    assert.notEqual(quizIdOf(draft), before);
  });
});

/** Draft fields of the 4 choices, with the answer at index 0. */
const CHOICE_FIELDS = ['answer', 'obviousWrong', 'plausibleWrong[0]', 'plausibleWrong[1]'];

/**
 * Gives the index in `CHOICE_FIELDS` of each choice in page order, for each question.
 *
 * @param {any} draft Valid draft.
 * @returns {number[][]} The indices, where 0 is the answer.
 */
function orders(draft) {
  return placeChoices(draft).map((placed) =>
    placed.map((item) => CHOICE_FIELDS.indexOf(item.choice.field)),
  );
}

describe('placeChoices', () => {
  it('gives the same placement for the same draft', () => {
    assert.deepEqual(placeChoices(loadDraft()), placeChoices(loadDraft()));
  });

  it('places each of the 4 choices one time, under the letters a to d', () => {
    const draft = makeDraft(40);
    placeChoices(draft).forEach((placed, index) => {
      assert.deepEqual(placed.map((item) => item.letter), ['a', 'b', 'c', 'd']);
      assert.deepEqual(placed.map((item) => item.choice.field).sort(), [...CHOICE_FIELDS].sort());
      const question = draft.questions[index];
      const texts = [question.answer, question.obviousWrong.text];
      texts.push(...question.plausibleWrong.map((/** @type {any} */ choice) => choice.text));
      for (const item of placed) {
        assert.equal(item.choice.text, texts[CHOICE_FIELDS.indexOf(item.choice.field)]);
      }
    });
  });

  it('balances the correct position for each count from 1 to 40', () => {
    for (let count = 1; count <= 40; count += 1) {
      const draft = makeDraft(count);
      const slots = [0, 0, 0, 0];
      orders(draft).forEach((order) => {
        slots[order.indexOf(0)] += 1;
      });
      assert.ok(Math.max(...slots) - Math.min(...slots) <= 1, `count ${count}: ${slots}`);
    }
  });

  it('does not keep the draft order of the wrong choices', () => {
    const all = orders(makeDraft(40, 'wrong order'));
    const obviousSlots = new Set(all.map((order) => order.indexOf(1)));
    const inDraftOrder = all.filter((order) => {
      const wrong = order.filter((choice) => choice !== 0);
      return wrong.join() === '1,2,3';
    });
    assert.equal(obviousSlots.size, 4);
    assert.ok(inDraftOrder.length < all.length / 2, `${inDraftOrder.length} in draft order`);
  });
});

/**
 * Makes an answer file where the checker picks the correct choice of each question.
 *
 * @param {any} draft Valid draft.
 * @returns {any} An answer file with every answer correct.
 */
function correctAnswers(draft) {
  return {
    answers: placeChoices(draft).map((placed, index) => ({
      questionId: index + 1,
      choice: placed.find((item) => item.choice.kind === 'correct')?.letter,
    })),
  };
}

describe('blindQuiz', () => {
  it('removes every field that shows the answer', () => {
    const text = JSON.stringify(blindQuiz(loadDraft()));
    const fields = ['"kind"', '"rationale"', '"explanation"', '"answer"', 'Wrong"'];
    for (const field of fields) {
      assert.ok(!text.includes(field), `${field} is in the blind copy`);
    }
  });

  it('shows the choices in the same order as the page', () => {
    const draft = loadDraft();
    const blind = blindQuiz(draft);
    const placed = placeChoices(draft);
    blind.questions.forEach((question, index) => {
      assert.equal(question.id, index + 1);
      assert.equal(question.tier, draft.questions[index].tier);
      assert.deepEqual(
        question.choices.map((choice) => choice.text),
        placed[index].map((item) => item.choice.text),
      );
      assert.deepEqual(question.choices.map((choice) => choice.id), ['a', 'b', 'c', 'd']);
    });
  });
});

describe('validateAnswers', () => {
  it('accepts a complete answer file', () => {
    const draft = loadDraft();
    assert.deepEqual(validateAnswers(correctAnswers(draft), draft.questions.length), []);
  });

  it('rejects bad answers', () => {
    const file = {
      answers: [
        { questionId: 1, choice: 'e' },
        { questionId: 1, choice: 'a' },
        { questionId: 9, choice: 'b' },
        { questionId: 2, choice: 'ambiguous' },
        { questionId: 3, choice: 'c', note: 'x' },
      ],
    };
    assert.deepEqual(validateAnswers(file, 8), [
      "Answer 1: 'choice' must be 'a', 'b', 'c', 'd', or 'ambiguous', found 'e'",
      'Answer 2: question 1 already has an answer',
      "Answer 3: 'questionId' must be a question number from 1 to 8, found 9",
      "Answer 4: an 'ambiguous' answer needs a 'reason' that is not empty",
      "Answer 5: unknown field 'note'",
    ]);
  });

  it('rejects a file with no answers array', () => {
    assert.deepEqual(validateAnswers({ answer: [] }, 8), [
      "Answers: the file must be a JSON object with an 'answers' array",
    ]);
  });
});

describe('gradeAnswers', () => {
  it('passes when every answer is correct', () => {
    const draft = loadDraft();
    assert.deepEqual(gradeAnswers(draft, correctAnswers(draft)), {
      passed: true,
      totalQuestions: 8,
      passedCount: 8,
      failures: [],
    });
  });

  it('reports a wrong choice, an ambiguous question, and a missing answer', () => {
    const draft = loadDraft();
    const file = correctAnswers(draft);
    const placed = placeChoices(draft)[4];
    const obviousLetter = placed.find((item) => item.choice.field === 'obviousWrong')?.letter;
    file.answers[4].choice = obviousLetter;
    file.answers[6] = { questionId: 7, choice: 'ambiguous', reason: 'Two choices are true.' };
    file.answers.pop();

    const report = gradeAnswers(draft, file);
    assert.equal(report.passed, false);
    assert.equal(report.passedCount, 5);
    assert.deepEqual(
      report.failures.map(({ questionId, tier }) => [questionId, tier]),
      [[5, 3], [7, 4], [8, 4]],
    );
    const obviousText = draft.questions[4].obviousWrong.text;
    assert.ok(
      report.failures[0].reason.includes(
        `chose ${obviousLetter}, which is 'obviousWrong': "${obviousText}"`,
      ),
      report.failures[0].reason,
    );
    assert.match(report.failures[1].reason, /ambiguous: Two choices are true\./);
    assert.equal(report.failures[2].reason, 'The checker gave no answer for this question.');
  });
});

/**
 * Makes a fake git runner that answers from a table and records each call.
 *
 * A leading `-C <folder>` is not part of the table key, as with a real runner.
 *
 * @param {Record<string, string | null>} table Output for each argument list, joined with spaces.
 * @returns {((args: string[]) => string | null) & { calls: string[] }} The runner, which returns
 *   null for a command that the table does not hold.
 */
function fakeGit(table) {
  /** @type {string[]} */
  const calls = [];
  const git = (/** @type {string[]} */ args) => {
    const key = (args[0] === '-C' ? args.slice(2) : args).join(' ');
    calls.push(key);
    return key in table ? table[key] : null;
  };
  return Object.assign(git, { calls });
}

const CITED_PATHS = ['src/cache.ts', 'docs/spec.pdf'];

const CLEAN_REPO = {
  'rev-parse --show-toplevel HEAD': '/work/app\nabc123',
  'remote get-url origin': 'git@github.com:acme/app.git',
  'rev-list -n1 HEAD --not --remotes': '',
  'ls-files -z -- src/cache.ts docs/spec.pdf': 'src/cache.ts\0docs/spec.pdf\0',
  'status --porcelain -z --untracked-files=no -- src/cache.ts docs/spec.pdf': '',
};

describe('githubWebUrl', () => {
  it('reads the SSH, SSH URL, and HTTPS forms of a GitHub remote', () => {
    for (const remote of [
      'git@github.com:acme/app.git',
      'ssh://git@github.com/acme/app.git',
      'https://github.com/acme/app.git',
      'https://token@github.com/acme/app',
    ]) {
      assert.equal(githubWebUrl(remote), 'https://github.com/acme/app', remote);
    }
  });

  it('returns null for a remote that is not on GitHub', () => {
    assert.equal(githubWebUrl('git@gitlab.com:acme/app.git'), null);
  });
});

describe('readGitFacts', () => {
  it('runs no git command when no citation is a file', () => {
    const git = fakeGit(CLEAN_REPO);
    assert.equal(readGitFacts(git, []), null);
    assert.deepEqual(git.calls, []);
  });

  it('runs 5 git commands for any number of cited files', () => {
    const git = fakeGit(CLEAN_REPO);
    assert.deepEqual(readGitFacts(git, CITED_PATHS), {
      commit: 'abc123',
      webUrl: 'https://github.com/acme/app',
      linkable: new Set(CITED_PATHS),
    });
    assert.equal(git.calls.length, 5);
  });

  it('stops after the remote when the remote is not on GitHub', () => {
    const git = fakeGit({ ...CLEAN_REPO, 'remote get-url origin': 'git@gitlab.com:acme/app.git' });
    assert.equal(readGitFacts(git, CITED_PATHS), null);
    assert.equal(git.calls.length, 2);
  });
});

describe('resolveCitation', () => {
  const facts = readGitFacts(fakeGit(CLEAN_REPO), CITED_PATHS);

  it('links a URL target to itself', () => {
    const citation = { target: 'https://example.com/docs#part' };
    assert.deepEqual(resolveCitation(citation, null), { ...citation, url: citation.target });
  });

  it('makes a permalink with a line range for a clean, pushed file', () => {
    assert.equal(
      resolveCitation({ target: 'src/cache.ts', lineStart: 15, lineEnd: 32 }, facts).url,
      'https://github.com/acme/app/blob/abc123/src/cache.ts#L15-L32',
    );
    assert.equal(
      resolveCitation({ target: './src/cache.ts', lineStart: 7, lineEnd: 7 }, facts).url,
      'https://github.com/acme/app/blob/abc123/src/cache.ts#L7',
    );
    assert.equal(
      resolveCitation({ target: 'docs/spec.pdf', page: 12 }, facts).url,
      'https://github.com/acme/app/blob/abc123/docs/spec.pdf#page=12',
    );
  });

  it('gives no link for a changed, untracked, or unpushed file, or outside a GitHub repo', () => {
    const citation = { target: 'src/cache.ts', lineStart: 1 };
    const status = 'status --porcelain -z --untracked-files=no -- src/cache.ts docs/spec.pdf';
    const cases = [
      { [status]: ' M src/cache.ts\0' },
      { [status]: 'R  src/cache.ts\0src/old-cache.ts\0' },
      { 'ls-files -z -- src/cache.ts docs/spec.pdf': 'docs/spec.pdf\0' },
      { 'rev-list -n1 HEAD --not --remotes': 'abc123' },
      { 'remote get-url origin': 'git@gitlab.com:acme/app.git' },
      { 'rev-parse --show-toplevel HEAD': null },
    ];
    for (const change of cases) {
      const git = fakeGit({ ...CLEAN_REPO, ...change });
      const result = resolveCitation(citation, readGitFacts(git, CITED_PATHS));
      assert.equal(result.url, undefined, JSON.stringify(change));
      assert.deepEqual(result, citation);
    }
  });
});

describe('buildQuiz', () => {
  it('derives ids, tier names, letters, and HTML from the draft', () => {
    const draft = loadDraft();
    const quiz = buildQuiz(draft, { createdAt: '2026-01-02T03:04:05.000Z', gitFacts: null });
    const placed = placeChoices(draft);

    assert.equal(quiz.id, quizIdOf(draft));
    assert.equal(quiz.createdAt, '2026-01-02T03:04:05.000Z');
    assert.equal(quiz.questions.length, 8);
    quiz.questions.forEach((question, index) => {
      const source = draft.questions[index];
      assert.equal(question.id, index + 1);
      const tierNames = ['Fundamentals', 'Core', 'Advanced', 'Expert'];
      assert.equal(question.tierName, tierNames[source.tier - 1]);
      assert.equal(question.promptHtml, renderMarkdown(source.prompt));
      assert.equal(question.explanationHtml, renderMarkdown(source.explanation));
      assert.equal(question.citation.url, source.citation.target);
      question.choices.forEach((choice, slot) => {
        const sourceChoice = placed[index][slot].choice;
        assert.equal(choice.id, ['a', 'b', 'c', 'd'][slot]);
        assert.equal(choice.kind, sourceChoice.kind);
        assert.equal(choice.textHtml, renderMarkdown(sourceChoice.text));
        assert.equal('rationaleHtml' in choice, sourceChoice.kind !== 'correct');
      });
    });
  });
});

describe('renderPage', () => {
  const template =
    '<title>{{TITLE}}</title><style>/*{{TOKENS_CSS}}*/\n/*{{FONTS_CSS}}*/</style>' +
    '<!--{{LICENSE}}-->' +
    '<script id="quiz-data" type="application/json">{{QUIZ_DATA}}</script>';
  const parts = {
    template,
    tokensCss: ':root{--a:1}',
    fontsCss: '@font-face{font-family:"Geist"}',
    license: 'Copyright 2024 The Geist Project Authors\n-----\nSIL OPEN FONT LICENSE -->',
  };

  it('embeds data that cannot close the script tag and that JSON.parse reads back', () => {
    const draft = loadDraft();
    draft.title = 'Tags <b> & "quotes"';
    draft.questions[0].prompt = 'End </script><!-- and $& and $1';
    const quiz = buildQuiz(draft, { createdAt: '2026-01-02T03:04:05.000Z', gitFacts: null });
    const page = renderPage(quiz, parts);

    const data = /<script id="quiz-data" type="application\/json">([^]*?)<\/script>/.exec(page);
    assert.ok(data);
    assert.ok(!data[1].includes('<'), 'the data holds a raw < character');
    assert.deepEqual(JSON.parse(data[1]), quiz);
    assert.ok(page.includes('<title>Tags &lt;b&gt; &amp; &quot;quotes&quot;</title>'));
    assert.ok(page.includes(':root{--a:1}') && page.includes('font-family:"Geist"'));
    const license = '<!--\nCopyright 2024 The Geist Project Authors\n-----\nSIL OPEN FONT';
    assert.ok(page.includes(license));
    assert.equal(page.match(/-->/g)?.length, 1, 'the license text closed the comment early');
  });

  it('keeps placeholder text in a value as text', () => {
    const draft = loadDraft();
    draft.title = 'Templates with {{QUIZ_DATA}} and {{TITLE}}';
    const quiz = buildQuiz(draft, { createdAt: '2026-01-02T03:04:05.000Z', gitFacts: null });
    const page = renderPage(quiz, { ...parts, license: 'See {{QUIZ_DATA}}' });
    const data = /<script id="quiz-data" type="application\/json">([^]*?)<\/script>/.exec(page);
    assert.deepEqual(JSON.parse(data?.[1] ?? 'null'), quiz);
    assert.ok(page.includes('<title>Templates with {{QUIZ_DATA}} and {{TITLE}}</title>'));
    assert.ok(page.includes('See {{QUIZ_DATA}}'));
  });

  it('throws when the template does not hold each placeholder once', () => {
    const quiz = buildQuiz(loadDraft(), { createdAt: '2026-01-02T03:04:05.000Z', gitFacts: null });
    assert.throws(
      () => renderPage(quiz, { ...parts, template: template.replace('{{TITLE}}', '') }),
      /template\.html must hold \{\{TITLE\}\} exactly once, found 0/,
    );
  });
});

/**
 * Makes a small skill folder with a template that holds each placeholder once.
 *
 * @returns {string} The folder path.
 */
function makeFakeSkill() {
  const skillDir = tempFolder('quiz-skill-');
  mkdirSync(join(skillDir, 'assets'));
  writeFileSync(
    join(skillDir, 'template.html'),
    '<title>{{TITLE}}</title><style>/*{{TOKENS_CSS}}*/ /*{{FONTS_CSS}}*/</style>' +
      '<!--{{LICENSE}}--><script type="application/json">{{QUIZ_DATA}}</script>',
  );
  writeFileSync(join(skillDir, 'tokens.css'), ':root{}');
  writeFileSync(join(skillDir, 'assets/fonts.css'), '');
  writeFileSync(join(skillDir, 'assets/OFL.txt'), 'License');
  return skillDir;
}

/**
 * Makes a temporary project with the fixture draft at `quizzes/js-event-loop/quiz.json`.
 *
 * @param {string} [skillDir] Skill folder for `main`. The default is a small fake skill folder.
 *
 * @returns {{ cwd: string, skillDir: string, run: (args: string[], env?: object) => any }}
 *   The project folder, the fake skill folder, and a function that runs `main` there and captures
 *   the output.
 */
function makeProject(skillDir = makeFakeSkill()) {
  const cwd = tempFolder('quiz-project-');
  mkdirSync(join(cwd, 'quizzes/js-event-loop'), { recursive: true });
  writeFileSync(join(cwd, 'quizzes/js-event-loop/quiz.json'), readFileSync(FIXTURE_URL));
  return {
    cwd,
    skillDir,
    run(args, env = {}) {
      let stdout = '';
      let stderr = '';
      const code = main(args, {
        cwd,
        env,
        skillDir,
        stdout: (text) => (stdout += text),
        stderr: (text) => (stderr += text),
      });
      return { code, stdout, stderr };
    },
  };
}

describe('main', () => {
  const draftPath = 'quizzes/js-event-loop/quiz.json';

  it('writes index.html next to the draft and prints its path', () => {
    const project = makeProject();
    const result = project.run([draftPath], { SOURCE_DATE_EPOCH: '1767225600' });
    assert.deepEqual(result, {
      code: 0,
      stdout: 'quizzes/js-event-loop/index.html\n',
      stderr: '',
    });
    const page = readFileSync(join(project.cwd, 'quizzes/js-event-loop/index.html'), 'utf8');
    assert.ok(page.includes('<title>JavaScript event loop</title>'));
    assert.ok(page.includes('"createdAt":"2026-01-01T00:00:00.000Z"'));
  });

  it('links only clean, pushed files in a real git repository', () => {
    const project = makeProject();
    const git = (/** @type {string[]} */ ...args) =>
      execFileSync('git', ['-C', project.cwd, ...args], { stdio: 'ignore' });
    git('init', '-q', '-b', 'main');
    git('remote', 'add', 'origin', 'git@github.com:acme/app.git');
    mkdirSync(join(project.cwd, 'src'));
    for (const name of ['clean.ts', 'changed.ts']) {
      writeFileSync(join(project.cwd, 'src', name), 'one\ntwo\n');
    }
    git('add', '-A');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', 'init');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    writeFileSync(join(project.cwd, 'src', 'changed.ts'), 'one\ntwo\nthree\n');

    const draft = loadDraft();
    draft.questions[0].citation = { target: 'src/clean.ts', lineStart: 1 };
    draft.questions[1].citation = { target: 'src/changed.ts', lineStart: 1 };
    writeFileSync(join(project.cwd, draftPath), JSON.stringify(draft));
    assert.equal(project.run([draftPath]).code, 0);

    const page = readFileSync(join(project.cwd, 'quizzes/js-event-loop/index.html'), 'utf8');
    const data = /<script type="application\/json">([^]*?)<\/script>/.exec(page);
    const [first, second] = JSON.parse(data?.[1] ?? '{}').questions;
    assert.match(first.citation.url, /^https:\/\/github\.com\/acme\/app\/blob\/[0-9a-f]{40}\//);
    assert.equal(second.citation.url, undefined);
  });

  it('writes the blind copy with --blind', () => {
    const project = makeProject();
    const result = project.run([draftPath, '--blind']);
    assert.deepEqual(result, {
      code: 0,
      stdout: 'quizzes/js-event-loop/quiz.blind.json\n',
      stderr: '',
    });
    const blind = readFileSync(join(project.cwd, 'quizzes/js-event-loop/quiz.blind.json'), 'utf8');
    assert.deepEqual(JSON.parse(blind), blindQuiz(loadDraft()));
  });

  it('prints a grade report with --grade, and writes the page when every question passed', () => {
    const project = makeProject();
    const answersPath = 'quizzes/js-event-loop/answers.json';
    writeFileSync(join(project.cwd, answersPath), JSON.stringify(correctAnswers(loadDraft())));
    const result = project.run([draftPath, '--grade', answersPath]);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
    const expected = gradeAnswers(loadDraft(), correctAnswers(loadDraft()));
    const page = 'quizzes/js-event-loop/index.html';
    assert.deepEqual(JSON.parse(result.stdout), { ...expected, page });
    const html = readFileSync(join(project.cwd, page), 'utf8');
    assert.ok(html.includes('<title>JavaScript event loop</title>'));
  });

  it('exits with 3 and still prints the report when a question fails the grade', () => {
    const project = makeProject();
    const answers = correctAnswers(loadDraft());
    answers.answers[0] = { questionId: 1, choice: 'ambiguous', reason: 'Two choices fit.' };
    writeFileSync(join(project.cwd, 'answers.json'), JSON.stringify(answers));
    const result = project.run([draftPath, '--grade', 'answers.json']);
    assert.equal(result.code, 3);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.passed, false);
    assert.equal('page' in report, false);
    assert.equal(existsSync(join(project.cwd, 'quizzes/js-event-loop/index.html')), false);
  });

  it('exits with 1 and lists the errors for an invalid draft or answer file', () => {
    const project = makeProject();
    const draft = loadDraft();
    draft.questions[0].plausibleWrong.pop();
    writeFileSync(join(project.cwd, draftPath), JSON.stringify(draft));
    assert.deepEqual(project.run([draftPath, '--blind']), {
      code: 1,
      stdout: '',
      stderr:
        'VALIDATION ERROR in quizzes/js-event-loop/quiz.json:\n' +
        "- Question 1: 'plausibleWrong' must be an array of 2 choices, found 1 item\n",
    });

    const other = makeProject();
    writeFileSync(join(other.cwd, 'answers.json'), '{ "answers": [ oops ] }');
    const result = other.run([draftPath, '--grade', 'answers.json']);
    assert.equal(result.code, 1);
    const start = 'VALIDATION ERROR in answers.json:\n- The file is not valid JSON: ';
    assert.ok(result.stderr.startsWith(start), result.stderr);
  });

  it('exits with 2 for a usage error', () => {
    const project = makeProject();
    const cases = [
      [[], 'Error: missing the path to quiz.json'],
      [[draftPath, '--fast'], "Error: unknown option '--fast'"],
      [[draftPath, 'other.json'], 'Error: expected one draft path, found 2'],
      [[draftPath, '--grade'], 'Error: --grade needs the path to answers.json'],
      [[draftPath, '--blind', '--grade', 'a.json'], 'Error: use --blind or --grade, not both'],
      [['missing/quiz.json'], 'Error: cannot read missing/quiz.json: the file does not exist'],
      [['quizzes'], 'Error: cannot read quizzes: EISDIR'],
    ];
    for (const [args, message] of cases) {
      const result = project.run(/** @type {string[]} */ (args));
      assert.equal(result.code, 2, String(args));
      assert.ok(result.stderr.startsWith(`${message}\n`), result.stderr);
      const isFileError = message.startsWith('Error: cannot read');
      assert.equal(result.stderr.includes('Usage:'), !isFileError, result.stderr);
    }
  });

  it('exits with 2 and a message when the template is not usable', () => {
    const project = makeProject();
    writeFileSync(join(project.skillDir, 'template.html'), '<title>{{TITLE}}</title>');
    const result = project.run([draftPath]);
    assert.equal(result.code, 2);
    assert.equal(
      result.stderr,
      'Error: template.html must hold /*{{TOKENS_CSS}}*/ exactly once, found 0\n',
    );
  });

  it('prints the usage with --help', () => {
    const result = makeProject().run(['--help']);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /^Usage:\n {2}node <skill-dir>\/build\.mjs <quiz\.json>\n/);
  });
});

describe('the real skill folder', () => {
  it('builds a page with no placeholder left and no network request', () => {
    const project = makeProject(fileURLToPath(new URL('../skills/quiz/', import.meta.url)));
    const result = project.run(['quizzes/js-event-loop/quiz.json'], {
      SOURCE_DATE_EPOCH: '1767225600',
    });
    assert.equal(result.code, 0, result.stderr);
    const page = readFileSync(join(project.cwd, 'quizzes/js-event-loop/index.html'), 'utf8');

    assert.doesNotMatch(page, /\{\{[A-Z_]+\}\}/);
    assert.doesNotMatch(page, /<(?:link|script|img|iframe)[^>]+(?:href|src)=["']?https?:/i);
    assert.doesNotMatch(page, /url\(\s*["']?(?:https?:)?\/\//i);
    assert.doesNotMatch(page, /@import/i);
    assert.match(page, /Copyright 2024 The Geist Project Authors/);
    assert.match(page, /font-family: 'Geist Mono'/);
    assert.match(page, /--vbg-background-100: light-dark/);
  });
});
