function correctionEntry(row) {
  const before = row.before_data || {};
  const after = row.after_data || {};
  const ignored = new Set(['id', 'created_at', 'updated_at']);
  const changes = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(field => !ignored.has(field) && JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null))
    .map(field => ({ field, before: before[field] ?? null, after: after[field] ?? null }));
  return { id: String(row.id), contract_id: row.contract_id,
    contract_name: after.contract_name || before.contract_name || `สัญญา #${row.contract_id}`,
    action: row.action, actor_name: row.actor_name, created_at: row.created_at, changes };
}
module.exports = { correctionEntry };
