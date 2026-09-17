import { Audio } from "@remotion/media";
import { uiSwitch } from "@remotion/sfx";
import { AbsoluteFill, Interactive, Sequence, useCurrentFrame } from "remotion";
import { COLOR, MONO } from "../theme";
import { Caption } from "./Caption";

const CHOICES = [
  { letter: "A", text: "Both tabs get a new session and keep working" },
  { letter: "B", text: "The browser merges the two refresh requests" },
  { letter: "C", text: "The second refresh fails, and that tab logs out" },
  { letter: "D", text: "The server closes the database connection" },
];

/** Frame where the learner picks the correct choice. */
const PICK_FRAME = 22;

/** Scene 5: the learner answers a question on the quiz page. */
export const SlideScene: React.FC = () => {
  const frame = useCurrentFrame();
  const answered = frame >= PICK_FRAME;

  return (
    <AbsoluteFill name="Slide scene" style={{ backgroundColor: COLOR.background }}>
      <div
        style={{
          position: "absolute",
          left: 260,
          right: 260,
          top: 110,
          fontFamily: MONO,
          color: COLOR.text,
        }}
      >
        <Interactive.Div
          name="Slide meta"
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 28,
            color: COLOR.dim,
          }}
        >
          <span>Tier 3 · Advanced</span>
          <span>Question 14 of 20</span>
        </Interactive.Div>
        <Interactive.Div
          name="Slide prompt"
          style={{ marginTop: 28, fontSize: 48, fontWeight: 500, lineHeight: 1.25 }}
        >
          What occurs when two tabs refresh at once?
        </Interactive.Div>
        <div style={{ marginTop: 40, display: "grid", gap: 16 }}>
          {CHOICES.map((choice) => {
            const correct = choice.letter === "C";
            const highlight = answered && correct;
            return (
              <div
                key={choice.letter}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 28,
                  padding: "18px 28px",
                  borderRadius: 12,
                  fontSize: 32,
                  color: answered && !correct ? COLOR.dim : COLOR.text,
                  boxShadow: highlight
                    ? `inset 0 0 0 3px ${COLOR.green}`
                    : `inset 0 0 0 2px ${COLOR.track}`,
                }}
              >
                <span
                  style={{
                    width: 48,
                    height: 48,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 8,
                    fontSize: 24,
                    boxShadow: `inset 0 0 0 2px ${COLOR.track}`,
                  }}
                >
                  {choice.letter}
                </span>
                <span style={{ flex: 1, paddingTop: 4 }}>
                  {choice.text}
                  {highlight ? (
                    <span style={{ display: "block", marginTop: 8, color: COLOR.green, fontSize: 26 }}>
                      ✓ Your answer (Correct)
                    </span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <Sequence name="Pick sound" from={PICK_FRAME} layout="none">
        <Audio src={uiSwitch} volume={0.5} />
      </Sequence>
      <Caption text="Test what you know" from={30} />
    </AbsoluteFill>
  );
};
