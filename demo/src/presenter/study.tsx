// User test: rating questions at the marked script steps, answers kept on this device only (localStorage, wrapped in
// try/catch), exported as JSON from the presenter drawer or stage bar. Nothing is sent anywhere.
import { computed, signal } from "@preact/signals";
import { t, lang } from "../copy";
import type { Question } from "../scenarios/scripts";
import { SCRIPTS } from "../scenarios/scripts";
import { personaId, scenarioId } from "./state";
import { currentStep, forward, scriptId, scriptStep } from "./script";

export type Answer = string | number | boolean;
export interface Session {
  id: string;
  started_at: string;
  updated_at: string;
  lang: string;
  scenario: string;
  persona: string;
  answers: Record<string, Answer>;
}

const KEY = "gotime-demo-user-test";
function load(): Session[] {
  try { const raw = localStorage.getItem(KEY); const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch { return []; }
}
function save(list: Session[]) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage blocked: answers stay in memory */ } }

export const sessions = signal<Session[]>(typeof localStorage === "undefined" ? [] : load());
export const current = computed(() => sessions.value[sessions.value.length - 1] ?? null);
export const studyOpen = signal(true);   // the question card is open (can be hidden to see the screen)

const newSession = (): Session => {
  const now = new Date().toISOString();
  return { id: "p" + Date.now().toString(36), started_at: now, updated_at: now, lang: lang.value, scenario: scenarioId.value, persona: personaId.value, answers: {} };
};
/** Start a new participant; earlier sessions are kept for export. */
export function newParticipant() { sessions.value = [...sessions.value, newSession()]; save(sessions.value); studyOpen.value = true; }
export function answer(id: string, value: Answer) {
  const list = sessions.value.length ? [...sessions.value] : [newSession()];
  const s = list[list.length - 1];
  list[list.length - 1] = { ...s, updated_at: new Date().toISOString(), answers: { ...s.answers, [id]: value } };
  sessions.value = list; save(list);
}
export function clearAll() { sessions.value = []; save([]); }

