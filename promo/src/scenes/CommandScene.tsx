import { Audio } from "@remotion/media";
import { mouseClick } from "@remotion/sfx";
import { AbsoluteFill, Interactive, Sequence, useCurrentFrame } from "remotion";
import { COLOR, MONO, sec } from "../theme";

const COMMAND = "/quiz this repo";

/** Frame where the first character of the command appears. */
const TYPE_START = sec(0.33);

/** Frames for each typed character. */
const FRAMES_PER_CHARACTER = sec(0.07);

/** Frame where the command is complete and the user presses Enter. */
const ENTER_FRAME = TYPE_START + COMMAND.length * FRAMES_PER_CHARACTER + sec(0.4);

/** Scene 1: the user types the `/quiz` command in an agent prompt. */
export const CommandScene: React.FC = () => {
  const frame = useCurrentFrame();
  const typed = Math.max(0, Math.floor((frame - TYPE_START) / FRAMES_PER_CHARACTER));
  const typing = typed > 0 && typed < COMMAND.length;
  // The cursor stays on while the user types, and blinks when the prompt waits.
  const cursorOn = typing || Math.floor(frame / sec(0.5)) % 2 === 0;

  return (
    <AbsoluteFill
      name="Command scene"
      style={{ backgroundColor: COLOR.background, justifyContent: "center" }}
    >
      <Interactive.Div
        name="Prompt line"
        style={{
          marginLeft: 220,
          fontFamily: MONO,
          fontSize: 96,
          fontWeight: 400,
          color: COLOR.text,
          whiteSpace: "pre",
          display: "flex",
          alignItems: "center",
        }}
      >
        <span style={{ color: COLOR.dim }}>{"> "}</span>
        <span>{COMMAND.slice(0, typed)}</span>
        <span
          style={{
            display: "inline-block",
            width: 52,
            height: 104,
            marginLeft: 6,
            backgroundColor: COLOR.text,
            opacity: cursorOn ? 1 : 0,
          }}
        />
      </Interactive.Div>
      <Sequence name="Enter sound" from={ENTER_FRAME} layout="none">
        <Audio src={mouseClick} volume={0.6} />
      </Sequence>
    </AbsoluteFill>
  );
};
