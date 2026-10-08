// Tiny formatter for resource copy: `code`, **bold** and [label](url). Escapes everything else.
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const inline = (t: string) =>
  esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

export const pad = (n: number) => String(n).padStart(2, '0');
