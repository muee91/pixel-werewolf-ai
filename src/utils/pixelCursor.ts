// 像素箭头光标:运行时 canvas 绘制经典白箭头(暖白填充+深墨描边),转 data URL 应用到 body。
// 输入类控件由 CSS 保留系统文本光标。
const ARROW = [
  'X...........',
  'XX..........',
  'X#X.........',
  'X##X........',
  'X###X.......',
  'X####X......',
  'X#####X.....',
  'X######X....',
  'X#######X...',
  'X########X..',
  'X#####XXXXX.',
  'X#X##X......',
  'XX.X##X.....',
  '....X##X....',
  '.....X##X...',
  '.....X##X...',
  '......XX....',
];

export function initPixelCursor(): void {
  if (typeof document === 'undefined') return;
  const S = 2;
  const canvas = document.createElement('canvas');
  canvas.width = ARROW[0].length * S;
  canvas.height = ARROW.length * S;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ARROW.forEach((row, y) =>
    row.split('').forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = ch === 'X' ? '#24170e' : '#f2dfaa';
      ctx.fillRect(x * S, y * S, S, S);
    }),
  );
  const style = document.createElement('style');
  style.textContent = `body { cursor: url(${canvas.toDataURL('image/png')}) 0 0, default; }`;
  document.head.appendChild(style);
}
