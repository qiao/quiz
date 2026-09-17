import { Audio } from "@remotion/media";
import { uiSwitch } from "@remotion/sfx";
import { Easing, interpolate, Sequence, useCurrentFrame } from "remotion";
import { COLOR, EASE_OUT, MONO } from "../theme";

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
 * Quiz slide of the generated page: the learner picks a choice, the page marks the result, and a
 * wrong answer also shows the correct choice and the explanation.
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
  const answered = frame >= pickFrame;
  const wrong = picked !== correct;
  const reveal = interpolate(frame, [pickFrame + 4, pickFrame + 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...EASE_OUT),
  });

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
          const isCorrect = answered && choice.letter === correct;
          const isWrongPick = answered && wrong && choice.letter === picked;
          const border = isCorrect ? COLOR.green : isWrongPick ? COLOR.red : COLOR.track;
          let status = "";
          if (isCorrect) status = choice.letter === picked ? "✓ Your answer (Correct)" : "✓ Correct answer";
          if (isWrongPick) status = "✗ Your answer (Incorrect)";
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
                color: answered && !isCorrect && !isWrongPick ? COLOR.dim : COLOR.text,
                boxShadow: `inset 0 0 0 ${border === COLOR.track ? 2 : 3}px ${border}`,
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
                {status ? (
                  <span
                    style={{
                      display: "block",
                      marginTop: 6,
                      fontSize: 24,
                      color: isCorrect ? COLOR.green : COLOR.red,
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
      {explanation && answered ? (
        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: `2px solid ${COLOR.track}`,
            opacity: reveal,
            translate: `0px ${(1 - reveal) * 16}px`,
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
