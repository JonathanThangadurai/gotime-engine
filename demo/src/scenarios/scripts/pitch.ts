import type { Script } from "./index";

// Partner pitch, about three minutes (docs/phone-demo-plan.md section 5).
export const pitch: Script = {
  id: "pitch",
  title: "Partner pitch",
  steps: [
    // 1. Sanne, Amsterdam heatwave (60 s)
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 2, seconds: 15,
      note: "Friday evening. Sanne usually runs at 18:00; tomorrow that slot is hot. Because it differs from her habit, and only then, she gets one message with a concrete slot. One tap puts it in her calendar." },
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 3, seconds: 10,
      note: "Saturday, on waking: one verb, one time. That is the whole decision." },
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 4, seconds: 20,
      note: "Inside her running app. The GOTime card: the decision, her window on one line, then pace, start direction and water for her own 6:20 pace." },
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 5, seconds: 15,
      note: "One tap deeper: the benefit first, compared with her usual time, then plain reasons, each with its evidence level. Numbers only if she asks." },
    // 2. The run and the post-run card (45 s)
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 7, seconds: 20,
      note: "On her watch: her pace, the forecast heat for this hour and a cue to turn at halfway for a tailwind home. All of it computed on the phone." },
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 8, seconds: 25,
      note: "After the run, the benefit she would never notice otherwise: what her usual 18:00 would have been like. She went as planned, and she tells us how it felt." },
    // 3. Chennai: same engine, different advice (45 s)
    { scenario: "chn-bhogi", persona: "arjun", time: "05:15", moment: 4, seconds: 25,
      note: "Chennai, Bhogi morning. Arjun always runs at 5:30, and today that is the worst slot: bonfire smoke. Same engine, different advice: indoors first; if he goes out, the least bad slot." },
    { scenario: "chn-heat", persona: "arjun", compare: "sanne", time: "05:15", moment: 4, seconds: 20,
      note: "Same May morning in Chennai, two runners. Arjun is used to the heat: go early, go easy. Sanne is visiting: train indoors." },
    // 4. Partner lens (30 s)
    { scenario: "ams-heat", persona: "sanne", time: "06:45", moment: 4, lens: true, seconds: 30,
      note: "This card is all you embed. One API call, codes plus text, your branding around it. On the right: the response behind this screen." },
  ],
};
