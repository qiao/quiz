import { AbsoluteFill, Interactive, interpolate, useCurrentFrame } from "remotion";
import { COLOR, MONO } from "../theme";
import { Caption } from "./Caption";

/** Question that the checker marks as unclear, before the fix. */
const FIXED = 7;

/** Frames between two question cells. */
const CELL_GAP = 1.5;

/** Frame where the fixed question turns from failed to passed. */
const FIX_FRAME = 38;

/** Scene 4: a blind checker answers every question, and the skill fixes the one that fails. */
export const CheckScene: React.FC = () => {
  const frame = useCurrentFrame();
  const shown = Math.min(20, Math.floor(frame / CELL_GAP));
  const fixed = frame >= FIX_FRAME;
  const passed = shown - (shown >= FIXED && !fixed ? 1 : 0);

  return (
    <AbsoluteFill name="Check scene" style={{ backgroundColor: COLOR.background }}>
      <Interactive.Div
        name="Check status"
        style={{
          position: "absolute",
          left: 220,
          top: 150,
          fontFamily: MONO,
          fontSize: 56,
          fontWeight: 500,
          color: passed === 20 ? COLOR.green : COLOR.text,
        }}
      >
        {passed}/20 <span style={{ color: COLOR.dim }}>passed the blind check</span>
      </Interactive.Div>

      <div
        style={{
          position: "absolute",
          left: 220,
          right: 220,
          top: 280,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          rowGap: 22,
          fontFamily: MONO,
          fontSize: 36,
        }}
      >
        {Array.from({ length: 20 }, (_, index) => {
          const number = index + 1;
          const visible = index < shown;
          const failing = number === FIXED && !fixed;
          const color = failing ? COLOR.red : COLOR.green;
          return (
            <div
              key={number}
              style={{
                display: "flex",
                gap: 16,
                opacity: visible ? 1 : 0,
                color: COLOR.text,
              }}
            >
              <span style={{ width: 70, color: COLOR.dim }}>Q{number}</span>
              <span style={{ color }}>{failing ? "✗ unclear" : "✓"}</span>
              {number === FIXED && fixed ? (
                <span
                  style={{
                    color: COLOR.amber,
                    opacity: interpolate(frame, [FIX_FRAME, FIX_FRAME + 6], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }),
                  }}
                >
                  fixed
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <Caption text="Every answer checked" from={30} />
    </AbsoluteFill>
  );
};
