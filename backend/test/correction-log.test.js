const test = require('node:test');
const assert = require('node:assert/strict');
const { correctionEntry } = require('../correctionLog');

test('history preserves changed values and ignores timestamps', () => {
  const entry = correctionEntry({ id: '9007199254740993', contract_id: 2, action: 'UPDATE',
    before_data: { contract_name: 'Old', cost_amount: 32500, note: 'text', updated_at: 'old' },
    after_data: { contract_name: 'New', cost_amount: 325000, note: '', updated_at: 'new' } });
  assert.equal(entry.id, '9007199254740993');
  assert.equal(entry.contract_name, 'New');
  assert.deepEqual(entry.changes.find(c => c.field === 'cost_amount'), { field: 'cost_amount', before: 32500, after: 325000 });
  assert.equal(entry.changes.length, 3);
});
test('deleted contracts keep their historical name', () => {
  const entry = correctionEntry({ id: 1, contract_id: 2, action: 'DELETE',
    before_data: { contract_name: 'Deleted contract', cost_amount: 0 }, after_data: null });
  assert.equal(entry.contract_name, 'Deleted contract');
  assert(entry.changes.every(c => c.after === null));
});
