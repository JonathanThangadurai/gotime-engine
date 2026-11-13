export function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <div class="placeholder" data-testid="placeholder">
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
