import { t } from "../copy";

export function Placeholder({ title, step, indoor }: { title: string; step: number; indoor?: boolean }) {
  return (
    <div class="placeholder">
      <h2>{title}</h2>
      <p>{indoor ? t("INDOOR_NOT_BUILT") : t("NOT_BUILT", { step })}</p>
    </div>
  );
}
