# quiz

`quiz` is an agent skill that auto-generates multiple-choice quizzes as responsive HTML slide
pages from codebases, documentation sites, files, or technical topics.

The skill runs in coding agent hosts such as Claude Code and agy. It structures questions into four
progressive difficulty tiers, verifies questions with an independent blind sub-agent, and compiles
a single self-contained HTML file that runs offline.

---

## Installation

Clone this repository:

```bash
git clone <repo-url> ~/proj/quiz-skill
```

Create a symlink for your agent host:

### Claude Code

```bash
mkdir -p ~/.claude/skills
ln -s ~/proj/quiz-skill/skills/quiz ~/.claude/skills/quiz
```

### Antigravity and Agent Hosts using ~/.agents

```bash
mkdir -p ~/.agents/skills
ln -s ~/proj/quiz-skill/skills/quiz ~/.agents/skills/quiz
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

## Design documentation

Read the design specification in `docs/`:

- [`docs/README.md`](docs/README.md): Documentation map, reading order, and rules.
- [`docs/product.md`](docs/product.md): Product requirements, user stories, and acceptance criteria.
- [`docs/architecture.md`](docs/architecture.md): Technical architecture, data contracts, and
  compiler flow.
- [`docs/decisions.md`](docs/decisions.md): Architecture decision records and conflict log.
