import { Audio } from "@remotion/media";
import { ding } from "@remotion/sfx";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  random,
  Sequence,
  useCurrentFrame,
} from "remotion";
import { COLOR, FPS, MONO, sec } from "../theme";
import { Caption } from "./Caption";

/** Frames of the fill, which runs from an empty ring to a perfect score. */
const FILL = [sec(0.2), sec(1.4)] as const;

/** Frame where the confetti starts, after the ring closes. */
const CONFETTI_START = FILL[1] + sec(0.07);

const CONFETTI_COLORS = [COLOR.text, COLOR.green, COLOR.dim];

/** Scene 6: the score ring fills to a perfect score, and confetti drops when the ring closes. */
export const ScoreScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fill = interpolate(frame, [...FILL], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.33, 0, 0.2, 1),
  });
  const perfect = fill === 1;
  // Time since the confetti started, in seconds.
  const confettiTime = (frame - CONFETTI_START) / FPS;

  return (
    <AbsoluteFill
      name="Score scene"
      style={{ backgroundColor: COLOR.background, alignItems: "center" }}
    >
      <AbsoluteFill name="Confetti" style={{ pointerEvents: "none" }}>
        {confettiTime >= 0
          ? Array.from({ length: 70 }, (_, index) => {
              const seed = `piece-${index}`;
              const startX = random(`${seed}-x`) * 1920;
              const startY = -40 - random(`${seed}-y`) * 360;
              // Drift and speed are in pixels per second, and spin is in degrees per second.
              const drift = (random(`${seed}-drift`) - 0.5) * 180;
              const speed = 180 + random(`${seed}-speed`) * 240;
              const y = startY + speed * confettiTime + 315 * confettiTime ** 2;
              const spin = (random(`${seed}-spin`) - 0.5) * 900 * confettiTime;
              return (
                <div
                  key={seed}
                  style={{
                    position: "absolute",
                    left: startX + drift * confettiTime,
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
          <circle
            cx={50}
            cy={50}
            r={46}
            fill={COLOR.background}
            stroke={COLOR.track}
            strokeWidth={2}
          />
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

      <Sequence name="Perfect sound" from={CONFETTI_START} layout="none">
        <Audio src={ding} volume={0.5} />
      </Sequence>
      <Caption text="Test your knowledge" from={sec(1.73)} />
    </AbsoluteFill>
  );
};
