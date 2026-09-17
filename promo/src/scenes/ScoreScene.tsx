import { Audio } from "@remotion/media";
import { ding, mouseClick } from "@remotion/sfx";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  random,
  Sequence,
  useCurrentFrame,
} from "remotion";
import { COLOR, MONO } from "../theme";
import { Caption } from "./Caption";

/** Frames of the first fill, which stops at 19 of 20 because one answer was wrong. */
const FIRST_FILL = [6, 30] as const;

/** Frame where the learner presses "Try the missed questions again". */
const RETRY_PRESS = 48;

/** Frames of the second fill, after the learner answers the missed question again. */
const SECOND_FILL = [54, 64] as const;

/** Frame where the confetti starts, after the ring closes. */
const CONFETTI_START = SECOND_FILL[1] + 2;

const CONFETTI_COLORS = [COLOR.text, COLOR.green, COLOR.dim];

/**
 * Scene 6: the score ring fills to 19 of 20, the learner retries the missed question, and the ring
 * closes at a perfect score with confetti.
 */
export const ScoreScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fill =
    frame < SECOND_FILL[0]
      ? interpolate(frame, [...FIRST_FILL], [0, 0.95], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.33, 0, 0.2, 1),
        })
      : interpolate(frame, [...SECOND_FILL], [0.95, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.33, 0, 0.2, 1),
        });
  const perfect = fill === 1;
  const confettiFrame = frame - CONFETTI_START;

  return (
    <AbsoluteFill
      name="Score scene"
      style={{ backgroundColor: COLOR.background, alignItems: "center" }}
    >
      <AbsoluteFill name="Confetti" style={{ pointerEvents: "none" }}>
        {confettiFrame >= 0
          ? Array.from({ length: 70 }, (_, index) => {
              const seed = `piece-${index}`;
              const startX = random(`${seed}-x`) * 1920;
              const startY = -40 - random(`${seed}-y`) * 360;
              const drift = (random(`${seed}-drift`) - 0.5) * 6;
              const speed = 6 + random(`${seed}-speed`) * 8;
              const y = startY + speed * confettiFrame + 0.35 * confettiFrame ** 2;
              const spin = (random(`${seed}-spin`) - 0.5) * 30 * confettiFrame;
              return (
                <div
                  key={seed}
                  style={{
                    position: "absolute",
                    left: startX + drift * confettiFrame,
                    top: y,
                    width: 16,
                    height: 28,
                    borderRadius: 3,
                    backgroundColor: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
                    rotate: `${spin}deg`,
                  }}
                />
              );
            })
          : null}
      </AbsoluteFill>

      <div style={{ position: "relative", marginTop: 110, width: 440, height: 440 }}>
        <svg width={440} height={440} viewBox="0 0 100 100">
          <circle cx={50} cy={50} r={46} fill={COLOR.background} stroke={COLOR.track} strokeWidth={2} />
          <circle
            cx={50}
            cy={50}
            r={46}
            fill="none"
            stroke={perfect ? COLOR.green : COLOR.text}
            strokeWidth={2}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={100}
            strokeDashoffset={100 - fill * 100}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <Interactive.Div
          name="Score text"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeContent: "center",
            justifyItems: "center",
            fontFamily: MONO,
            color: COLOR.text,
          }}
        >
          <span style={{ fontSize: 110, fontWeight: 600, lineHeight: 1 }}>
            {Math.round(fill * 20)}/20
          </span>
          <span style={{ marginTop: 12, fontSize: 36, color: COLOR.dim }}>
            {Math.round(fill * 100)}%
          </span>
        </Interactive.Div>
      </div>

      <Interactive.Div
        name="Retry button"
        style={{
          marginTop: 44,
          padding: "18px 34px",
          borderRadius: 8,
          fontFamily: MONO,
          fontSize: 30,
          fontWeight: 500,
          backgroundColor: COLOR.text,
          color: COLOR.background,
          opacity: interpolate(frame, [34, 40, 54, 60], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [RETRY_PRESS, RETRY_PRESS + 2, RETRY_PRESS + 4], [1, 0.94, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Try the missed questions again
      </Interactive.Div>

      <Sequence name="Retry sound" from={RETRY_PRESS} layout="none">
        <Audio src={mouseClick} volume={0.5} />
      </Sequence>
      <Sequence name="Perfect sound" from={CONFETTI_START} layout="none">
        <Audio src={ding} volume={0.5} />
      </Sequence>
      <Caption text="Test your knowledge" from={72} />
    </AbsoluteFill>
  );
};
