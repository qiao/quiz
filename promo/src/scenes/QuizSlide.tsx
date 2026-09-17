import { Audio } from "@remotion/media";
import { uiSwitch } from "@remotion/sfx";
import { Easing, interpolate, Sequence, useCurrentFrame } from "remotion";
import { COLOR, EASE_OUT, MONO, sec } from "../theme";

/** Time from a wrong pick to the mark on the correct choice, in seconds. */
const REVEAL_DELAY = 0.6;

/** Time that a mark takes to come in, in seconds. */
const MARK_IN = 0.25;

/** One choice on the quiz slide. */
type Choice = { letter: string; text: string };

type QuizSlideProps = {
  /** Tier label, for example "Tier 3 · Advanced". */
  tier: string;
  /** Question position, for example "Question 14 of 20". */
  position: string;
  prompt: string;
  choices: Choice[];
  /** Letter of the correct choice. */
  correct: string;
  /** Letter that the learner picks. */
  picked: string;
  /** Frame where the learner picks a choice. */
  pickFrame: number;
  /** Explanation that the page shows after a wrong answer. */
  explanation?: string;
};

/**
 * Quiz slide of the generated page: the learner picks a choice, and the page marks the result.
 * After a wrong pick, the page marks the correct choice a moment later and shows the explanation.
 */
export const QuizSlide: React.FC<QuizSlideProps> = ({
  tier,
  position,
  prompt,
  choices,
  correct,
  picked,
  pickFrame,
  explanation,
}) => {
  const frame = useCurrentFrame();
  const wrong = picked !== correct;
  const revealFrame = wrong ? pickFrame + sec(REVEAL_DELAY) : pickFrame;
  const progress = (start: number, seconds: number) =>
    interpolate(frame, [start, start + sec(seconds)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(...EASE_OUT),
    });
  const revealed = frame >= revealFrame;
  const explanationIn = progress(revealFrame + sec(0.13), 0.4);

  return (
    <div
      style={{
        position: "absolute",
        left: 260,
        right: 260,
        top: 80,
        fontFamily: MONO,
        color: COLOR.text,
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: COLOR.dim }}
      >
        <span>{tier}</span>
        <span>{position}</span>
      </div>
      <div style={{ marginTop: 20, fontSize: 46, fontWeight: 500, lineHeight: 1.25 }}>{prompt}</div>
      <div style={{ marginTop: 26, display: "grid", gap: 12 }}>
        {choices.map((choice) => {
          const isCorrect = choice.letter === correct;
          const isPicked = choice.letter === picked;
          const markColor = isCorrect ? COLOR.green : COLOR.red;
          let status = "";
          let mark = 0;
          if (isCorrect) {
            status = isPicked ? "✓ Your answer (Correct)" : "✓ Correct answer";
            mark = progress(revealFrame, MARK_IN);
          } else if (isPicked) {
            status = "✗ Your answer (Incorrect)";
            mark = progress(pickFrame, MARK_IN);
          }
          // A choice with no mark dims when the correct choice gets its mark.
          const dim = status ? 0 : progress(revealFrame, MARK_IN);
          const border = `color-mix(in oklab, ${markColor} ${mark * 100}%, ${COLOR.track})`;
          return (
            <div
              key={choice.letter}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 28,
                padding: "14px 28px",
                borderRadius: 12,
                fontSize: 30,
                color: `color-mix(in oklab, ${COLOR.dim} ${dim * 100}%, ${COLOR.text})`,
                boxShadow: `inset 0 0 0 ${2 + mark}px ${border}`,
              }}
            >
              <span
                style={{
                  width: 46,
                  height: 46,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 8,
                  fontSize: 22,
                  boxShadow: `inset 0 0 0 2px ${COLOR.track}`,
                }}
              >
                {choice.letter}
              </span>
              <span style={{ flex: 1, paddingTop: 4 }}>
                {choice.text}
                {mark > 0 ? (
                  // The status line grows as it comes in, so the choices below move down smoothly.
                  <span
                    style={{
                      display: "block",
                      overflow: "hidden",
                      maxHeight: mark * 40,
                      marginTop: mark * 6,
                      fontSize: 24,
                      color: markColor,
                      opacity: mark,
                    }}
                  >
                    {status}
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
      {explanation && revealed ? (
        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: `2px solid ${COLOR.track}`,
            opacity: explanationIn,
            translate: `0px ${(1 - explanationIn) * 16}px`,
          }}
        >
          <div style={{ fontSize: 30, fontWeight: 600 }}>
            {wrong ? `Not correct. The correct choice is ${correct}.` : "Correct."}
          </div>
          <div style={{ marginTop: 10, fontSize: 28, lineHeight: 1.4, color: COLOR.dim }}>
            {explanation}
          </div>
        </div>
      ) : null}
      <Sequence name="Pick sound" from={pickFrame} layout="none">
        <Audio src={uiSwitch} volume={0.5} />
      </Sequence>
    </div>
  );
};
