import type { Script } from "./index";

// Runner user test, 10-15 minutes, think-aloud, one scenario (docs/phone-demo-plan.md section 5).
// The questions are shown to the facilitator in the stage notes; on-device rating and JSON export arrive in step 5.
export const userTest: Script = {
  id: "user-test",
  title: "Runner user test",
  steps: [
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 1,
      note: "Let the participant answer the three questions as themselves.", question: "" },
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 2,
      note: "Hand over the phone. Do not explain the message.", question: "Read the evening message: what would you do tomorrow?" },
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 4,
      note: "Morning. They open their running app.", question: "When will you run, and why?" },
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 5,
      note: "Let them open Why themselves if they want to.", question: "Which reason matters most to you? Anything you do not believe?" },
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 8,
      note: "After the run.", question: "How does this card make you feel about the decision?" },
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 9,
      note: "Close with the ratings: usefulness and trust (1 to 7), would you allow these notifications, how often is too often.",
      question: "Ratings: usefulness, trust (1-7), notifications yes or no, how often is too often." },
  ],
};
