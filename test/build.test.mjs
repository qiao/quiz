// @ts-check
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  blindQuiz,
  buildQuiz,
  choiceOrders,
  githubWebUrl,
  gradeAnswers,
  main,
  quizIdOf,
  readGitFacts,
  renderMarkdown,
  renderPage,
  resolveCitation,
  validateAnswers,
  validateDraft,
} from '../skills/quiz/build.mjs';

const FIXTURE_URL = new URL('./fixtures/valid-draft.json', import.meta.url);

/**
 * Loads a fresh copy of the valid draft fixture.
 *
 * @returns {any} A draft that a test can change.
 */
function loadDraft() {
  return JSON.parse(readFileSync(FIXTURE_URL, 'utf8'));
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

  it('rejects a slug that can leave the quizzes folder', () => {
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
    draft.questions[0].choices[0].text = '';
    draft.questions[0].citation.target = '';
    assert.deepEqual(validateDraft(draft), [
      "Question 1: 'prompt' must be a string that is not empty",
      "Question 1: 'explanation' must be a string that is not empty",
      "Question 1, Choice 1 ('correct'): 'text' must be a string that is not empty",
      "Question 1: 'citation.target' must be a string that is not empty",
    ]);
  });

  it('rejects a question with 3 choices', () => {
    const draft = loadDraft();
    draft.questions[0].choices.pop();
    assert.deepEqual(validateDraft(draft), [
      'Question 1: expected exactly 4 choices, found 3',
    ]);
  });

  it('rejects wrong counts of each choice kind', () => {
    const draft = loadDraft();
    const choice = draft.questions[0].choices[0];
    choice.kind = 'obvious-wrong';
    choice.rationale = 'Now it is wrong.';
    assert.deepEqual(validateDraft(draft), [
      "Question 1: expected exactly 1 'correct' choice, found 0",
      "Question 1: expected exactly 1 'obvious-wrong' choice, found 2",
    ]);
  });

  it('rejects an unknown choice kind', () => {
    const draft = loadDraft();
    draft.questions[0].choices[3].kind = 'maybe';
    assert.deepEqual(validateDraft(draft), [
      "Question 1, Choice 4: 'kind' must be 'correct', 'obvious-wrong', or 'plausible-wrong', " +
        "found 'maybe'",
      "Question 1: expected exactly 2 'plausible-wrong' choices, found 1",
    ]);
  });

  it('rejects a rationale on the correct choice and a missing rationale on a wrong choice', () => {
    const draft = loadDraft();
    draft.questions[6].choices[0].rationale = 'Repeats the explanation.';
    delete draft.questions[6].choices[1].rationale;
    assert.deepEqual(validateDraft(draft), [
      "Question 7, Choice 1 ('correct'): remove 'rationale', because 'explanation' covers " +
        'the correct choice',
      "Question 7, Choice 2 ('obvious-wrong'): missing required 'rationale'",
    ]);
  });

  it('rejects two choices with the same text', () => {
    const draft = loadDraft();
    draft.questions[1].choices[3].text = draft.questions[1].choices[2].text;
    assert.deepEqual(validateDraft(draft), ['Question 2: choices 3 and 4 have the same text']);
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

describe('choiceOrders', () => {
  it('gives the same order for the same draft', () => {
    assert.deepEqual(choiceOrders(loadDraft()), choiceOrders(loadDraft()));
  });

  it('gives a permutation of the 4 choices for each question', () => {
    for (const order of choiceOrders(makeDraft(40))) {
      assert.deepEqual([...order].sort(), [0, 1, 2, 3]);
    }
  });

  it('balances the correct position for each count from 1 to 40', () => {
    for (let count = 1; count <= 40; count += 1) {
      const draft = makeDraft(count);
      const slots = [0, 0, 0, 0];
      choiceOrders(draft).forEach((order) => {
        slots[order.indexOf(0)] += 1;
      });
      assert.ok(Math.max(...slots) - Math.min(...slots) <= 1, `count ${count}: ${slots}`);
    }
  });

  it('does not keep the draft order of the wrong choices', () => {
    const orders = choiceOrders(makeDraft(40, 'wrong order'));
    const obviousSlots = new Set(orders.map((order) => order.indexOf(1)));
    const inDraftOrder = orders.filter((order) => {
      const wrong = order.filter((choice) => choice !== 0);
      return wrong.join() === '1,2,3';
    });
    assert.equal(obviousSlots.size, 4);
    assert.ok(inDraftOrder.length < orders.length / 2, `${inDraftOrder.length} in draft order`);
  });
});

/**
 * Makes an answer file where the checker picks the correct choice of each question.
 *
 * @param {any} draft Valid draft.
 * @returns {any} An answer file with every answer correct.
 */
function correctAnswers(draft) {
  const letters = ['a', 'b', 'c', 'd'];
  return {
    answers: choiceOrders(draft).map((order, index) => ({
      questionId: index + 1,
      choice: letters[
        order.findIndex((choice) => draft.questions[index].choices[choice].kind === 'correct')
      ],
    })),
  };
}

describe('blindQuiz', () => {
  it('removes every field that shows the answer', () => {
    const text = JSON.stringify(blindQuiz(loadDraft()));
    for (const field of ['"kind"', '"rationale"', '"explanation"']) {
      assert.ok(!text.includes(field), `${field} is in the blind copy`);
    }
  });

  it('shows the choices in the same order as the page', () => {
    const draft = loadDraft();
    const blind = blindQuiz(draft);
    const orders = choiceOrders(draft);
    blind.questions.forEach((question, index) => {
      assert.equal(question.id, index + 1);
      assert.equal(question.tier, draft.questions[index].tier);
      assert.deepEqual(
        question.choices.map((choice) => choice.text),
        orders[index].map((choice) => draft.questions[index].choices[choice].text),
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
    const orders = choiceOrders(draft);
    const obviousLetter = ['a', 'b', 'c', 'd'][orders[4].indexOf(1)];
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
    assert.ok(
      report.failures[0].reason.includes(
        `chose ${obviousLetter}, which is draft choice 2 ('obvious-wrong')`,
      ),
      report.failures[0].reason,
    );
    assert.match(report.failures[1].reason, /ambiguous: Two choices are true\./);
    assert.equal(report.failures[2].reason, 'The checker gave no answer for this question.');
  });
});

/**
 * Makes a fake git runner that answers from a table.
 *
 * @param {Record<string, string | null>} table Output for each argument list, joined with spaces.
 * @returns {(args: string[]) => string | null} A runner that returns null for an unknown command.
 */
function fakeGit(table) {
  return (args) => {
    const key = args.join(' ');
    return key in table ? table[key] : null;
  };
}

const CLEAN_REPO = {
  'rev-parse --show-toplevel': '/work/app',
  'rev-parse HEAD': 'abc123',
  'remote get-url origin': 'git@github.com:acme/app.git',
  'branch -r --contains HEAD': 'origin/main',
  'ls-files -- src/cache.ts': 'src/cache.ts',
  'status --porcelain -- src/cache.ts': '',
  'ls-files -- docs/spec.pdf': 'docs/spec.pdf',
  'status --porcelain -- docs/spec.pdf': '',
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

describe('resolveCitation', () => {
  const facts = readGitFacts(fakeGit(CLEAN_REPO), () => fakeGit(CLEAN_REPO));

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
    const cases = [
      { 'status --porcelain -- src/cache.ts': ' M src/cache.ts' },
      { 'ls-files -- src/cache.ts': '' },
      { 'branch -r --contains HEAD': '' },
      { 'remote get-url origin': 'git@gitlab.com:acme/app.git' },
      { 'rev-parse --show-toplevel': null },
    ];
    for (const change of cases) {
      const git = fakeGit({ ...CLEAN_REPO, ...change });
      const result = resolveCitation(citation, readGitFacts(git, () => git));
      assert.equal(result.url, undefined, JSON.stringify(change));
      assert.deepEqual(result, citation);
    }
  });
});

describe('buildQuiz', () => {
  it('derives ids, tier names, letters, and HTML from the draft', () => {
    const draft = loadDraft();
    const quiz = buildQuiz(draft, { createdAt: '2026-01-02T03:04:05.000Z', gitFacts: null });
    const orders = choiceOrders(draft);

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
        const sourceChoice = source.choices[orders[index][slot]];
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

  it('throws when the template does not hold each placeholder once', () => {
    const quiz = buildQuiz(loadDraft(), { createdAt: '2026-01-02T03:04:05.000Z', gitFacts: null });
    assert.throws(
      () => renderPage(quiz, { ...parts, template: template.replace('{{TITLE}}', '') }),
      /template\.html must hold \{\{TITLE\}\} exactly once, found 0/,
    );
  });
});

/**
 * Makes a temporary project with the fixture draft at `quizzes/js-event-loop/quiz.json`.
 *
 * @returns {{ cwd: string, run: (args: string[], env?: Record<string, string>) => any }}
 *   The project folder, and a function that runs `main` there and captures the output.
 */
function makeProject() {
  const cwd = mkdtempSync(join(tmpdir(), 'quiz-project-'));
  mkdirSync(join(cwd, 'quizzes/js-event-loop'), { recursive: true });
  writeFileSync(join(cwd, 'quizzes/js-event-loop/quiz.json'), readFileSync(FIXTURE_URL));
  const skillDir = mkdtempSync(join(tmpdir(), 'quiz-skill-'));
  mkdirSync(join(skillDir, 'assets'));
  writeFileSync(
    join(skillDir, 'template.html'),
    '<title>{{TITLE}}</title><style>/*{{TOKENS_CSS}}*/ /*{{FONTS_CSS}}*/</style>' +
      '<!--{{LICENSE}}--><script type="application/json">{{QUIZ_DATA}}</script>',
  );
  writeFileSync(join(skillDir, 'tokens.css'), ':root{}');
  writeFileSync(join(skillDir, 'assets/fonts.css'), '');
  writeFileSync(join(skillDir, 'assets/OFL.txt'), 'License');
  return {
    cwd,
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

  it('prints a grade report with --grade', () => {
    const project = makeProject();
    const answersPath = 'quizzes/js-event-loop/answers.json';
    writeFileSync(join(project.cwd, answersPath), JSON.stringify(correctAnswers(loadDraft())));
    const result = project.run([draftPath, '--grade', answersPath]);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
    const expected = gradeAnswers(loadDraft(), correctAnswers(loadDraft()));
    assert.deepEqual(JSON.parse(result.stdout), expected);
  });

  it('exits with 3 and still prints the report when a question fails the grade', () => {
    const project = makeProject();
    const answers = correctAnswers(loadDraft());
    answers.answers[0] = { questionId: 1, choice: 'ambiguous', reason: 'Two choices fit.' };
    writeFileSync(join(project.cwd, 'answers.json'), JSON.stringify(answers));
    const result = project.run([draftPath, '--grade', 'answers.json']);
    assert.equal(result.code, 3);
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).passed, false);
  });

  it('exits with 1 and lists the errors for an invalid draft or answer file', () => {
    const project = makeProject();
    const draft = loadDraft();
    draft.questions[0].choices.pop();
    writeFileSync(join(project.cwd, draftPath), JSON.stringify(draft));
    assert.deepEqual(project.run([draftPath, '--blind']), {
      code: 1,
      stdout: '',
      stderr:
        'VALIDATION ERROR in quizzes/js-event-loop/quiz.json:\n' +
        '- Question 1: expected exactly 4 choices, found 3\n',
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
    ];
    for (const [args, message] of cases) {
      const result = project.run(/** @type {string[]} */ (args));
      assert.equal(result.code, 2, String(args));
      assert.ok(result.stderr.startsWith(`${message}\n`), result.stderr);
      const isFileError = message.startsWith('Error: cannot read');
      assert.equal(result.stderr.includes('Usage:'), !isFileError, result.stderr);
    }
  });

  it('prints the usage with --help', () => {
    const result = makeProject().run(['--help']);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /^Usage:\n {2}node build\.mjs <quiz\.json>/);
  });
});

describe('the real skill folder', () => {
  it('builds a page with no placeholder left and no network request', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'quiz-real-'));
    mkdirSync(join(cwd, 'quizzes/js-event-loop'), { recursive: true });
    writeFileSync(join(cwd, 'quizzes/js-event-loop/quiz.json'), readFileSync(FIXTURE_URL));
    let stderr = '';
    const code = main(['quizzes/js-event-loop/quiz.json'], {
      cwd,
      env: { SOURCE_DATE_EPOCH: '1767225600' },
      skillDir: fileURLToPath(new URL('../skills/quiz/', import.meta.url)),
      stdout: () => {},
      stderr: (text) => (stderr += text),
    });
    assert.equal(code, 0, stderr);
    const page = readFileSync(join(cwd, 'quizzes/js-event-loop/index.html'), 'utf8');

    assert.doesNotMatch(page, /\{\{[A-Z_]+\}\}/);
    assert.doesNotMatch(page, /<(?:link|script|img|iframe)[^>]+(?:href|src)=["']?https?:/i);
    assert.doesNotMatch(page, /url\(\s*["']?(?:https?:)?\/\//i);
    assert.doesNotMatch(page, /@import/i);
    assert.match(page, /Copyright 2024 The Geist Project Authors/);
    assert.match(page, /font-family: 'Geist Mono'/);
    assert.match(page, /--vbg-background-100: light-dark/);
  });
});
