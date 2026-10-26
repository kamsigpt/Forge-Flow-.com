const CLOSED_MFG_STATUSES = ['Delivered', 'Completed', 'Cancelled', 'Rejected', 'Shipped'];
const CLOSED_MAINTENANCE_STATUSES = ['Completed', 'Resolved', 'Cancelled', 'Rejected'];

const MFG_STATUSES = [
  'Pending', 'Approved', 'In Production', 'Packed', 'Shipped', 'Delivered',
  'Completed', 'On Hold', 'Rejected', 'Cancelled'
];
const MAINTENANCE_STATUSES = [
  'Pending', 'Approved', 'Scheduled', 'In Progress', 'On Hold',
  'Completed', 'Resolved', 'Rejected', 'Cancelled'
];

const TRANSITIONS = {
  mfg: {
    Pending: ['Approved', 'On Hold', 'Cancelled'],
    Approved: ['In Production', 'On Hold', 'Cancelled'],
    'In Production': ['Packed', 'Completed', 'On Hold', 'Cancelled'],
    Packed: ['Shipped', 'On Hold', 'Cancelled'],
    Shipped: ['Delivered', 'Completed'],
    Delivered: [],
    Completed: [],
    'On Hold': ['Approved', 'In Production', 'Cancelled'],
    Rejected: ['Cancelled'],
    Cancelled: []
  },
  maintenance: {
    Pending: ['Approved', 'Scheduled', 'In Progress', 'Rejected', 'Cancelled'],
    Approved: ['Scheduled', 'In Progress', 'Rejected', 'Cancelled'],
    Scheduled: ['In Progress', 'Completed', 'Resolved', 'Cancelled'],
    'In Progress': ['Completed', 'Resolved', 'On Hold', 'Cancelled'],
    'On Hold': ['In Progress', 'Cancelled'],
    Completed: [],
    Resolved: [],
    Rejected: ['Cancelled'],
    Cancelled: []
  },
  sales: {
    Quote: ['Pending MFG', 'Cancelled'],
    'Pending MFG': ['In Production', 'Cancelled'],
    'In Production': ['Packed', 'Shipped', 'Cancelled'],
    Packed: ['Shipped', 'Delivered'],
    Shipped: ['Delivered'],
    Delivered: [],
    Cancelled: []
  },
  operations: {
    Pending: ['In Progress', 'Cancelled'],
    'In Progress': ['Paused', 'Completed', 'Cancelled'],
    Paused: ['In Progress', 'Cancelled'],
    Completed: [],
    Cancelled: []
  }
};

export function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return fallback;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeStatus(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function parseDateValue(value, endOfDay = false) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value);
  const text = String(value).trim();
  if (!text) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const parsed = new Date(dateOnly ? `${text}T${endOfDay ? '23:59:59' : '00:00:00'}` : text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function asRecordList(value) {
  if (Array.isArray(value)) {
    return value.filter(item => item && typeof item === 'object').map((item, index) => ({
      ...item,
      id: item.id || String(index)
    }));
  }
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value)
    .filter(([, item]) => item && typeof item === 'object')
    .map(([id, item]) => ({ ...item, id: item.id || id }));
}

export function isOpenManufacturing(order) {
  return !CLOSED_MFG_STATUSES.includes(normalizeStatus(order?.status));
}

export function isOpenMaintenance(record) {
  return !CLOSED_MAINTENANCE_STATUSES.includes(normalizeStatus(record?.status));
}

export function getInventoryHealth(inventory) {
  return asRecordList(inventory).map(item => {
    const stock = Math.max(0, toNumber(item.stock ?? item.quantity ?? item.qty));
    const reserved = Math.max(0, toNumber(item.reserved ?? item.reservedQty ?? item.allocated));
    const available = Math.max(0, stock - reserved);
    const minStock = Math.max(0, toNumber(item.minStock ?? item.reorderLevel));
    const reorderQty = Math.max(0, toNumber(item.reorderQty ?? item.reorderQuantity));
    const unit = item.uom || item.unit || 'units';
    const cost = Math.max(0, toNumber(item.cost ?? item.unitCost));
    const status = stock <= 0 ? 'out_of_stock' : (stock < minStock ? 'below_reorder' : 'sufficient');
    return {
      id: item.id,
      name: item.desc || item.description || item.name || item.material || item.id,
      sku: item.code || item.sku || item.id,
      unit,
      stock,
      reserved,
      available,
      minStock,
      reorderQty,
      shortageToMinimum: Math.max(0, minStock - stock),
      value: stock * cost,
      status
    };
  });
}

