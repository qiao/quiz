import "./index.css";
import { FPS } from "./theme";
import { Composition, Folder } from "remotion";
import { PROMO_DURATION, QuizPromo, SCENES } from "./QuizPromo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="QuizPromo-Scenes">
        {SCENES.map(({ id, component, durationInFrames }) => (
          <Composition
            key={id}
            id={id}
            component={component}
            durationInFrames={durationInFrames}
            fps={FPS}
            width={1920}
            height={1080}
          />
        ))}
      </Folder>
      <Composition
        id="QuizPromo"
        component={QuizPromo}
        durationInFrames={PROMO_DURATION}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </>
  );
};
