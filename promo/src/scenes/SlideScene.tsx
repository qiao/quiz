import { AbsoluteFill } from "remotion";
import { COLOR, sec } from "../theme";
import { Caption } from "./Caption";
import { QuizSlide } from "./QuizSlide";

/** Scene 4: the learner answers a question correctly on the quiz page. */
export const SlideScene: React.FC = () => {
  return (
    <AbsoluteFill name="Slide scene" style={{ backgroundColor: COLOR.background }}>
      <QuizSlide
        tier="Tier 2 · Core"
        position="Question 14 of 20"
        prompt="Why do your todos stay after you reload?"
        choices={[
          { letter: "A", text: "The server sends them back on each page load" },
          { letter: "B", text: "The browser keeps the page open in memory" },
          { letter: "C", text: "The app saves them in your browser storage" },
          { letter: "D", text: "The app asks you to type them again" },
        ]}
        correct="C"
        picked="C"
        pickFrame={sec(0.73)}
      />
      <Caption text="Answer each question" from={sec(1)} />
    </AbsoluteFill>
  );
};
