import { useState, useRef, useEffect } from 'react';

export default function SearchableSelect({ options, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);

  const selected = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  function handleSelect(opt) {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
  }

  return (
    <div className="searchable-select" ref={wrapRef}>
      <input
        type="text"
        className="searchable-select__input"
        placeholder={placeholder}
        value={open ? query : (selected ? selected.label : '')}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => setQuery(e.target.value)}
      />
      {open && (
        <div className="searchable-select__panel">
          {filtered.length === 0 && (
            <div className="searchable-select__empty">ไม่พบรายการที่ตรงกัน</div>
          )}
          {filtered.map((opt) => (
            <div
              key={opt.value}
              className={`searchable-select__option ${String(opt.value) === String(value) ? 'searchable-select__option--active' : ''}`}
              onClick={() => handleSelect(opt)}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
