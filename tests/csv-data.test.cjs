const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../csv-data.js');
test('native CSV preserves mixed lease terms, blanks, commas and multiline notes',()=>{
  const h=['ID','LeaseMonths','Notes','Empty'];
  const rows=[['A','12','one, two',''],['B','Minimum 8 months','first\nsecond "quoted"',''],['C','Month-to-month','','']];
  const csv=CsvData.stringify(h,rows),parsed=CsvData.read('\uFEFF'+csv);
  assert.deepEqual(parsed,{header:h,rows});
  assert.equal(CsvData.objects(csv)[1].LeaseMonths,'Minimum 8 months');
  assert.equal(CsvData.objects(csv)[1]._RowNumber,3);
});
test('incomplete CSV is not accepted as a valid snapshot',()=>{
  assert.throws(()=>CsvData.read('ID,Notes\nA,"partial'),/Incomplete CSV/);
});
