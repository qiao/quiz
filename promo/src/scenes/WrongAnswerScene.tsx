import { AbsoluteFill } from "remotion";
import { COLOR, sec } from "../theme";
import { Caption } from "./Caption";
import { QuizSlide } from "./QuizSlide";

/** Scene 5: the learner picks a wrong answer, and the page shows the correct one and why. */
export const WrongAnswerScene: React.FC = () => {
  return (
    <AbsoluteFill name="Wrong answer scene" style={{ backgroundColor: COLOR.background }}>
      <QuizSlide
        tier="Tier 3 · Advanced"
        position="Question 18 of 20"
        prompt="Why can two open tabs show different todos?"
        choices={[
          { letter: "A", text: "Each tab reads storage only when it loads" },
          { letter: "B", text: "The server gives each tab its own list" },
          { letter: "C", text: "Each tab has its own browser storage" },
          { letter: "D", text: "The app deletes todos in the other tab" },
        ]}
        correct="A"
        picked="C"
        pickFrame={sec(0.73)}
        explanation="Both tabs share one storage, but each tab reads it only on load."
      />
      <Caption text="See why each answer is right" from={sec(1.93)} />
    </AbsoluteFill>
  );
};
