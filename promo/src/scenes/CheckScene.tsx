import { AbsoluteFill, Interactive, interpolate, useCurrentFrame } from "remotion";
import { COLOR, MONO } from "../theme";
import { Caption } from "./Caption";

/** Question that the checker marks as ambiguous, before the repair. */
const REPAIRED = 7;

/** Frames between two question cells. */
const CELL_GAP = 1.5;

/** Frame where the repaired question turns from failed to passed. */
const REPAIR_FRAME = 50;

/** Scene 4: a blind checker answers every question, and the skill repairs the one that fails. */
export const CheckScene: React.FC = () => {
  const frame = useCurrentFrame();
  const shown = Math.min(20, Math.floor(frame / CELL_GAP));
  const repaired = frame >= REPAIR_FRAME;
  const passed = shown - (shown >= REPAIRED && !repaired ? 1 : 0);

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
          const failing = number === REPAIRED && !repaired;
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
              <span style={{ color }}>{failing ? "✗ ambiguous" : "✓"}</span>
              {number === REPAIRED && repaired ? (
                <span
                  style={{
                    color: COLOR.amber,
                    opacity: interpolate(frame, [REPAIR_FRAME, REPAIR_FRAME + 6], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }),
                  }}
                >
                  repaired
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
