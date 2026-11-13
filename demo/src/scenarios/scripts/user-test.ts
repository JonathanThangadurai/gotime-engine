import type { Script } from "./index";

// Runner user test, 10-15 minutes, think-aloud, one scenario (docs/phone-demo-plan.md section 5).
// `questions` appear on the phone at that step (answers stay on the device; export from the drawer).
// `question` is the facilitator's prompt in the stage notes (N).
export const userTest: Script = {
  id: "user-test",
  title: "Runner user test",
  steps: [
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 1, consent: true,
      note: "Hand over the phone. Let the participant read the consent screen; start only when they tap the button." },
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 1,
      note: "Let the participant answer the three questions as themselves." },
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 2,
      note: "Do not explain the message.", question: "Read the evening message: what would you do tomorrow?",
      questions: [{ id: "evening_plan", kind: "choice", options: ["UT_O_window", "UT_O_usual", "UT_O_unsure"] }] },
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 4,
      note: "Morning. They open their running app.", question: "When will you run, and why?",
      questions: [{ id: "today_when", kind: "text" }, { id: "comprehension", kind: "yesno" }] },
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 5,
      note: "Let them open Why themselves if they want to.", question: "Which reason matters most to you? Anything you do not believe?",
      questions: [{ id: "why_top", kind: "choice", options: ["FACTOR_heat", "FACTOR_air", "FACTOR_wind", "FACTOR_athlete"] },
        { id: "why_doubt", kind: "text" }] },
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 8,
      note: "After the run.", question: "How does this card make you feel about the decision?",
      questions: [{ id: "after_feel", kind: "scale" }] },
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 9,
      note: "Close with the ratings, then export the answers from the drawer.",
      question: "Usefulness and trust (1-7), notifications yes or no, how often is too often.",
      questions: [{ id: "useful", kind: "scale" }, { id: "trust", kind: "scale" }, { id: "notify", kind: "yesno" },
        { id: "frequency", kind: "choice", options: ["UT_O_more_daily", "UT_O_daily", "UT_O_few_week", "UT_O_weekly"] }] },
  ],
};
