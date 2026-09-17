export default function ConfirmDialog({ message, confirmLabel = 'ตกลง', cancelLabel = 'ยกเลิก', danger, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal--narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>ยืนยันการลบข้อมูล</h2>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        <div className="contract-form">
          <p style={{ margin: '0 0 20px', fontSize: '13.5px', color: 'var(--ink)' }}>{message}</p>

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onCancel}>{cancelLabel}</button>
            <button
              type="button"
              className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