export function getManufacturingProgress(order, now = new Date()) {
  const plannedQty = Math.max(0, toNumber(order?.qty ?? order?.quantity ?? order?.plannedQty));
  const producedQty = Math.min(plannedQty, Math.max(0, toNumber(order?.producedQty ?? order?.completedQty)));
  const rejectedQty = Math.min(producedQty, Math.max(0, toNumber(order?.rejectedQty ?? order?.scrapQty)));
  const acceptedQty = Math.max(0, producedQty - rejectedQty);
  const remainingQty = Math.max(0, plannedQty - producedQty);
  const progressPercent = plannedQty > 0
    ? Math.min(100, Math.round((acceptedQty / plannedQty) * 1000) / 10)
    : 0;
  const status = normalizeStatus(order?.status);
  const terminal = CLOSED_MFG_STATUSES.includes(status);
  const targetDate = parseDateValue(order?.targetDate, true);
  const completeByProgress = plannedQty > 0 && progressPercent >= 100;
  const isComplete = terminal || completeByProgress;
  const daysLate = targetDate && !isComplete && now > targetDate
    ? Math.max(1, Math.ceil((now.getTime() - targetDate.getTime()) / 86400000))
    : 0;
  return {
    plannedQty,
    producedQty,
    rejectedQty,
    acceptedQty,
    remainingQty,
    progressPercent,
    status,
    isComplete,
    isLate: daysLate > 0,
    daysLate
  };
}

export function canTransitionStatus(moduleKey, fromStatus, toStatus) {
  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(toStatus);
  if (!from || !to) {
    return { allowed: false, reason: 'Both current and next status are required.' };
  }
  if (from === to) return { allowed: true, reason: '' };
  const map = TRANSITIONS[moduleKey];
  if (!map) return { allowed: true, reason: '' };
  if (!map[from]) {
    return {
      allowed: false,
      reason: `${from} is not a recognised ${moduleKey} status.`
    };
  }
  if ((map[from] || []).includes(to)) return { allowed: true, reason: '' };
  return {
    allowed: false,
    reason: `${from} cannot move directly to ${to}.`
  };
}

