import { Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { COLOR, EASE_OUT, MONO, sec } from "../theme";

/**
 * Caption at the bottom of a scene, which rises in at a given frame.
 *
 * @param props.text Caption text.
 * @param props.from Frame of the scene where the caption starts to appear.
 */
export const Caption: React.FC<{ text: string; from: number }> = ({ text, from }) => {
  const frame = useCurrentFrame();

  return (
    <Interactive.Div
      name="Caption"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 150,
        textAlign: "center",
        fontFamily: MONO,
        fontSize: 64,
        fontWeight: 500,
        letterSpacing: "-0.01em",
        color: COLOR.text,
        opacity: interpolate(frame, [from, from + sec(0.4)], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(...EASE_OUT),
        }),
        translate: interpolate(frame, [from, from + sec(0.4)], ["0px 24px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(...EASE_OUT),
        }),
      }}
    >
      {text}
    </Interactive.Div>
  );
};
