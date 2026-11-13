import { t } from "../copy";
export const Credits = ({ class: cls = "" }: { class?: string }) => <p class={`credits ${cls}`}>{t("CREDITS")}</p>;