export function validateModuleRecord(moduleKey, record) {
  const errors = [];
  const push = (field, message) => errors.push({ field, message });
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return [{ field: 'record', message: 'Record data must be an object.' }];
  }

  if (moduleKey === 'mfg') {
    if (!normalizeStatus(record.product)) push('product', 'Product is required.');
    if (toNumber(record.qty) <= 0) push('qty', 'Quantity must be greater than zero.');
    if (!parseDateValue(record.targetDate)) push('targetDate', 'A valid target completion date is required.');
    if (record.status && !MFG_STATUSES.includes(normalizeStatus(record.status))) {
      push('status', 'Manufacturing status is not recognised.');
    }
    if (toNumber(record.producedQty) < 0 || toNumber(record.rejectedQty) < 0) {
      push('producedQty', 'Produced and rejected quantities cannot be negative.');
    }
    const planned = toNumber(record.qty);
    const produced = toNumber(record.producedQty);
    const rejected = toNumber(record.rejectedQty);
    if (produced > planned) push('producedQty', 'Produced quantity cannot exceed the planned quantity.');
    if (rejected > produced) push('rejectedQty', 'Rejected quantity cannot exceed produced quantity.');
  }

  if (moduleKey === 'inventory') {
    if (!normalizeStatus(record.desc ?? record.description)) push('desc', 'Item description is required.');
    if (toNumber(record.stock) < 0) push('stock', 'Stock cannot be negative.');
    if (toNumber(record.minStock) < 0) push('minStock', 'Minimum stock cannot be negative.');
    if (toNumber(record.reorderQty) < 0) push('reorderQty', 'Reorder quantity cannot be negative.');
    if (toNumber(record.cost) < 0) push('cost', 'Unit cost cannot be negative.');
  }

  if (moduleKey === 'sales') {
    if (!normalizeStatus(record.customer)) push('customer', 'Customer is required.');
    if (!normalizeStatus(record.product)) push('product', 'Product is required.');
    if (toNumber(record.qty) <= 0) push('qty', 'Quantity must be greater than zero.');
    if (toNumber(record.price) < 0) push('price', 'Unit price cannot be negative.');
  }

  if (moduleKey === 'pr') {
    if (!normalizeStatus(record.material)) push('material', 'Material is required.');
    if (toNumber(record.qty) <= 0) push('qty', 'Quantity must be greater than zero.');
    if (toNumber(record.cost) < 0) push('cost', 'Unit cost cannot be negative.');
  }

  if (moduleKey === 'maintenance') {
    if (!normalizeStatus(record.machine)) push('machine', 'Machine is required.');
    if (!normalizeStatus(record.issue)) push('issue', 'Issue description is required.');
    if (record.reportedDate && !parseDateValue(record.reportedDate)) {
      push('reportedDate', 'Reported date is invalid.');
    }
    if (record.estEndDate && !parseDateValue(record.estEndDate)) {
      push('estEndDate', 'Estimated end date is invalid.');
    }
    if (record.status && !MAINTENANCE_STATUSES.includes(normalizeStatus(record.status))) {
      push('status', 'Maintenance status is not recognised.');
    }
  }

  if (moduleKey === 'operations') {
    if (!normalizeStatus(record.mfgRef)) push('mfgRef', 'Manufacturing reference is required.');
    if (!normalizeStatus(record.stage)) push('stage', 'Operation stage is required.');
    if (toNumber(record.qty) <= 0) push('qty', 'Operation quantity must be greater than zero.');
  }

  return errors;
}

function safeAuditValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return `[${value.length} item${value.length === 1 ? '' : 's'}]`;
  const text = String(value);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

export function appendAuditTrail(previous, next, meta = {}) {
  const priorTrail = Array.isArray(previous?.auditTrail)
    ? previous.auditTrail
    : (Array.isArray(next?.auditTrail) ? next.auditTrail : []);
  const trail = priorTrail.slice(-24);
  const changes = {};
  const ignored = new Set([
    'auditTrail', 'updatedAt', 'createdAt', 'lastViewedAt', 'ui'
  ]);
  const keys = new Set([
    ...Object.keys(previous || {}),
    ...Object.keys(next || {})
  ]);
  keys.forEach(key => {
    if (ignored.has(key)) return;
    const before = previous?.[key];
    const after = next?.[key];
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    changes[key] = { from: safeAuditValue(before), to: safeAuditValue(after) };
  });
  const action = meta.action || (previous ? 'updated' : 'created');
  if (action === 'updated' && Object.keys(changes).length === 0) return trail;
  trail.push({
    at: meta.at || new Date().toISOString(),
    action,
    actor: meta.actor || 'system',
    summary: meta.summary || '',
    changes
  });
  return trail.slice(-25);
}

