import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { COLOR, EASE_OUT, MONO } from "../theme";
import { Caption } from "./Caption";

const QUESTIONS = [
  { tier: 1, name: "Fundamentals", text: "What does useFetch() return to TodoList?" },
  { tier: 2, name: "Core", text: "When does AuthContext refresh the session?" },
  { tier: 3, name: "Advanced", text: "Why does TodoItem lose its edit on a new id?" },
  { tier: 4, name: "Expert", text: "Why does useUndoReducer save diffs, not states?" },
];

/** Frame where the first question row appears. */
const FIRST_ROW = 22;

/** Frames between two question rows. */
const ROW_GAP = 10;

/** Scene 3: the skill writes questions in four tiers that get harder. */
export const DraftScene: React.FC = () => {
  const frame = useCurrentFrame();
  const count = Math.round(
    interpolate(frame, [0, 20], [0, 20], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );

  return (
    <AbsoluteFill name="Draft scene" style={{ backgroundColor: COLOR.background }}>
      <Interactive.Div
        name="Question count"
        style={{
          position: "absolute",
          left: 160,
          top: 150,
          fontFamily: MONO,
          fontSize: 56,
          fontWeight: 500,
          color: COLOR.text,
        }}
      >
        {count} <span style={{ color: COLOR.dim }}>questions · 4 tiers</span>
      </Interactive.Div>

      <div style={{ position: "absolute", left: 160, right: 160, top: 270, fontFamily: MONO }}>
        {QUESTIONS.map((question, index) => {
          const start = FIRST_ROW + index * ROW_GAP;
          const progress = interpolate(frame, [start, start + 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(...EASE_OUT),
          });
          return (
            <div
              key={question.tier}
              style={{
                display: "grid",
                gridTemplateColumns: "140px 470px 1fr",
                alignItems: "center",
                height: 92,
                borderTop: `2px solid ${COLOR.track}`,
                fontSize: 34,
                opacity: progress,
                translate: `${(1 - progress) * -32}px 0px`,
              }}
            >
              <span style={{ display: "flex", gap: 8 }}>
                {[1, 2, 3, 4].map((step) => (
                  <span
                    key={step}
                    style={{
                      width: 22,
                      height: 34,
                      borderRadius: 4,
                      backgroundColor: step <= question.tier ? COLOR.text : COLOR.track,
                    }}
                  />
                ))}
              </span>
              <span style={{ color: COLOR.dim }}>
                Tier {question.tier} · {question.name}
              </span>
              <span style={{ color: COLOR.text }}>{question.text}</span>
            </div>
          );
        })}
      </div>
      <Caption text="Questions that get harder" from={52} />
    </AbsoluteFill>
  );
};
