// Builds a windowed page list like: 1 ... 4 5 [6] 7 8 ... 20
function buildPageWindow(page, pageCount) {
  const window = 2;
  const pages = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || (i >= page - window && i <= page + window)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }
  return pages;
}

export default function Pagination({ page, pageCount, onChange }) {
  if (pageCount <= 1) return null;

  const pages = buildPageWindow(page, pageCount);

  return (
    <div className="pagination">
      <button
        className="pagination__btn"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        ‹ ก่อนหน้า
      </button>

      <div className="pagination__pages">
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="pagination__ellipsis">…</span>
          ) : (
            <button
              key={p}
              className={`pagination__page ${p === page ? 'pagination__page--active' : ''}`}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          )
        )}
      </div>

      <button
        className="pagination__btn"
        disabled={page === pageCount}
        onClick={() => onChange(page + 1)}
      >
        ถัดไป ›
      </button>
    </div>
  );
}
