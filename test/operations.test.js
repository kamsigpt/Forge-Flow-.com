import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendAuditTrail,
  buildOperationalIssues,
  canTransitionStatus,
  computeCapacity,
  computeMaterialShortages,
  computeOperationsSnapshot,
  getInventoryHealth,
  getManufacturingProgress,
  toNumber,
  validateModuleRecord
} from '../js/operations.js';

const inventory = {
  'RM-1': { desc: 'Aluminium Sheet 2mm', uom: 'SHT', stock: 12, minStock: 50, reorderQty: 100, cost: 8.5 },
  'RM-2': { desc: 'Solvent Chemical A', uom: 'L', stock: 0, minStock: 10, cost: 2 },
  'RM-3': { desc: 'Steel Rod 10mm', uom: 'M', stock: 340, minStock: 100, cost: 0.2 }
};

const mfg = {
  'MFG-1': {
    product: 'Frame Kit',
    qty: 50,
    targetDate: '2026-03-20',
    status: 'In Production',
    priority: 'High',
    materials: [
      { material: 'Aluminium Sheet 2mm', uom: 'SHT', qty: 2, wastage: 3.5 },
      { material: 'Steel Rod 10mm', uom: 'M', qty: 0.5, wastage: 2 }
    ]
  },
  'MFG-2': {
    product: 'Old Frame Kit',
    qty: 100,
    targetDate: '2026-01-01',
    status: 'Delivered',
    materials: [
      { material: 'Aluminium Sheet 2mm', uom: 'SHT', qty: 2, wastage: 0 }
    ]
  }
};

test('toNumber parses formatted quantities and falls back safely', () => {
  assert.equal(toNumber('1,200 PCS'), 1200);
  assert.equal(toNumber('$8.50'), 8.5);
  assert.equal(toNumber('not a number', 7), 7);
  assert.equal(toNumber(undefined), 0);
});

test('getInventoryHealth classifies stock and computes available quantity', () => {
  const health = getInventoryHealth(inventory);
  const aluminium = health.find(item => item.id === 'RM-1');
  const solvent = health.find(item => item.id === 'RM-2');
  const steel = health.find(item => item.id === 'RM-3');
  assert.equal(aluminium.status, 'below_reorder');
  assert.equal(aluminium.shortageToMinimum, 38);
  assert.equal(solvent.status, 'out_of_stock');
  assert.equal(steel.status, 'sufficient');
  assert.equal(aluminium.available, 12);
});

test('computeMaterialShortages uses BOM quantity, wastage and open orders only', () => {
  const shortages = computeMaterialShortages(mfg, inventory);
  assert.equal(shortages.length, 1);
  const aluminium = shortages[0];
  assert.equal(aluminium.material, 'Aluminium Sheet 2mm');
  assert.equal(aluminium.required, 103.5);
  assert.equal(aluminium.available, 12);
  assert.equal(aluminium.shortage, 91.5);
  assert.deepEqual(aluminium.orderIds, ['MFG-1']);
});

test('getManufacturingProgress reports completion, rejection and lateness', () => {
  const progress = getManufacturingProgress({
    qty: 100,
    producedQty: 40,
    rejectedQty: 5,
    targetDate: '2026-03-01',
    status: 'In Production'
  }, new Date('2026-03-05T12:00:00'));
  assert.equal(progress.acceptedQty, 35);
  assert.equal(progress.remainingQty, 60);
  assert.equal(progress.progressPercent, 35);
  assert.equal(progress.isLate, true);
  assert.equal(progress.daysLate, 4);
});

test('manufacturing lifecycle rejects invalid status jumps', () => {
  assert.equal(canTransitionStatus('mfg', 'Pending', 'Approved').allowed, true);
  assert.equal(canTransitionStatus('mfg', 'Approved', 'In Production').allowed, true);
  assert.equal(canTransitionStatus('mfg', 'Pending', 'Delivered').allowed, false);
  assert.equal(canTransitionStatus('mfg', 'Delivered', 'In Production').allowed, false);
  assert.equal(canTransitionStatus('mfg', 'Unknown', 'In Production').allowed, false);
  assert.equal(canTransitionStatus('mfg', 'In Production', 'In Production').allowed, true);
});

