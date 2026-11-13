// Outline icons, 24 x 24, stroke = currentColor.
const P: Record<string, string> = {
  pace: "M12 8v5l3 2M10 2h4M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16z",
  start: "M12 3l6 17-6-4-6 4z",
  water: "M12 3c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z",
  heat: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  air: "M3 8h11a3 3 0 1 0-3-3M3 12h16M3 16h11a3 3 0 1 1-3 3",
  wind: "M12 3l6 17-6-4-6 4z",
  pollen: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M4.2 16.5l2.6-1.5M17.2 9l2.6-1.5",
  cold: "M12 2v20M4 6l16 12M20 6L4 18M9 3l3 3 3-3M9 21l3-3 3 3",
  athlete: "M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-7 16c1-4 4-6 7-6s6 2 7 6",
  chevron: "M9 5l7 7-7 7",
  check: "M5 12l5 5 9-10",
  dash: "M6 12h12",
  skip: "M12 7v5l2 2M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM5 19L19 5",
  back: "M15 5l-7 7 7 7",
};
export const Icon = ({ name, class: cls = "icon" }: { name: string; class?: string }) => (
  <svg class={cls} viewBox="0 0 24 24" aria-hidden="true"><path d={P[name] ?? ""} /></svg>
);