export function computeMaterialShortages(mfgRecords, inventoryRecords, options = {}) {
  const inventory = getInventoryHealth(inventoryRecords);
  const byName = new Map(inventory.map(item => [item.name.trim().toLowerCase(), item]));
  const requirements = new Map();
  const includeClosed = options.includeClosed === true;

  asRecordList(mfgRecords).forEach(order => {
    if (!includeClosed && !isOpenManufacturing(order)) return;
    const orderQty = Math.max(0, toNumber(order.qty ?? order.quantity));
    if (orderQty <= 0) return;
    (Array.isArray(order.materials) ? order.materials : []).forEach(line => {
      const name = normalizeStatus(line.material || line.name);
      const qtyPerUnit = Math.max(0, toNumber(line.qty ?? line.qtyPerUnit));
      if (!name || qtyPerUnit <= 0) return;
      const wastage = Math.max(0, toNumber(line.wastage)) / 100;
      const key = `${name.toLowerCase()}::${normalizeStatus(line.uom || line.unit).toLowerCase()}`;
      const current = requirements.get(key) || {
        material: name,
        unit: line.uom || line.unit || 'units',
        required: 0,
        orderIds: []
      };
      current.required += qtyPerUnit * orderQty * (1 + wastage);
      if (!current.orderIds.includes(order.id)) current.orderIds.push(order.id);
      requirements.set(key, current);
    });
  });

  return Array.from(requirements.values()).map(item => {
    const inventoryItem = byName.get(item.material.toLowerCase());
    const available = inventoryItem ? inventoryItem.available : null;
    const shortage = available === null ? null : Math.max(0, item.required - available);
    const coveragePercent = available === null || item.required <= 0
      ? null
      : Math.round((available / item.required) * 100);
    return {
      ...item,
      required: Math.round(item.required * 100) / 100,
      available,
      shortage: shortage === null ? null : Math.round(shortage * 100) / 100,
      coveragePercent,
      inventoryId: inventoryItem?.id || null,
      status: shortage === null
        ? 'unmatched'
        : (shortage > 0 ? (available <= 0 ? 'out_of_stock' : 'shortage') : 'covered')
    };
  })
    .filter(item => item.status === 'shortage' || item.status === 'out_of_stock')
    .sort((a, b) => (b.shortage || 0) - (a.shortage || 0));
}

export function computeCapacity(operations) {
  const records = asRecordList(operations);
  const active = records.filter(op => ['In Progress', 'Paused'].includes(normalizeStatus(op.status)));
  const busyMachines = new Set(
    active
      .filter(op => normalizeStatus(op.status) === 'In Progress')
      .map(op => normalizeStatus(op.machine).toLowerCase())
      .filter(Boolean)
  );
  const pending = records.filter(op => normalizeStatus(op.status) === 'Pending');
  const paused = records.filter(op => normalizeStatus(op.status) === 'Paused');
  return {
    activeOperations: active.length,
    busyMachines: busyMachines.size,
    pendingOperations: pending.length,
    pausedOperations: paused,
    delayedOperations: active.filter(op => {
      const start = parseDateValue(op.scheduledStart);
      return start && start < new Date() && normalizeStatus(op.actualTime) === '';
    }).length
  };
}

