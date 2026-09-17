import "./index.css";
import "./theme";
import { Composition, Folder } from "remotion";
import { QuizPromo } from "./QuizPromo";
import { CheckScene } from "./scenes/CheckScene";
import { CommandScene } from "./scenes/CommandScene";
import { DraftScene } from "./scenes/DraftScene";
import { ExploreScene } from "./scenes/ExploreScene";
import { ScoreScene } from "./scenes/ScoreScene";
import { SlideScene } from "./scenes/SlideScene";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="QuizPromo-Scenes">
        <Composition id="Command" component={CommandScene} durationInFrames={70} fps={30} width={1920} height={1080} />
        <Composition id="Explore" component={ExploreScene} durationInFrames={80} fps={30} width={1920} height={1080} />
        <Composition id="Draft" component={DraftScene} durationInFrames={90} fps={30} width={1920} height={1080} />
        <Composition id="Check" component={CheckScene} durationInFrames={70} fps={30} width={1920} height={1080} />
        <Composition id="Slide" component={SlideScene} durationInFrames={60} fps={30} width={1920} height={1080} />
        <Composition id="Score" component={ScoreScene} durationInFrames={70} fps={30} width={1920} height={1080} />
      </Folder>
      <Composition
        id="QuizPromo"
        component={QuizPromo}
        durationInFrames={400}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
