import { t } from "../text";
export const Credits = ({ class: cls = "" }: { class?: string }) => <p class={`credits ${cls}`}>{t("CREDITS")}</p>;
