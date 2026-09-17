# quiz

[![test](https://github.com/qiao/quiz/actions/workflows/test.yml/badge.svg)](https://github.com/qiao/quiz/actions/workflows/test.yml)

![The quiz skill reads a repo, writes questions in four tiers, and builds a quiz page](docs/media/quiz-promo.gif)

`quiz` is an agent skill that auto-generates multiple-choice quizzes as responsive HTML slide
pages from codebases, documentation sites, files, or technical topics. Developers run the skill
primarily to test their own knowledge, and can share the generated slides with others.

The skill runs in coding agent hosts such as Claude Code and agy. It structures questions into four
progressive difficulty tiers, verifies questions with an independent blind sub-agent, and compiles
a single self-contained HTML file that runs offline.

---

## Installation

The build step needs [Node.js](https://nodejs.org) 20 or later.

Install the skill with the [skills CLI](https://github.com/vercel-labs/skills). It finds the agents
on your computer, for example Claude Code:

```bash
npx skills add qiao/quiz
```

To install by hand, clone this repository and link the skill folder into your agent host.

```bash
git clone https://github.com/qiao/quiz.git ~/proj/quiz
```

### Claude Code

```bash
mkdir -p ~/.claude/skills
ln -s ~/proj/quiz/skills/quiz ~/.claude/skills/quiz
```

### Antigravity and Agent Hosts using ~/.agents

```bash
mkdir -p ~/.agents/skills
ln -s ~/proj/quiz/skills/quiz ~/.agents/skills/quiz
```

---

## Usage

Run `/quiz` within any project directory:

```text
/quiz
```

### Common prompt forms

- **Explore workspace:** `/quiz`
- **Focus on a subsystem:** `/quiz authentication flow`
- **Target a path:** `/quiz ./packages/core`
- **Target documentation:** `/quiz https://example.com/docs`
- **Target a document:** `/quiz manual.pdf`
- **Set question count:** `/quiz 10 questions on state management`

The skill writes the compiled presentation to `./quizzes/<slug>/index.html` and prints a command to
open the slides in your browser.

---

## Slide controls

Slides support keyboard navigation (keys 1 to 4, Enter, Arrow keys, and T for theme toggle).
Section 7 of [`docs/architecture.md`](docs/architecture.md#7-slide-interface) defines the full
key map.

---

## Development

Run the automated test suite:

```bash
node --test test/build.test.mjs
```

---

## Design documentation

Read the design specification in `docs/`:

- [`docs/README.md`](docs/README.md): Documentation map, reading order, and rules.
- [`docs/product.md`](docs/product.md): Product requirements, user stories, and acceptance criteria.
- [`docs/architecture.md`](docs/architecture.md): Technical architecture, data contracts, and
  compiler flow.
- [`docs/decisions.md`](docs/decisions.md): Architecture decision records and conflict log.

---

## License and credits

The skill is available under the [MIT license](LICENSE).

- The quiz page uses the Geist and Geist Mono fonts, under the SIL Open Font License 1.1
  ([`skills/quiz/assets/OFL.txt`](skills/quiz/assets/OFL.txt)). Each page holds a copy of that
  license.
- The colors, spacing, and type sizes in [`skills/quiz/tokens.css`](skills/quiz/tokens.css) follow
  the public [Vercel design guide](https://vercel.com/design.md). The page shows no Vercel name or
  logo, and this project has no connection to Vercel.
- The motion tokens and three page transitions come from the free recipes of
  [transitions.dev](https://transitions.dev), under its
  [terms](https://transitions.dev/terms.html).
- The promo video in [`promo/`](promo/) uses [Remotion](https://www.remotion.dev), which has its own
  [license](https://www.remotion.dev/license).
