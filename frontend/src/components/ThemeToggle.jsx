export default function ThemeToggle({ theme, onToggle }) {
  const label = theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด';
  return <button type="button" className="btn theme-toggle" onClick={onToggle} title={label} aria-label={label} aria-pressed={theme === 'dark'}>
    <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
    {theme === 'dark' ? 'โหมดสว่าง' : 'โหมดมืด'}
  </button>;
}