export function buildOperationalIssues({ mfg, inventory, maintenance, operations, now = new Date() } = {}) {
  const issues = [];
  const add = issue => issues.push({
    id: issue.id || `${issue.sourceType}:${issue.sourceId}:${issue.kind}`,
    severity: issue.severity || 'warning',
    ...issue
  });

  getInventoryHealth(inventory).forEach(item => {
    if (item.status === 'out_of_stock') {
      add({
        kind: 'inventory_out',
        severity: 'critical',
        title: `Out of stock: ${item.name}`,
        description: `0 ${item.unit} on hand. Minimum stock is ${item.minStock} ${item.unit}.`,
        sourceType: 'inventory',
        sourceId: item.id,
        moduleId: 'inventory',
        actionLabel: 'Open inventory'
      });
    } else if (item.status === 'below_reorder') {
      add({
        kind: 'inventory_low',
        severity: item.stock <= item.minStock * 0.5 ? 'critical' : 'warning',
        title: `Low stock: ${item.name}`,
        description: `${item.stock} ${item.unit} on hand. Reorder point is ${item.minStock} ${item.unit}.`,
        sourceType: 'inventory',
        sourceId: item.id,
        moduleId: 'inventory',
        actionLabel: 'Review stock'
      });
    }
  });

  computeMaterialShortages(mfg, inventory).forEach(shortage => {
    add({
      kind: 'material_shortage',
      severity: shortage.available <= 0 ? 'critical' : 'warning',
      title: `Material shortage: ${shortage.material}`,
      description: `MRP needs ${shortage.required} ${shortage.unit}; ${shortage.available ?? 0} ${shortage.unit} available.`,
      sourceType: 'inventory',
      sourceId: shortage.inventoryId || shortage.material,
      moduleId: 'purchase',
      actionLabel: 'Raise purchase request'
    });
  });

  asRecordList(mfg).forEach(order => {
    const progress = getManufacturingProgress(order, now);
    if (progress.isLate) {
      const priority = normalizeStatus(order.priority);
      add({
        kind: 'production_delayed',
        severity: (priority === 'Urgent' || progress.daysLate > 3) ? 'critical' : 'warning',
        title: `Production delayed: ${order.product || order.id}`,
        description: `${order.id} is ${progress.daysLate} day${progress.daysLate === 1 ? '' : 's'} past its target date (${order.targetDate}).`,
        sourceType: 'mfg',
        sourceId: order.id,
        moduleId: 'manufacturing',
        actionLabel: 'Open order'
      });
    }
  });

  asRecordList(maintenance).forEach(record => {
    if (!isOpenMaintenance(record)) return;
    const due = parseDateValue(record.estEndDate, true);
    if (!due || due >= now) return;
    const severity = ['Critical', 'High'].includes(normalizeStatus(record.severity)) ? 'critical' : 'warning';
    add({
      kind: 'maintenance_overdue',
      severity,
      title: `Maintenance overdue: ${record.machine || record.id}`,
      description: `${record.id} was due ${record.estEndDate}. ${record.issue || ''}`.trim(),
      sourceType: 'maintenance',
      sourceId: record.id,
      moduleId: 'maintenance',
      actionLabel: 'Open maintenance'
    });
  });

  computeCapacity(operations).pausedOperations.forEach(() => {});
  asRecordList(operations)
    .filter(op => normalizeStatus(op.status) === 'Paused')
    .forEach(op => {
      add({
        kind: 'operation_paused',
        severity: 'warning',
        title: `Operation paused: ${op.stage || op.id}`,
        description: `${op.machine || op.product || op.id} is paused and may block downstream work.`,
        sourceType: 'operations',
        sourceId: op.id,
        moduleId: 'workops',
        actionLabel: 'Open operation'
      });
    });

  const severityRank = { critical: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => {
    const severity = (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9);
    if (severity !== 0) return severity;
    return String(a.title).localeCompare(String(b.title));
  });
}

export function computeOperationsSnapshot(data = {}, now = new Date()) {
  const inventory = asRecordList(data.inventory);
  const mfg = asRecordList(data.mfg);
  const maintenance = asRecordList(data.maintenance);
  const operations = asRecordList(data.operations);
  const health = getInventoryHealth(inventory);
  const shortages = computeMaterialShortages(mfg, inventory);
  const delayedOrders = mfg
    .map(order => ({ order, progress: getManufacturingProgress(order, now) }))
    .filter(entry => entry.progress.isLate)
    .sort((a, b) => b.progress.daysLate - a.progress.daysLate);
  const maintenanceDue = maintenance
    .filter(isOpenMaintenance)
    .map(record => ({ record, due: parseDateValue(record.estEndDate, true) }))
    .filter(entry => entry.due && entry.due < now)
    .sort((a, b) => a.due - b.due);
  const issues = buildOperationalIssues({ mfg, inventory, maintenance, operations, now });

  return {
    inventoryHealth: health,
    lowStock: health.filter(item => item.status !== 'sufficient'),
    shortages,
    delayedOrders,
    maintenanceDue,
    capacity: computeCapacity(operations),
    issues,
    criticalIssueCount: issues.filter(issue => issue.severity === 'critical').length
  };
}

export const OPERATIONS_CONSTANTS = {
  CLOSED_MFG_STATUSES,
  CLOSED_MAINTENANCE_STATUSES,
  MFG_STATUSES,
  MAINTENANCE_STATUSES,
  TRANSITIONS
};