/** Plan section 5 record: decision change, comprehension, trust, notification tolerance (plus the raw answers). */
export function summarize(s: Session) {
  const a = s.answers, has = (k: string) => k in a;
  return {
    consent: a.consent === true,
    // baseline (asked before any advice) vs the choice after the evening message; "not sure" on either side = no verdict
    usual_time: has("usual_time") ? a.usual_time : null,
    plan_after_message: has("plan_after_message") ? a.plan_after_message : null,
    decision_change: has("usual_time") && has("plan_after_message") && a.usual_time !== "unsure" && a.plan_after_message !== "unsure"
      ? a.plan_after_message !== a.usual_time : null,
    comprehension: has("comprehension") ? a.comprehension : null,
    usefulness_1_7: has("useful") ? a.useful : null,
    trust_1_7: has("trust") ? a.trust : null,
    would_allow_notifications: has("notify") ? a.notify : null,
    too_often: has("frequency") ? a.frequency : null,
  };
}
export function exportJson(): string {
  return JSON.stringify({
    app: "gotime-phone-demo", export_version: 1, exported_at: new Date().toISOString(),
    note: "Collected on this device only. No names; participant ids are random.",
    sessions: sessions.value.map(s => ({ ...s, summary: summarize(s) })),
  }, null, 2);
}
export function downloadJson() {
  const blob = new Blob([exportJson()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gotime-user-test-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Presenter controls (stage bar and phone drawer), shown while the user-test script runs. */
export function StudyControls() {
  if (scriptId.value !== "user-test") return null;
  const n = sessions.value.length;
  return (
    <div class="seg study-controls" role="group" aria-label="User test">
      <span class="field-label">Participant {Math.max(1, n)}</span>
      <button type="button" onClick={newParticipant} data-testid="new-participant">New participant</button>
      <button type="button" onClick={downloadJson} data-testid="export-json">Export JSON ({n})</button>
    </div>
  );
}

// ---------------------------------------------------------------- the question card on the phone
const allQuestions = computed(() => (SCRIPTS["user-test"]?.steps ?? []).flatMap(s => s.questions ?? []));
const optionValue = (key: string) => key.replace(/^UT_O_/, "").replace(/^FACTOR_/, "");

function Control({ q }: { q: Question }) {
  const v = current.value?.answers[q.id];
  if (q.kind === "text") {
    return <textarea class="ut-text" rows={2} placeholder={t("UT_TEXT_PLACEHOLDER")} value={typeof v === "string" ? v : ""}
      data-testid={`ut-${q.id}`} onChange={e => answer(q.id, (e.target as HTMLTextAreaElement).value)} />;
  }
  const opts: { value: Answer; label: string }[] =
    q.kind === "scale" ? [1, 2, 3, 4, 5, 6, 7].map(n => ({ value: n, label: String(n) }))
    : q.kind === "yesno" ? [{ value: true, label: t("YES") }, { value: false, label: t("NO") }]
    : (q.options ?? []).map(k => ({ value: optionValue(k), label: t(k) }));
  return (
    <>
      <div class={`seg-row${q.kind === "scale" ? " scale" : q.kind === "choice" ? " stack" : ""}`} role="radiogroup" aria-label={t(`UT_Q_${q.id}`)}>
        {opts.map(o => (
          <button type="button" role="radio" aria-checked={v === o.value} key={String(o.value)} class={v === o.value ? "on" : ""}
            data-testid={`ut-${q.id}-${String(o.value)}`} onClick={() => answer(q.id, o.value)}>{o.label}</button>
        ))}
      </div>
      {q.kind === "scale" && <p class="ut-ends"><span>1 · {t(`UT_LOW_${q.id}`)}</span><span>7 · {t(`UT_HIGH_${q.id}`)}</span></p>}
    </>
  );
}

/** One screen before the test: what we ask, where answers stay, export without names, stop at any time. */
function ConsentScreen() {
  const agreed = current.value?.answers.consent === true;
  return (
    <section class="ut-consent" data-testid="ut-consent" aria-labelledby="ut-consent-title">
      <p class="gt-label">{t("UT_STUDY")}</p>
      <h2 id="ut-consent-title" class="gt-decision">{t("UT_CONSENT_TITLE")}</h2>
      <ul class="rows">
        <li class="row"><span>{t("UT_CONSENT_ASK")}</span></li>
        <li class="row"><span>{t("UT_CONSENT_STORE")}</span></li>
        <li class="row"><span>{t("UT_CONSENT_EXPORT")}</span></li>
        <li class="row"><span>{t("UT_CONSENT_STOP")}</span></li>
      </ul>
      <button type="button" class="primary" data-testid="ut-consent-start"
        onClick={() => { if (!agreed) answer("consent", true); forward(); }}>{t("UT_CONSENT_START")}</button>
    </section>
  );
}

export function StudyCard() {
  const step = currentStep.value;
  if (scriptId.value === "user-test" && step?.consent) return <ConsentScreen />;
  if (scriptId.value !== "user-test" || !step?.questions?.length) return null;
  const first = allQuestions.value.findIndex(q => q.id === step.questions![0].id) + 1;
  if (!studyOpen.value) {
    return <button type="button" class="ut-tab" onClick={() => { studyOpen.value = true; }} data-testid="ut-show">{t("UT_SHOW")}</button>;
  }
  return (
    <section class="ut-card" data-testid="ut-card" aria-label={t("UT_LABEL")} key={scriptStep.value}>
      <header>
        <span class="ut-label">{t("UT_LABEL")} · {t("UT_PROGRESS", { n: first, total: allQuestions.value.length })}</span>
        <button type="button" class="text-btn" onClick={() => { studyOpen.value = false; }}>{t("UT_HIDE")}</button>
      </header>
      {step.questions.map(q => (
        <fieldset class="q ut-q" key={q.id}>
          <legend>{t(`UT_Q_${q.id}`)}</legend>
          <Control q={q} />
        </fieldset>
      ))}
      <p class="ut-saved">{t("UT_SAVED")}</p>
    </section>
  );
}
