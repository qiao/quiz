import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Fragment } from "react";
import { CommandScene } from "./scenes/CommandScene";
import { DraftScene } from "./scenes/DraftScene";
import { ExploreScene } from "./scenes/ExploreScene";
import { ScoreScene } from "./scenes/ScoreScene";
import { SlideScene } from "./scenes/SlideScene";
import { WrongAnswerScene } from "./scenes/WrongAnswerScene";

/** One scene of the promo video. */
type Scene = {
  /** Composition id of the scene alone in Remotion Studio. */
  id: string;
  component: React.FC;
  durationInFrames: number;
};

/** Scenes of the promo video, in order. */
export const SCENES: Scene[] = [
  { id: "Command", component: CommandScene, durationInFrames: 70 },
  { id: "Explore", component: ExploreScene, durationInFrames: 80 },
  { id: "Draft", component: DraftScene, durationInFrames: 90 },
  { id: "Slide", component: SlideScene, durationInFrames: 60 },
  { id: "WrongAnswer", component: WrongAnswerScene, durationInFrames: 90 },
  { id: "Score", component: ScoreScene, durationInFrames: 100 },
];

/** Length of the fade between two scenes, in frames. */
const FADE = 8;

/** Length of the video: the fades overlap the scenes, so each fade removes its length. */
export const PROMO_DURATION =
  SCENES.reduce((sum, scene) => sum + scene.durationInFrames, 0) - FADE * (SCENES.length - 1);

/**
 * Promo video of the quiz skill: a command, then the skill reads the app and writes a quiz that the
 * learner takes. The scenes join with fades.
 */
export const QuizPromo: React.FC = () => {
  return (
    <TransitionSeries>
      {SCENES.map(({ id, component: Component, durationInFrames }, index) => (
        <Fragment key={id}>
          {index > 0 ? (
            <TransitionSeries.Transition
              presentation={fade()}
              timing={linearTiming({ durationInFrames: FADE })}
            />
          ) : null}
          <TransitionSeries.Sequence name={id} durationInFrames={durationInFrames}>
            <Component />
          </TransitionSeries.Sequence>
        </Fragment>
      ))}
    </TransitionSeries>
  );
};