test('validateModuleRecord requires operational fields', () => {
  const errors = validateModuleRecord('mfg', { product: '', qty: 0, targetDate: '' });
  assert.deepEqual(errors.map(error => error.field), ['product', 'qty', 'targetDate']);
  const inventoryErrors = validateModuleRecord('inventory', { desc: 'Sheet', stock: -1, minStock: 5 });
  assert.deepEqual(inventoryErrors.map(error => error.field), ['stock']);
});

test('production quantities cannot exceed planned output or rejected output', () => {
  const errors = validateModuleRecord('mfg', {
    product: 'Frame Kit', qty: 10, producedQty: 11, rejectedQty: 12,
    targetDate: '2026-03-20', status: 'In Production'
  });
  assert.deepEqual(errors.map(error => error.field), ['producedQty', 'rejectedQty']);
});

test('appendAuditTrail records changes and caps history', () => {
  const previous = { name: 'A', qty: 1 };
  const next = { name: 'A', qty: 2, auditTrail: [] };
  const trail = appendAuditTrail(previous, next, {
    action: 'updated',
    actor: 'tester',
    at: '2026-03-01T00:00:00.000Z'
  });
  assert.equal(trail.length, 1);
  assert.deepEqual(trail[0].changes.qty, { from: 1, to: 2 });
  assert.equal(trail[0].actor, 'tester');

  let history = [];
  for (let i = 0; i < 40; i++) {
    history = appendAuditTrail({ n: i }, { n: i + 1, auditTrail: history });
  }
  assert.equal(history.length, 25);
});

test('computeCapacity identifies busy machines and paused work', () => {
  const capacity = computeCapacity({
    a: { status: 'In Progress', machine: 'CNC 1' },
    b: { status: 'In Progress', machine: 'CNC 1' },
    c: { status: 'Paused', machine: 'Laser 1' },
    d: { status: 'Pending', machine: 'Press 1' }
  });
  assert.equal(capacity.activeOperations, 3);
  assert.equal(capacity.busyMachines, 1);
  assert.equal(capacity.pausedOperations.length, 1);
  assert.equal(capacity.pendingOperations, 1);
});

test('buildOperationalIssues surfaces stock, shortage, delay and overdue maintenance', () => {
  const issues = buildOperationalIssues({
    mfg,
    inventory,
    maintenance: {
      'MNT-1': {
        machine: 'CNC Router',
        issue: 'Bearing failure',
        status: 'Pending',
        severity: 'Critical',
        estEndDate: '2026-03-01'
      }
    },
    operations: {
      'OP-1': { stage: 'Cutting', machine: 'CNC Router', status: 'Paused' }
    },
    now: new Date('2026-03-25T12:00:00')
  });
  const kinds = new Set(issues.map(issue => issue.kind));
  assert.equal(kinds.has('inventory_out'), true);
  assert.equal(kinds.has('inventory_low'), true);
  assert.equal(kinds.has('material_shortage'), true);
  assert.equal(kinds.has('production_delayed'), true);
  assert.equal(kinds.has('maintenance_overdue'), true);
  assert.equal(kinds.has('operation_paused'), true);
  assert.equal(issues[0].severity, 'critical');
});

test('computeOperationsSnapshot returns a coherent dashboard view', () => {
  const snapshot = computeOperationsSnapshot({
    inventory,
    mfg,
    maintenance: {
      'MNT-1': { machine: 'CNC Router', status: 'Pending', severity: 'High', estEndDate: '2026-03-01' }
    },
    operations: { 'OP-1': { stage: 'Cutting', machine: 'CNC Router', status: 'In Progress' } }
  }, new Date('2026-03-25T12:00:00'));
  assert.equal(snapshot.lowStock.length, 2);
  assert.equal(snapshot.shortages.length, 1);
  assert.equal(snapshot.delayedOrders.length, 1);
  assert.equal(snapshot.maintenanceDue.length, 1);
  assert.equal(snapshot.capacity.busyMachines, 1);
  assert.equal(snapshot.issues.length > 0, true);
});
