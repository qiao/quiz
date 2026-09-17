import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { CommandScene } from "./scenes/CommandScene";
import { DraftScene } from "./scenes/DraftScene";
import { ExploreScene } from "./scenes/ExploreScene";
import { ScoreScene } from "./scenes/ScoreScene";
import { SlideScene } from "./scenes/SlideScene";
import { WrongAnswerScene } from "./scenes/WrongAnswerScene";

/**
 * Promo video of the quiz skill: a command, then the skill reads the app and writes a quiz that the
 * learner takes. The 6 scenes last 490 frames, and the 5 fades of 8 frames overlap, so the video is
 * 450 frames long.
 */
export const QuizPromo: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence name="Command" durationInFrames={70}>
        <CommandScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 8 })} />
      <TransitionSeries.Sequence name="Explore" durationInFrames={80}>
        <ExploreScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 8 })} />
      <TransitionSeries.Sequence name="Draft" durationInFrames={90}>
        <DraftScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 8 })} />
      <TransitionSeries.Sequence name="Slide" durationInFrames={60}>
        <SlideScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 8 })} />
      <TransitionSeries.Sequence name="Wrong answer" durationInFrames={90}>
        <WrongAnswerScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 8 })} />
      <TransitionSeries.Sequence name="Score" durationInFrames={100}>
        <ScoreScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
