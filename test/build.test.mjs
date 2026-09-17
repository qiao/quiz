// @ts-check
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  blindQuiz,
  choiceOrders,
  quizIdOf,
  renderMarkdown,
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
