import { supabase, signOut } from './supabase.js';

console.log('Module import successful');

// ============ USER DATA HELPERS ============
let currentAuthUser = null;
let currentAuthProfile = null;
let currentCompanyId = null;

function getForgeflowUser() {
  return JSON.parse(localStorage.getItem('forgeflow_user') || 'null');
}

function setForgeflowUser(user) {
  localStorage.setItem('forgeflow_user', JSON.stringify(user));
}

function redirectToLogin() {
  window.location.href = 'index.html';
}

async function fetchUserProfile(authUserId) {
  const { data, error } = await supabase
    .from('users')
    .select('id,auth_id,company_id,first_name,last_name,email,role,companies(id,name)')
    .eq('auth_id', authUserId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

// ============ CHECK AUTH ON APP LOAD ============
async function checkAppAuth() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (!session || error) return null;

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return null;

    let profile = null;
    try {
      profile = await fetchUserProfile(user.id);
    } catch (profileError) {
      // Keep users in-app when auth is valid but profile/bootstrap queries fail temporarily.
      console.warn('Profile fetch failed, continuing with auth session:', profileError);
    }

    currentAuthUser = user;
    currentAuthProfile = profile;
    currentCompanyId = profile?.company_id || null;

    return { user, profile };
  } catch (e) {
    console.error('Auth check failed:', e);
    return null;
  }
}

// ============ UPDATE USER UI ============
async function updateUserUI() {
  const authResult = await checkAppAuth();

  if (!authResult) {
    redirectToLogin();
    return;
  }

  const user = authResult.user;
  const profile = authResult.profile;
  const existingUser = getForgeflowUser() || {};
  const firstName = profile?.first_name || user.user_metadata?.first_name || '';
  const lastName = profile?.last_name || user.user_metadata?.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim() || user.email || 'User';
  const initials = (firstName[0] || user.email?.[0] || 'U').toUpperCase() +
    (lastName[0] || '').toUpperCase();
  const email = profile?.email || user.email || '';
  const planLabel = existingUser.planLabel || 'PROFESSIONAL';
  const planName = existingUser.planName || 'Professional';

  const normalizedUser = {
    ...existingUser,
    id: user.id,
    email,
    firstName,
    lastName,
    first_name: firstName,
    last_name: lastName,
    fullName,
    company_id: profile?.company_id || null,
    company_name: profile?.companies?.name || user.user_metadata?.company_name || '',
    role: profile?.role || 'operator',
    initials,
    planLabel,
    planName
  };

  setForgeflowUser(normalizedUser);
  applyUser(normalizedUser);
}

// ============ AUTH STATE LISTENER ============
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    redirectToLogin();
  }
})

// ============ APPEARANCE SETTINGS ============
function loadAppearanceSettings() {
  const saved = localStorage.getItem('forgeflow_appearance');
  if (saved) {
    const settings = JSON.parse(saved);
    
    document.querySelectorAll('.theme-option').forEach(o => {
      o.classList.toggle('active', o.dataset.theme === settings.theme);
    });
    
    if (settings.accentColor) {
      document.querySelectorAll('.color-option').forEach(o => {
        const oColor = o.style.background.toLowerCase().replace(/ /g, '');
        const sColor = (settings.accentColor || '').toLowerCase().replace(/ /g, '');
        o.classList.toggle('active', oColor === sColor);
      });
      applyAccentColor(settings.accentColor);
    }
    
    const compactToggle = document.getElementById('toggle-compact');
    const fixedToggle = document.getElementById('toggle-fixed-sidebar');
    const iconsToggle = document.getElementById('toggle-icons-only');
    
    if (compactToggle) compactToggle.checked = settings.compactMode;
    if (fixedToggle) fixedToggle.checked = settings.fixedSidebar;
    if (iconsToggle) iconsToggle.checked = settings.iconsOnly;
    
    applyAppearanceSettings(settings);
  } else {
    applyTheme('system');
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function checkModuleAccess(moduleId) {
  const navItem = document.querySelector(`.sidebar-nav-item[onclick*="showModule('${moduleId}'"]`);
  if (!navItem) return { hasAccess: true };
  
  const requiredPlans = navItem.getAttribute('data-plan-required');
  if (!requiredPlans) return { hasAccess: true };
  
  const userPlanKey = planLabels[getForgeflowUser()?.planLabel] || 'trial';
  const userLevel = planHierarchy[userPlanKey] || 1;
  
  const plans = requiredPlans.split(',');
  
  for (const plan of plans) {
    const planLevel = planHierarchy[plan.trim()] || 0;
    if (userLevel >= planLevel) {
      return { hasAccess: true };
    }
  }
  
  const upgradeTo = navItem.getAttribute('data-upgrade-to') || 'professional';
  return {
    hasAccess: false,
    upgradeTo: upgradeTo,
    requiredPlan: plans[0]
  };
}

function showUpgradeModal(moduleName, upgradeToPlan) {
  const modal = document.getElementById('planUpgradeModal');
  if (!modal) {
    createUpgradeModal();
    return showUpgradeModal(moduleName, upgradeToPlan);
  }
  
  const planName = getPlanName(upgradeToPlan);
  const moduleEl = modal.querySelector('.upgrade-module-name');
  const planEl = modal.querySelector('.upgrade-plan-name');
  
  if (moduleEl) moduleEl.textContent = moduleName;
  if (planEl) planEl.textContent = planName;
  
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function applyAppearanceSettings(settings) {
  if (settings.theme) {
    applyTheme(settings.theme);
  }
  
  const appLayout = document.querySelector('.app-layout');
  const sidebar = document.querySelector('.sidebar');
  
  if (appLayout) {
    if (settings.compactMode) {
      appLayout.classList.add('compact-mode');
    } else {
      appLayout.classList.remove('compact-mode');
    }
  }
  if (sidebar) {
    if (settings.fixedSidebar) {
      sidebar.classList.add('fixed-sidebar');
    } else {
      sidebar.classList.remove('fixed-sidebar');
    }
    if (settings.iconsOnly) {
      sidebar.classList.add('icons-only');
    } else {
      sidebar.classList.remove('icons-only');
    }
  }
}

function applyNotificationSettings(settings) {
  if (document.getElementById('notifOrderUpdates')) document.getElementById('notifOrderUpdates').checked = settings.orderUpdates;
  if (document.getElementById('notifInventoryAlerts')) document.getElementById('notifInventoryAlerts').checked = settings.inventoryAlerts;
  if (document.getElementById('notifProductionUpdates')) document.getElementById('notifProductionUpdates').checked = settings.productionUpdates;
  if (document.getElementById('notifMaintenanceAlerts')) document.getElementById('notifMaintenanceAlerts').checked = settings.maintenanceAlerts;
  if (document.getElementById('notifDailySummary')) document.getElementById('notifDailySummary').checked = settings.dailySummary;
  if (document.getElementById('notifPushEnabled')) document.getElementById('notifPushEnabled').checked = settings.pushEnabled;
  if (document.getElementById('notifSoundAlerts')) document.getElementById('notifSoundAlerts').checked = settings.soundAlerts;
  if (document.getElementById('notifLowStockThreshold')) document.getElementById('notifLowStockThreshold').value = settings.lowStockThreshold;
  if (document.getElementById('notifCriticalStockThreshold')) document.getElementById('notifCriticalStockThreshold').value = settings.criticalStockThreshold;
  if (document.getElementById('notifProductionDelayAlert')) document.getElementById('notifProductionDelayAlert').value = settings.productionDelayAlert;
  if (document.getElementById('notifMaintenanceDueDays')) document.getElementById('notifMaintenanceDueDays').value = settings.maintenanceDueDays;
}

function loadNotificationSettings() {
  const saved = localStorage.getItem('forgeflow_notifications');
  if (saved) {
    const settings = JSON.parse(saved);
    applyNotificationSettings(settings);
  }
}

function showModule(id, clickedItem) {
  const access = checkModuleAccess(id);
  if (!access.hasAccess) {
    const moduleNames = {
      workops: 'Work Operations',
      maintenance: 'Maintenance',
      integrations: 'Integrations',
      teams: 'Teams & Roles'
    };
    showUpgradeModal(moduleNames[id] || id, access.upgradeTo);
    return;
  }
  
  document.querySelectorAll('.module-view').forEach(v => v.classList.remove('active'));
  const moduleEl = document.getElementById('mod-' + id);
  if (!moduleEl) {
    console.error('Module not found:', id);
    return;
  }
  moduleEl.classList.add('active');

  document.querySelectorAll('.sidebar-nav-item').forEach(i => i.classList.remove('active'));
  if (clickedItem) {
    clickedItem.classList.add('active');
  } else {
    document.querySelectorAll('.sidebar-nav-item').forEach(i => {
      if (i.getAttribute('onclick') && i.getAttribute('onclick').includes("'" + id + "'")) {
        i.classList.add('active');
      }
    });
  }

  const titles = {
    dashboard: 'Dashboard', manufacturing: 'Manufacturing Orders',
    workops: 'Work Operations', inventory: 'Inventory', sales: 'Sales Orders', 
    purchase: 'Purchase Requests', bom: 'Product BOM', uom: 'Unit of Measure',
    suppliers: 'Suppliers', staff: 'Staff', maintenance: 'Maintenance',
    settings: 'Settings', integrations: 'Integrations', teams: 'Teams & Roles'
  };
  const bc = document.getElementById('topbarBreadcrumb');
  if (bc) bc.textContent = titles[id] || id;

  if (id === 'dashboard') {
    setTimeout(initCharts, 100);
  }
  
  if (id === 'settings') {
    document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
    const generalTab = document.querySelector('.settings-nav-item[data-tab="general"]');
    if (generalTab) generalTab.classList.add('active');
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
    const generalPanel = document.getElementById('settings-general');
    if (generalPanel) generalPanel.classList.add('active');
    updateBillingSection();
    updateBillingInfo();
    loadAllSettings();
  }
  
  setTimeout(() => {
    initFilters();
    initTableWrappers();
  }, 50);
}

// ============ MOCK DATA STORE ============
console.log('App.js loading...');
const mockData = {
  mfg: {
    'MFG-0031': { soRef: 'SO-0124', product: 'Aluminium Frame Kit', qty: 50, targetDate: '2026-03-20', supervisor: 'James Okonkwo', priority: 'Normal', warehouse: 'WH-A (Main)', status: 'In Production',
      materials: [
        { material: 'Aluminium Sheet 2mm', uom: 'SHT', qty: 2.0, wastage: 3.5, inStock: '12 âš ' },
        { material: 'Steel Rod 10mm', uom: 'M', qty: 0.5, wastage: 2.0, inStock: '340 âœ“' },
        { material: 'Fastener M6 x 20', uom: 'PCS', qty: 8, wastage: 0, inStock: '1,200 âœ“' },
        { material: 'Packaging Box (Large)', uom: 'PCS', qty: 1, wastage: 0, inStock: '24 âš¡' }
      ],
      stages: [
        { stage: 'Cutting', role: 'CNC Operator', time: '45 min', cost: '$8.00' },
        { stage: 'Forming', role: 'Press Operator', time: '30 min', cost: '$12.00' },
        { stage: 'Assembly', role: 'Assembler', time: '60 min', cost: '$12.00' },
        { stage: 'QA Inspection', role: 'QA Inspector', time: '20 min', cost: '$10.00' },
        { stage: 'Packaging', role: 'General Worker', time: '15 min', cost: '$5.00' }
      ],
      notes: 'Urgent order for Apex Engineering - prioritize cutting stage.'
    },
    'MFG-0030': { soRef: 'SO-0123', product: 'Steel Bracket Assembly', qty: 200, targetDate: '2026-03-25', supervisor: 'Maria Santos', priority: 'High', warehouse: 'WH-A (Main)', status: 'Pending',
      materials: [
        { material: 'Steel Rod 10mm', uom: 'M', qty: 0.5, wastage: 2.0, inStock: '340 âœ“' },
        { material: 'Fastener M6 x 20', uom: 'PCS', qty: 4, wastage: 0, inStock: '1,200 âœ“' }
      ],
      stages: [
        { stage: 'Cutting', role: 'CNC Operator', time: '120 min', cost: '$32.00' },
        { stage: 'Assembly', role: 'Assembler', time: '180 min', cost: '$36.00' }
      ],
      notes: 'Large batch order - schedule in two batches.'
    },
    'MFG-0029': { soRef: 'SO-0121', product: 'Conveyor Belt Unit', qty: 10, targetDate: '2026-03-15', supervisor: 'James Okonkwo', priority: 'Normal', warehouse: 'WH-B (Secondary)', status: 'Packed',
      materials: [
        { material: 'Steel Frame', uom: 'PCS', qty: 2, wastage: 1.0, inStock: '85' },
        { material: 'Belt Rubber', uom: 'M', qty: 1.5, wastage: 2.0, inStock: '120' }
      ],
      stages: [
        { stage: 'Welding', role: 'Welder', time: '60 min', cost: '$40.00' },
        { stage: 'Final Assembly', role: 'Assembler', time: '90 min', cost: '$60.00' }
      ],
      notes: 'Pack and hand off to shipping once QA is complete.'
    },
    'MFG-0028': { soRef: 'SO-0119', product: 'Custom Enclosure Box', qty: 75, targetDate: '2026-03-05', supervisor: 'Maria Santos', priority: 'High', warehouse: 'WH-A (Main)', status: 'Shipped',
      materials: [
        { material: 'Aluminium Sheet 2mm', uom: 'SHT', qty: 1, wastage: 5.0, inStock: '12' },
        { material: 'Powder Coat Paint', uom: 'G', qty: 55, wastage: 8.0, inStock: '2400' }
      ],
      stages: [
        { stage: 'Cutting', role: 'CNC Operator', time: '70 min', cost: '$30.00' },
        { stage: 'Assembly', role: 'Assembler', time: '95 min', cost: '$50.00' }
      ],
      notes: 'Order shipped with carrier tracking.'
    },
    'MFG-0027': { soRef: 'SO-0117', product: 'Aluminium Frame Kit', qty: 30, targetDate: '2026-03-02', supervisor: 'James Okonkwo', priority: 'Normal', warehouse: 'WH-B (Secondary)', status: 'Delivered',
      materials: [
        { material: 'Aluminium Sheet 2mm', uom: 'SHT', qty: 2.0, wastage: 3.5, inStock: '12' },
        { material: 'Fastener M6 x 20', uom: 'PCS', qty: 8, wastage: 0, inStock: '1200' }
      ],
      stages: [
        { stage: 'Cutting', role: 'CNC Operator', time: '40 min', cost: '$16.00' },
        { stage: 'Packaging', role: 'General Worker', time: '20 min', cost: '$8.00' }
      ],
      notes: 'Delivered and closed.'
    }
  },
  bom: {
    'BOM-001': { product: 'Aluminium Frame Kit', version: 'v2.1', wastage: 3.5, outputUom: 'KIT', status: 'Active',
      materials: [
        { material: 'Aluminium Sheet 2mm', uom: 'SHT', qty: 2.0, wastage: 4, notes: 'Main body' },
        { material: 'Steel Rod 10mm', uom: 'M', qty: 0.5, wastage: 2, notes: 'Reinforcement' },
        { material: 'Fastener M6 x 20', uom: 'PCS', qty: 8, wastage: 0, notes: 'Assembly' },
        { material: 'Corner Bracket', uom: 'PCS', qty: 4, wastage: 1, notes: 'Sub-asm #1' },
        { material: 'Powder Coat Paint', uom: 'G', qty: 45, wastage: 8, notes: 'Surface finish' },
        { material: 'Packaging Box (Large)', uom: 'PCS', qty: 1, wastage: 0, notes: 'Packaging' }
      ]
    },
    'BOM-002': { product: 'Steel Bracket Assembly', version: 'v1.3', wastage: 2.0, outputUom: 'PCS', status: 'Active',
      materials: [
        { material: 'Steel Rod 10mm', uom: 'M', qty: 0.3, wastage: 2, notes: 'Main component' },
        { material: 'Fastener M6 x 20', uom: 'PCS', qty: 2, wastage: 0, notes: 'Assembly' },
        { material: 'Washer M6', uom: 'PCS', qty: 2, wastage: 0, notes: 'Fastening' }
      ]
    },
    'BOM-003': { product: 'Conveyor Belt Unit', version: 'v1.0', wastage: 1.5, outputUom: 'UNIT', status: 'Active',
      materials: [
        { material: 'Steel Frame', uom: 'PCS', qty: 2, wastage: 1, notes: 'Main structure' },
        { material: 'Belt Rubber', uom: 'M', qty: 1.5, wastage: 2, notes: 'Conveyor belt' }
      ]
    },
    'BOM-004': { product: 'Custom Enclosure Box', version: 'v1.1', wastage: 4.0, outputUom: 'PCS', status: 'Draft',
      materials: [
        { material: 'Aluminium Sheet 2mm', uom: 'SHT', qty: 1, wastage: 5, notes: 'Main body' }
      ]
    }
  },
  sales: {
    'SO-0124': { customer: 'Apex Engineering Ltd', product: 'Aluminium Frame Kit', qty: 50, price: 82.00, deliveryDate: '2026-03-25', paymentTerms: 'Net 30', status: 'In Production',
      address: '123 Industrial Way, Apex City, AC 12345' },
    'SO-0123': { customer: 'Global Fabrications Co', product: 'Steel Bracket Assembly', qty: 200, price: 18.50, deliveryDate: '2026-03-28', paymentTerms: 'Net 30', status: 'Pending MFG',
      address: '456 Factory Rd, Global Town, GT 67890' },
    'SO-0122': { customer: 'TechForm Industries', product: 'Custom Enclosure Box', qty: 100, price: 29.00, deliveryDate: '2026-04-05', paymentTerms: 'Net 60', status: 'Quote',
      address: '789 Tech Park, Innovation City, IC 11111' },
    'SO-0121': { customer: 'ProFab Solutions', product: 'Conveyor Belt Unit', qty: 10, price: 520.00, deliveryDate: '2026-03-15', paymentTerms: 'Immediate', status: 'Packed',
      address: '321 Fab Street, Profab Town, PT 22222' },
    'SO-0120': { customer: 'Northern Steel Ltd', product: 'Aluminium Frame Kit', qty: 30, price: 95.33, deliveryDate: '2026-03-10', paymentTerms: 'Net 30', status: 'Delivered',
      address: '654 Northern Ave, Steel City, SC 33333' }
  },
  inventory: {
    'RM-1001': { category: 'Raw Material', desc: 'Aluminium Sheet 2mm', uom: 'SHT', cost: 8.50, warehouse: 'WH-A (Main)', bin: 'Rack B3', stock: 12, minStock: 50, reorderQty: 100 },
    'RM-1002': { category: 'Raw Material', desc: 'Steel Rod 10mm', uom: 'M', cost: 0.20, warehouse: 'WH-A (Main)', bin: 'Rack C1', stock: 340, minStock: 100, reorderQty: 500 },
    'RM-1003': { category: 'Packaging', desc: 'Packaging Box (Large)', uom: 'PCS', cost: 0.80, warehouse: 'WH-B (Secondary)', bin: 'Shelf 2', stock: 24, minStock: 100, reorderQty: 200 },
    'RM-1004': { category: 'Chemical', desc: 'Solvent Chemical A', uom: 'L', cost: 2.00, warehouse: 'WH-A (Main)', bin: 'Chem Store', stock: 2, minStock: 10, reorderQty: 25 },
    'FG-2001': { category: 'Finished Good', desc: 'Aluminium Frame Kit', uom: 'KIT', cost: 8.00, warehouse: 'WH-B (Secondary)', bin: 'FG Zone', stock: 85, minStock: 20, reorderQty: 50 }
  },
  suppliers: {
    'SUP-001': { company: 'MetalWorks Supply Co', displayName: 'MetalWorks', contact: 'David Chen', phone: '+1 555-0182', email: 'd.chen@metalworks.com', address: '123 Industrial Blvd, Metal City, MC 12345', materials: 'Aluminium, Steel', status: 'Active' },
    'SUP-002': { company: 'PackRight Ltd', displayName: 'PackRight', contact: 'Sarah Miller', phone: '+1 555-0245', email: 's.miller@packright.com', address: '456 Packaging Ave, Packtown, PT 67890', materials: 'Packaging, Labels', status: 'Active' },
    'SUP-003': { company: 'ChemSupply Direct', displayName: 'ChemSupply', contact: 'Robert Lee', phone: '+1 555-0391', email: 'r.lee@chemsupply.com', address: '789 Chemical Way, Chemville, CV 11111', materials: 'Chemicals, Solvents', status: 'Active' },
    'SUP-004': { company: 'FastFix Hardware', displayName: 'FastFix', contact: 'Lisa Wang', phone: '+1 555-0478', email: 'l.wang@fastfix.com', address: '321 Hardware Lane, Fasttown, FT 22222', materials: 'Fasteners, Screws', status: 'Active' }
  },
  staff: {
    'STF-001': { firstName: 'James', lastName: 'Okonkwo', email: 'j.okonkwo@forgeflow.com', role: 'Production Supervisor', dept: 'Manufacturing', rate: 32, access: 'Manager â€” All modules, no admin' },
    'STF-002': { firstName: 'Maria', lastName: 'Santos', email: 'm.santos@forgeflow.com', role: 'CNC Operator', dept: 'Manufacturing', rate: 24, access: 'Operator â€” Manufacturing floor access only' },
    'STF-003': { firstName: 'Tom', lastName: 'Bradley', email: 't.bradley@forgeflow.com', role: 'Warehouse Manager', dept: 'Inventory', rate: 28, access: 'Warehouse â€” Inventory access only' },
    'STF-004': { firstName: 'Aisha', lastName: 'Patel', email: 'a.patel@forgeflow.com', role: 'Sales Representative', dept: 'Sales', rate: 22, access: 'Sales â€” Orders and customers only' },
    'STF-005': { firstName: 'Kevin', lastName: 'Huang', email: 'k.huang@forgeflow.com', role: 'Quality Inspector', dept: 'QA', rate: 26, access: 'Operator â€” Manufacturing floor access only' }
  },
  pr: {
    'PR-0041': { material: 'Aluminium Sheet 2mm', supplier: 'MetalWorks Supply Co', uom: 'SHT', qty: 200, cost: 8.50, reqDate: '2026-03-13', requestedBy: 'J. Smith', status: 'Pending' },
    'PR-0040': { material: 'Packaging Box (Large)', supplier: 'PackRight Ltd', uom: 'PCS', qty: 500, cost: 0.80, reqDate: '2026-03-12', requestedBy: 'T. Johnson', status: 'Approved' },
    'PR-0039': { material: 'Solvent Chemical A', supplier: 'ChemSupply Direct', uom: 'L', qty: 25, cost: 2.00, reqDate: '2026-03-11', requestedBy: 'Auto-Gen', status: 'Approved' },
    'PR-0038': { material: 'Steel Rod 10mm', supplier: 'MetalWorks Supply Co', uom: 'M', qty: 500, cost: 0.20, reqDate: '2026-03-08', requestedBy: 'J. Smith', status: 'Received' }
  },
  uom: {
    'KG': { code: 'KG', name: 'Kilogram', category: 'Weight', isBase: true, factor: 1.0, base: '' },
    'G': { code: 'G', name: 'Gram', category: 'Weight', isBase: false, factor: 0.001, base: 'KG' },
    'SHT': { code: 'SHT', name: 'Sheet', category: 'Count', isBase: true, factor: 1.0, base: '' },
    'REAM': { code: 'REAM', name: 'Ream (500 sheets)', category: 'Count', isBase: false, factor: 500, base: 'SHT' },
    'L': { code: 'L', name: 'Litre', category: 'Volume', isBase: true, factor: 1.0, base: '' },
    'ML': { code: 'ML', name: 'Millilitre', category: 'Volume', isBase: false, factor: 0.001, base: 'L' },
    'PCS': { code: 'PCS', name: 'Pieces', category: 'Count', isBase: true, factor: 1.0, base: '' },
    'M': { code: 'M', name: 'Metre', category: 'Length', isBase: true, factor: 1.0, base: '' }
  },
  maintenance: {
    'MNT-014': { machine: 'CNC Router #2', issue: 'Spindle bearing failure â€” stop required', reportedBy: 'J. Okonkwo', reportedDate: '2026-03-13', estEndDate: '2026-03-15', severity: 'Critical', status: 'Pending' },
    'MNT-013': { machine: 'Laser Cutter A', issue: 'Scheduled lens cleaning and calibration', reportedBy: 'M. Santos', reportedDate: '2026-03-10', estEndDate: '2026-03-11', severity: 'Low', status: 'Resolved' },
    'MNT-012': { machine: 'Assembly Belt 3', issue: 'Belt tension adjustment and guide replacement', reportedBy: 'T. Bradley', reportedDate: '2026-03-08', estEndDate: '2026-03-15', severity: 'Medium', status: 'Scheduled' },
    'MNT-011': { machine: 'Hydraulic Press #1', issue: 'Hydraulic fluid top-up and seal inspection', reportedBy: 'K. Huang', reportedDate: '2026-03-05', estEndDate: '2026-03-06', severity: 'Low', status: 'Completed' }
  },
  operations: {
    'OP-0101': { mfgRef: 'MFG-0031', product: 'Aluminium Frame Kit', stage: 'Cutting', staff: 'Maria Santos', machine: 'CNC Router #2', estTime: '45 min', actualTime: '32 min', qty: 50, priority: 'Normal', status: 'In Progress', scheduledStart: '2026-03-15T08:00', materials: [
      { material: 'Aluminium Sheet 2mm', required: '2 SHT', allocated: '2 SHT', available: '12 SHT', status: 'Low' },
      { material: 'Steel Rod 10mm', required: '0.5 M', allocated: '0.5 M', available: '340 M', status: 'OK' }
    ]},
    'OP-0100': { mfgRef: 'MFG-0031', product: 'Aluminium Frame Kit', stage: 'Forming', staff: 'James Okonkwo', machine: 'Hydraulic Press #1', estTime: '30 min', actualTime: '18 min', qty: 50, priority: 'Normal', status: 'In Progress', scheduledStart: '2026-03-15T09:00', materials: [
      { material: 'Aluminium Sheet 2mm', required: '2 SHT', allocated: '2 SHT', available: '12 SHT', status: 'Low' }
    ]},
    'OP-0099': { mfgRef: 'MFG-0030', product: 'Steel Bracket Assembly', stage: 'Cutting', staff: 'Maria Santos', machine: 'Laser Cutter A', estTime: '120 min', actualTime: '45 min', qty: 200, priority: 'High', status: 'Paused', scheduledStart: '2026-03-15T07:00', materials: [
      { material: 'Steel Rod 10mm', required: '0.5 M', allocated: '0.5 M', available: '340 M', status: 'OK' }
    ]},
    'OP-0098': { mfgRef: 'MFG-0031', product: 'Aluminium Frame Kit', stage: 'Assembly', staff: 'Kevin Huang', machine: 'Assembly Belt 3', estTime: '60 min', actualTime: null, qty: 50, priority: 'Normal', status: 'Pending', scheduledStart: '2026-03-15T10:00', materials: [
      { material: 'Corner Bracket', required: '4 PCS', allocated: '4 PCS', available: '85 PCS', status: 'OK' },
      { material: 'Fastener M6 x 20', required: '8 PCS', allocated: '8 PCS', available: '1200 PCS', status: 'OK' }
    ]},
    'OP-0097': { mfgRef: 'MFG-0031', product: 'Aluminium Frame Kit', stage: 'QA Inspection', staff: 'Kevin Huang', machine: 'QA Station', estTime: '20 min', actualTime: null, qty: 50, priority: 'Normal', status: 'Pending', scheduledStart: '2026-03-15T11:00', materials: [
      { material: 'Checklist Sheet', required: '1 PCS', allocated: '1 PCS', available: '500 PCS', status: 'OK' }
    ]},
    'OP-0096': { mfgRef: 'MFG-0031', product: 'Aluminium Frame Kit', stage: 'Packaging', staff: 'James Okonkwo', machine: 'Packaging Station', estTime: '15 min', actualTime: null, qty: 50, priority: 'Normal', status: 'Pending', scheduledStart: '2026-03-15T11:30', materials: [
      { material: 'Packaging Box (Large)', required: '50 PCS', allocated: '50 PCS', available: '24 PCS', status: 'Low' }
    ]},
    'OP-0095': { mfgRef: 'MFG-0029', product: 'Conveyor Belt Unit', stage: 'Final Assembly', staff: 'James Okonkwo', machine: 'Assembly Belt 1', estTime: '90 min', actualTime: '85 min', qty: 10, priority: 'Normal', status: 'Completed', scheduledStart: '2026-03-14T10:00', materials: [
      { material: 'Steel Frame', required: '2 PCS', allocated: '2 PCS', available: '85 PCS', status: 'OK' }
    ]},
    'OP-0094': { mfgRef: 'MFG-0029', product: 'Conveyor Belt Unit', stage: 'Welding', staff: 'Maria Santos', machine: 'Weld Station #2', estTime: '60 min', actualTime: '55 min', qty: 10, priority: 'Normal', status: 'Completed', scheduledStart: '2026-03-14T08:30', materials: [
      { material: 'Welding Rod', required: '12 PCS', allocated: '12 PCS', available: '400 PCS', status: 'OK' }
    ]}
  }
};

// ============ NOTIFICATIONS ============
let notificationCount = 0;
let notifications = [];

function getNotifications() {
  const saved = localStorage.getItem('forgeflow_notifications_list');
  return saved ? JSON.parse(saved) : [];
}

function saveNotifications(list) {
  localStorage.setItem('forgeflow_notifications_list', JSON.stringify(list));
  notificationCount = list.filter(n => !n.read).length;
  updateNotificationBadge();
}

function updateNotificationBadge() {
  const dot = document.getElementById('notifDot');
  if (dot) {
    dot.style.display = notificationCount > 0 ? 'block' : 'none';
    dot.textContent = notificationCount > 9 ? '9+' : notificationCount;
  }
}

function addNotification(type, title, description, iconType = 'system') {
  const notifications = getNotifications();
  const newNotif = {
    id: 'notif_' + Date.now(),
    type: type,
    title: title,
    description: description,
    iconType: iconType,
    read: false,
    timestamp: new Date().toISOString()
  };
  notifications.unshift(newNotif);
  if (notifications.length > 50) notifications.pop();
  saveNotifications(notifications);
  renderNotifications();
}

function renderNotifications() {
  notifications = getNotifications();
  const listEl = document.getElementById('notificationList');
  if (!listEl) return;
  
  if (notifications.length === 0) {
    listEl.innerHTML = `
      <div style="padding: 40px 20px; text-align: center; color: var(--gray-400);">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 48px; height: 48px; margin-bottom: 12px; opacity: 0.5;">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <p style="font-size: 14px;">No notifications yet</p>
      </div>
    `;
    return;
  }
  
  listEl.innerHTML = notifications.map(notif => {
    const timeAgo = getTimeAgo(notif.timestamp);
    const iconSvg = getNotificationIcon(notif.iconType);
    return `
      <div class="notification-item ${notif.read ? '' : 'unread'}" data-id="${notif.id}" data-type="${notif.type}">
        <div class="notif-icon ${notif.type}">${iconSvg}</div>
        <div class="notif-content">
          <div class="notif-title">${notif.title}</div>
          <div class="notif-desc">${notif.description}</div>
          <div class="notif-time">${timeAgo}</div>
        </div>
      </div>
    `;
  }).join('');
  
  listEl.querySelectorAll('.notification-item').forEach(item => {
    item.addEventListener('click', function() {
      const notifId = this.dataset.id;
      markAsRead(notifId);
    });
  });
}

function getNotificationIcon(type) {
  const icons = {
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    order: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    operation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    maintenance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    inventory: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>'
  };
  return icons[type] || icons.system;
}

function getTimeAgo(timestamp) {
  const now = new Date();
  const then = new Date(timestamp);
  const seconds = Math.floor((now - then) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + ' minutes ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + ' hour' + (Math.floor(seconds / 3600) > 1 ? 's' : '') + ' ago';
  if (seconds < 604800) return Math.floor(seconds / 86400) + ' day' + (Math.floor(seconds / 86400) > 1 ? 's' : '') + ' ago';
  return then.toLocaleDateString();
}

function markAsRead(notifId) {
  const notifications = getNotifications();
  const notif = notifications.find(n => n.id === notifId);
  if (notif) {
    notif.read = true;
    saveNotifications(notifications);
    renderNotifications();
  }
}

function toggleNotifications() {
  const dropdown = document.querySelector('.notification-dropdown');
  if (!dropdown) return;
  
  const isOpen = dropdown.classList.contains('open');
  
  document.querySelectorAll('.notification-dropdown').forEach(d => d.classList.remove('open'));
  
  if (!isOpen) {
    dropdown.classList.add('open');
    renderNotifications();
  }
  
  setTimeout(() => {
    const closeHandler = function(e) {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 10);
}

function markAllRead() {
  const notifications = getNotifications();
  notifications.forEach(n => n.read = true);
  saveNotifications(notifications);
  renderNotifications();
  showToast('All notifications marked as read', 'success');
}

function sendEmailNotification(notifType, title, message) {
  const settings = JSON.parse(localStorage.getItem('forgeflow_notifications') || '{}');
  
  if (notifType === 'orderUpdates' && settings.orderUpdates) {
    console.log('Email notification:', { type: notifType, title, message });
  }
  if (notifType === 'inventoryAlerts' && settings.inventoryAlerts) {
    console.log('Email notification:', { type: notifType, title, message });
  }
  if (notifType === 'productionUpdates' && settings.productionUpdates) {
    console.log('Email notification:', { type: notifType, title, message });
  }
  if (notifType === 'maintenanceAlerts' && settings.maintenanceAlerts) {
    console.log('Email notification:', { type: notifType, title, message });
  }
}

function initNotifications() {
  renderNotifications();
  updateNotificationBadge();
}

function openHelpPage() {
  window.open('help.html', '_blank');
}

console.log('Before DOMContentLoaded - typeof renderRoles:', typeof renderRoles);

async function loadAllSettings() {
  const generalSettings = localStorage.getItem('forgeflow_general');
  if (generalSettings) {
    const settings = JSON.parse(generalSettings);
    if (settings.firstName) document.getElementById('settingsFirstName').value = settings.firstName;
    if (settings.lastName) document.getElementById('settingsLastName').value = settings.lastName;
    if (settings.email) document.getElementById('settingsEmail').value = settings.email;
    if (settings.phone) document.getElementById('settingsPhone').value = settings.phone;
    if (settings.jobTitle) document.getElementById('settingsJobTitle').value = settings.jobTitle;
    if (settings.timezone) document.getElementById('settingsTimezone').value = settings.timezone;
    if (settings.dateFormat) document.getElementById('settingsDateFormat').value = settings.dateFormat;
    if (settings.currency) document.getElementById('settingsCurrency').value = settings.currency;
    if (settings.language) document.getElementById('settingsLanguage').value = settings.language;
    if (settings.defaultWarehouse) document.getElementById('settingsDefaultWarehouse').value = settings.defaultWarehouse;
    if (settings.defaultUOM) document.getElementById('settingsDefaultUOM').value = settings.defaultUOM;
    if (document.getElementById('toggleAutoSave')) document.getElementById('toggleAutoSave').checked = settings.autoSave;
    if (document.getElementById('toggleProductivityTips')) document.getElementById('toggleProductivityTips').checked = settings.productivityTips;
  }
  
  const companySettings = localStorage.getItem('forgeflow_company');
  if (companySettings) {
    const settings = JSON.parse(companySettings);
    if (settings.name) document.getElementById('companyName').value = settings.name;
    if (settings.industry) document.getElementById('companyIndustry').value = settings.industry;
    if (settings.size) document.getElementById('companySize').value = settings.size;
    if (settings.address) document.getElementById('companyAddress').value = settings.address;
    if (settings.email) document.getElementById('companyEmail').value = settings.email;
    if (settings.phone) document.getElementById('companyPhone').value = settings.phone;
    if (settings.website) document.getElementById('companyWebsite').value = settings.website;
    if (settings.taxId) document.getElementById('companyTaxId').value = settings.taxId;
    if (settings.logoUrl) {
      const preview = document.getElementById('companyLogoPreview');
      if (preview) {
        preview.innerHTML = `<img src="${settings.logoUrl}" alt="Company Logo" style="max-width:100%;max-height:100%">`;
      }
    }
  }
  
  const securitySettings = localStorage.getItem('forgeflow_security');
  if (securitySettings) {
    const settings = JSON.parse(securitySettings);
    if (document.getElementById('toggle2FA')) document.getElementById('toggle2FA').checked = settings.twoFactorEnabled;
  }
  
  const userData = getForgeflowUser();
  if (userData && !generalSettings) {
    if (userData.email) {
      const emailInput = document.getElementById('settingsEmail');
      if (emailInput) emailInput.value = userData.email;
    }
    if (userData.firstName) {
      const firstNameInput = document.getElementById('settingsFirstName');
      if (firstNameInput) firstNameInput.value = userData.firstName;
    }
    if (userData.lastName) {
      const lastNameInput = document.getElementById('settingsLastName');
      if (lastNameInput) lastNameInput.value = userData.lastName;
    }
  }
}

function initTrialCountdown() {
  const badgeEl = document.getElementById('planBadge');
  const countdownEl = badgeEl?.querySelector('.plan-badge-countdown');
  
  if (!countdownEl) {
    console.log('Countdown element not found');
    return;
  }
  
  // Check if it's a paid plan - if so, hide countdown
  const paidPlans = ['STARTER', 'PRO', 'PROFESSIONAL', 'ENTERPRISE'];
  const userData = getForgeflowUser() || {};
  
  if (paidPlans.includes(userData.planLabel)) {
    countdownEl.style.display = 'none';
    console.log('Paid plan - countdown hidden');
    return;
  }
  
  // Only show countdown for free trial
  let trialStart = sessionStorage.getItem('forgeflow_trial_start');
  if (!trialStart) {
    trialStart = new Date().toISOString();
    sessionStorage.setItem('forgeflow_trial_start', trialStart);
  }
  
  const startDate = new Date(trialStart);
  const trialDays = 14; // 14 day trial
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + trialDays);
  
  countdownEl.style.display = 'inline';
  
  function updateCountdown() {
    const badge = document.getElementById('planBadge');
    // Double check - if plan changed to paid, hide countdown
    const currentUser = getForgeflowUser() || {};
    if (paidPlans.includes(currentUser.planLabel)) {
      const el = badge?.querySelector('.plan-badge-countdown');
      if (el) el.style.display = 'none';
      return;
    }
    
    const now = new Date();
    const diff = endDate - now;
    
    if (diff <= 0) {
      countdownEl.textContent = 'Trial Expired';
      return;
    }
    
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    countdownEl.textContent = `${days} days left`;
    console.log('Countdown updated:', days);
  }
  
  // Run immediately and then set interval
  updateCountdown();
  setInterval(updateCountdown, 60000);
}

function clearDemoData() {
  if (!confirm('Are you sure you want to clear all demo data? This will remove all sample records from the application.')) {
    return;
  }
  
  // Clear all table rows in each module
  const tables = document.querySelectorAll('.data-table tbody');
  tables.forEach(tbody => {
    tbody.innerHTML = '';
  });
  
  // Reset KPI values
  const kpiValues = document.querySelectorAll('.kpi-value');
  kpiValues.forEach(kpi => {
    const text = kpi.textContent;
    if (!isNaN(text) && parseInt(text) > 0) {
      kpi.textContent = '0';
    }
  });
  
  // Show success message
  showToast('All demo data has been cleared', 'success');
}

function applyUser(user) {
  const safeUser = user || {};
  const firstName = safeUser.firstName || safeUser.first_name || '';
  const lastName = safeUser.lastName || safeUser.last_name || '';
  const fullName = safeUser.fullName || `${firstName} ${lastName}`.trim() || safeUser.email || `${safeUser.planName || 'User'} Account`;
  const initials = safeUser.initials || (firstName[0] || safeUser.email?.[0] || 'U').toUpperCase() + (lastName[0] || '').toUpperCase();
  const planName = safeUser.planName || 'Professional';
  const planLabel = safeUser.planLabel || 'PROFESSIONAL';

  const avEl   = document.getElementById('sidebarAvatar');
  const nameEl = document.getElementById('sidebarName');
  const planEl = document.getElementById('sidebarPlan');
  const badgeEl = document.getElementById('planBadge');
  const nameElTop = document.querySelector('.user-dropdown-name');
  const avElTop = document.querySelector('.user-avatar-top');
  const avElLarge = document.querySelector('.user-avatar-large');
  if (avEl) avEl.textContent = initials;
  if (avElTop) avElTop.textContent = initials;
  if (avElLarge) avElLarge.textContent = initials;
  if (nameEl) nameEl.textContent = fullName;
  if (nameElTop) nameElTop.textContent = fullName;
  if (planEl) planEl.textContent = planName;

  const emailEls = document.querySelectorAll('.user-dropdown-email');
  emailEls.forEach(el => {
    el.textContent = safeUser.email || '';
  });

  if (badgeEl) {
    const badgeText = badgeEl.querySelector('.plan-badge-text');
    const countdownEl = badgeEl.querySelector('.plan-badge-countdown');
    if (badgeText) badgeText.textContent = planLabel;
    
    // Check if it's a paid plan
    const paidPlans = ['STARTER', 'PRO', 'PROFESSIONAL', 'ENTERPRISE'];
    const isPaidPlan = paidPlans.includes(planLabel);
    
    // Remove any existing plan classes
    badgeEl.classList.remove('paid-plan');
    
    if (isPaidPlan) {
      badgeEl.classList.add('paid-plan');
      badgeEl.setAttribute('data-plan', 'paid');
      if (countdownEl) countdownEl.style.display = 'none';
    } else {
      badgeEl.setAttribute('data-plan', 'trial');
      if (countdownEl) countdownEl.style.display = 'inline';
      updateTrialCountdown();
    }
  }
}

function updateTrialCountdown() {
  const badgeEl = document.getElementById('planBadge');
  const countdownEl = badgeEl?.querySelector('.plan-badge-countdown');
  if (!countdownEl) return;
  
  let trialStart = sessionStorage.getItem('forgeflow_trial_start');
  if (!trialStart) {
    trialStart = new Date().toISOString();
    sessionStorage.setItem('forgeflow_trial_start', trialStart);
  }
  
  const startDate = new Date(trialStart);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 14);
  
  const now = new Date();
  const diff = endDate - now;
  const daysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  
  countdownEl.textContent = daysLeft + ' days left';
}

// ============ PLAN-BASED ACCESS CONTROL ============

const planHierarchy = {
  'trial': 1,
  'starter': 2,
  'professional': 3,
  'enterprise': 4
};

const planLabels = {
  'FREE TRIAL': 'trial',
  'STARTER': 'starter',
  'PRO': 'professional',
  'PROFESSIONAL': 'professional',
  'ENTERPRISE': 'enterprise'
};

function getUserPlanLevel() {
  const userData = getForgeflowUser() || {};
  const planKey = planLabels[userData.planLabel] || 'trial';
  return planHierarchy[planKey] || 1;
}

function getPlanName(planKey) {
  const names = {
    'starter': 'Starter',
    'professional': 'Professional',
    'enterprise': 'Enterprise'
  };
  return names[planKey] || 'Professional';
}

function createUpgradeModal() {
  const modalHTML = `
    <div id="planUpgradeModal" class="modal-overlay">
      <div class="modal-container upgrade-modal">
        <button class="modal-close" onclick="closeUpgradeModal()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        
        <div class="modal-header">
          <div class="modal-icon upgrade-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </div>
          <h2 class="modal-title">Upgrade Required</h2>
          <p class="modal-subtitle"><span class="upgrade-module-name"></span> is available with the <span class="upgrade-plan-name"></span> plan or higher.</p>
        </div>
        
        <div class="upgrade-features">
          <div class="upgrade-feature">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Workfloor Operations</span>
          </div>
          <div class="upgrade-feature">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Advanced Reporting</span>
          </div>
          <div class="upgrade-feature">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            <span>API Access</span>
          </div>
          <div class="upgrade-feature">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Priority Support</span>
          </div>
        </div>
        
        <button class="modal-submit-btn" onclick="goToUpgrade()">
          Upgrade Now
        </button>
        
        <p class="modal-disclaimer">Cancel anytime. No hidden fees.</p>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  document.getElementById('planUpgradeModal').addEventListener('click', function(e) {
    if (e.target === this) closeUpgradeModal();
  });
}

function closeUpgradeModal() {
  const modal = document.getElementById('planUpgradeModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

function goToUpgrade() {
  closeUpgradeModal();
  window.location.href = 'pricing-select.html?upgrade=true';
}

function initPlanAccessControl() {
  const userLevel = getUserPlanLevel();
  
  document.querySelectorAll('.sidebar-nav-item[data-plan-required]').forEach(item => {
    const requiredPlans = item.getAttribute('data-plan-required');
    const plans = requiredPlans.split(',');
    
    let hasAccess = false;
    for (const plan of plans) {
      const planLevel = planHierarchy[plan.trim()] || 0;
      if (userLevel >= planLevel) {
        hasAccess = true;
        break;
      }
    }
    
    if (!hasAccess) {
      item.classList.add('locked');
      item.style.cursor = 'not-allowed';
      
      const onclickAttr = item.getAttribute('onclick');
      item.setAttribute('data-original-onclick', onclickAttr);
      item.removeAttribute('onclick');
    }
  });
  
  document.querySelectorAll('.sidebar-nav-item.locked').forEach(item => {
    item.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      const moduleName = this.querySelector('span:not(.sidebar-count):not(.sidebar-pro-badge)')?.textContent || 'This feature';
      const upgradeTo = this.getAttribute('data-upgrade-to') || 'professional';
      
      showUpgradeModal(moduleName, upgradeTo);
    });
  });
}

window.closeUpgradeModal = closeUpgradeModal;
window.goToUpgrade = goToUpgrade;
window.showUpgradeModal = showUpgradeModal;
window.showModule = showModule;
window.doLogout = doLogout;

// ============ PANE MANAGEMENT ============
let currentPaneData = {};

const paneDataMap = {
  mfgPane: { dataKey: 'mfg', type: 'Manufacturing Order', titleField: 'id' },
  invPane: { dataKey: 'inventory', type: 'Inventory Item', titleField: 'id' },
  salesPane: { dataKey: 'sales', type: 'Sales Order', titleField: 'id' },
  prPane: { dataKey: 'pr', type: 'Purchase Request', titleField: 'id' },
  bomPane: { dataKey: 'bom', type: 'BOM', titleField: 'id' },
  supplierPane: { dataKey: 'suppliers', type: 'Supplier', titleField: 'id' },
  staffPane: { dataKey: 'staff', type: 'Staff Member', titleField: 'id' },
  maintPane: { dataKey: 'maintenance', type: 'Maintenance Request', titleField: 'id' },
  workopsPane: { dataKey: 'operations', type: 'Operation', titleField: 'id' },
  uomPane: { dataKey: 'uom', type: 'UOM', titleField: 'id' }
};

const RECORD_OVERRIDES_KEY = 'forgeflow_record_overrides';
const serverRecordCache = {};
let moduleRecordsHydrated = false;

async function ensureCompanyContext() {
  if (currentCompanyId) return currentCompanyId;
  const authResult = await checkAppAuth();
  if (!authResult?.profile?.company_id) return null;
  currentCompanyId = authResult.profile.company_id;
  return currentCompanyId;
}

async function hydrateModuleRecords(force = false) {
  if (moduleRecordsHydrated && !force) return;
  const companyId = await ensureCompanyContext();
  if (!companyId) return;

  try {
    const { data, error } = await supabase
      .from('module_records')
      .select('module_key,record_id,data,updated_at,created_at')
      .eq('company_id', companyId);

    if (error) throw error;

    Object.keys(serverRecordCache).forEach(key => delete serverRecordCache[key]);
    (data || []).forEach(row => {
      if (!serverRecordCache[row.module_key]) serverRecordCache[row.module_key] = {};
      serverRecordCache[row.module_key][row.record_id] = {
        ...(row.data || {}),
        id: row.record_id,
        updatedAt: row.updated_at || row.data?.updatedAt,
        createdAt: row.created_at || row.data?.createdAt
      };
    });

    moduleRecordsHydrated = true;
  } catch (e) {
    console.warn('Failed to hydrate module records from backend:', e);
  }
}

function getRecordOverrides() {
  return serverRecordCache;
}

function saveRecordOverrides(overrides = {}) {
  Object.keys(serverRecordCache).forEach(key => delete serverRecordCache[key]);
  Object.entries(overrides).forEach(([moduleKey, rows]) => {
    serverRecordCache[moduleKey] = { ...(rows || {}) };
  });
}

function saveRecordOverride(dataKey, recordId, data) {
  if (!dataKey || !recordId) return;
  const overrides = getRecordOverrides();
  if (!overrides[dataKey]) overrides[dataKey] = {};
  overrides[dataKey][recordId] = {
    ...(overrides[dataKey][recordId] || {}),
    ...data,
    id: recordId,
    updatedAt: new Date().toISOString()
  };
  saveRecordOverrides(overrides);
  void upsertModuleRecord(dataKey, recordId, overrides[dataKey][recordId]);
}

async function upsertModuleRecord(dataKey, recordId, data) {
  const companyId = await ensureCompanyContext();
  if (!companyId || !dataKey || !recordId) return;

  try {
    const payload = {
      company_id: companyId,
      module_key: dataKey,
      record_id: recordId,
      data: {
        ...data,
        id: recordId
      },
      created_by: currentAuthUser?.id || null,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('module_records')
      .upsert(payload, { onConflict: 'company_id,module_key,record_id' });

    if (error) throw error;
  } catch (e) {
    console.warn(`Failed to persist module record ${dataKey}:${recordId}`, e);
  }
}

async function fetchRecordFromServer(dataKey, recordId) {
  const companyId = await ensureCompanyContext();
  if (!companyId || !dataKey || !recordId) return null;

  try {
    const { data, error } = await supabase
      .from('module_records')
      .select('record_id,data,updated_at,created_at')
      .eq('company_id', companyId)
      .eq('module_key', dataKey)
      .eq('record_id', recordId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    if (!serverRecordCache[dataKey]) serverRecordCache[dataKey] = {};
    serverRecordCache[dataKey][recordId] = {
      ...(data.data || {}),
      id: recordId,
      updatedAt: data.updated_at || data.data?.updatedAt,
      createdAt: data.created_at || data.data?.createdAt
    };

    return serverRecordCache[dataKey][recordId];
  } catch (e) {
    console.warn(`Failed to load module record ${dataKey}:${recordId}`, e);
    return null;
  }
}

function inferPaneMode(triggerButton, title, hasData, recordId, isCreateAction) {
  if (triggerButton?.classList.contains('act-btn-edit')) return 'edit';
  if (triggerButton?.classList.contains('act-btn-view')) return 'view';
  if (isCreateAction) return 'create';
  if (hasData || recordId) return 'edit';
  return 'create';
}

function applyPaneMode(pane, mode, recordType) {
  const isViewMode = mode === 'view';
  pane.dataset.mode = mode;
  
  pane.querySelectorAll('input, select, textarea, button').forEach(control => {
    if (control.dataset.baseDisabled === undefined) {
      control.dataset.baseDisabled = control.disabled ? 'true' : 'false';
    }
  });
  
  pane.querySelectorAll('input, select, textarea').forEach(field => {
    const baseDisabled = field.dataset.baseDisabled === 'true';
    field.disabled = isViewMode ? true : baseDisabled;
  });
  
  pane.querySelectorAll('.pane-body button').forEach(btn => {
    const baseDisabled = btn.dataset.baseDisabled === 'true';
    btn.disabled = isViewMode ? true : baseDisabled;
  });
  
  const saveBtn = pane.querySelector('.btn-pane-save');
  if (saveBtn) {
    saveBtn.style.display = isViewMode ? 'none' : '';
    saveBtn.textContent = mode === 'edit'
      ? 'Update ' + recordType
      : 'Save ' + recordType;
  }
}

function extractIdFromRow(row, paneId) {
  if (!row) return null;
  const firstCellText = row.cells?.[0]?.textContent?.trim() || '';
  if (!firstCellText) return null;
  
  const hyphenated = firstCellText.match(/\b([A-Z]{2,})\s*-\s*(\d+)\b/);
  if (hyphenated) return `${hyphenated[1]}-${hyphenated[2]}`;
  
  if (paneId === 'uomPane') {
    const uomCode = firstCellText.match(/\b[A-Z]{1,6}\b/);
    return uomCode ? uomCode[0] : null;
  }
  
  return null;
}

function findUomIdByName(name) {
  if (!name) return null;
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  
  const overrides = getRecordOverrides().uom || {};
  const merged = { ...(mockData.uom || {}), ...overrides };
  
  for (const [uomId, uomData] of Object.entries(merged)) {
    if ((uomData?.name || '').toLowerCase() === needle) return uomId;
  }
  
  return null;
}

function resolveRecordIdFromContext(paneId, title, isCreateAction) {
  if (isCreateAction) return null;
  
  const triggerButton = window.event?.target?.closest('button');
  const rowId = extractIdFromRow(triggerButton?.closest('tr'), paneId);
  if (rowId) return rowId;
  
  const titleId = extractIdFromTitle(title);
  if (titleId) return titleId;
  
  if (paneId === 'uomPane') {
    const uomName = title?.includes(':')
      ? title.split(':').pop()?.trim()
      : title;
    return findUomIdByName(uomName);
  }
  
  return null;
}

function getCellText(row, index) {
  const raw = row?.cells?.[index]?.textContent || '';
  return String(raw)
    .replace(/\s+/g, ' ')
    .replace(/[–—]/g, '-')
    .trim();
}

function toNumber(value) {
  const num = parseFloat(String(value || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(num) ? num : '';
}

function emptyIfDash(value) {
  const normalized = String(value || '').trim();
  return normalized === '-' || normalized === '--' ? '' : normalized;
}

function splitFullName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ')
  };
}

function buildRecordFromTableRow(paneId, row, fallbackStatus) {
  if (!row) return null;
  const rowStatus = row.getAttribute('data-status') || fallbackStatus || '';
  
  if (paneId === 'mfgPane') {
    return {
      id: getCellText(row, 0),
      product: getCellText(row, 1),
      soRef: getCellText(row, 2),
      qty: toNumber(getCellText(row, 3)),
      status: rowStatus
    };
  }
  
  if (paneId === 'workopsPane') {
    return {
      id: getCellText(row, 0),
      mfgRef: getCellText(row, 1),
      product: getCellText(row, 2),
      stage: getCellText(row, 3),
      staff: getCellText(row, 4),
      machine: getCellText(row, 5),
      estTime: getCellText(row, 6),
      actualTime: emptyIfDash(getCellText(row, 7)),
      status: rowStatus
    };
  }
  
  if (paneId === 'inventoryPane' || paneId === 'invPane') {
    return {
      id: getCellText(row, 0),
      desc: getCellText(row, 1),
      category: getCellText(row, 2),
      warehouse: getCellText(row, 3),
      uom: getCellText(row, 4),
      stock: toNumber(getCellText(row, 5)),
      minStock: toNumber(getCellText(row, 6)),
      reorderQty: toNumber(getCellText(row, 8)),
      status: rowStatus
    };
  }
  
  if (paneId === 'salesPane') {
    return {
      id: getCellText(row, 0),
      customer: getCellText(row, 1),
      product: getCellText(row, 2),
      qty: toNumber(getCellText(row, 3)),
      price: toNumber(getCellText(row, 4)),
      deliveryDate: getCellText(row, 7),
      status: rowStatus
    };
  }
  
  if (paneId === 'prPane') {
    return {
      id: getCellText(row, 0),
      material: getCellText(row, 1),
      supplier: getCellText(row, 2),
      qty: toNumber(getCellText(row, 3)),
      cost: toNumber(getCellText(row, 4)),
      requestedBy: getCellText(row, 6),
      reqDate: getCellText(row, 7),
      status: rowStatus
    };
  }
  
  if (paneId === 'bomPane') {
    return {
      id: getCellText(row, 0),
      product: getCellText(row, 1),
      version: getCellText(row, 2),
      status: rowStatus
    };
  }
  
  if (paneId === 'supplierPane') {
    return {
      id: getCellText(row, 0),
      company: getCellText(row, 1),
      contact: getCellText(row, 2),
      phone: getCellText(row, 3),
      email: getCellText(row, 4),
      materials: getCellText(row, 5),
      status: rowStatus
    };
  }
  
  if (paneId === 'staffPane') {
    const names = splitFullName(getCellText(row, 1));
    return {
      id: getCellText(row, 0),
      firstName: names.firstName,
      lastName: names.lastName,
      role: getCellText(row, 2),
      dept: getCellText(row, 3),
      rate: toNumber(getCellText(row, 4)),
      access: getCellText(row, 7),
      status: rowStatus
    };
  }
  
  if (paneId === 'maintPane') {
    return {
      id: getCellText(row, 0),
      machine: getCellText(row, 1),
      issue: getCellText(row, 2),
      reportedBy: getCellText(row, 3),
      reportedDate: getCellText(row, 4),
      estEndDate: getCellText(row, 5),
      severity: getCellText(row, 6),
      status: rowStatus
    };
  }
  
  if (paneId === 'uomPane') {
    const factorText = getCellText(row, 4);
    const baseMatch = factorText.match(/\b[A-Z]{1,6}\b$/);
    return {
      id: getCellText(row, 0),
      code: getCellText(row, 0),
      name: getCellText(row, 1),
      category: getCellText(row, 2),
      isBase: getCellText(row, 3),
      factor: toNumber(factorText),
      base: baseMatch ? baseMatch[0] : '- (this is the base)'
    };
  }
  
  return null;
}

async function openPane(paneId, title, status, data = null, modeOverride = null) {
  console.log('openPane called:', paneId, title, status, data);
  const pane = document.getElementById(paneId);
  if (!pane) {
    console.error('Pane not found:', paneId);
    return;
  }
  
  const backdrop = document.getElementById('paneBackdrop') || document.querySelector('.pane-backdrop');
  if (backdrop) backdrop.classList.add('open');
  pane.classList.add('open');
  document.body.style.overflow = 'hidden';
  
  const titleEl = pane.querySelector('.pane-title');
  if (titleEl) titleEl.textContent = title;
  
  const subtitleEl = pane.querySelector('.pane-subtitle');
  if (subtitleEl) {
    if (subtitleEl.dataset.defaultText === undefined) {
      subtitleEl.dataset.defaultText = subtitleEl.textContent || '';
    }
    subtitleEl.textContent = status || subtitleEl.dataset.defaultText;
  }
  
  const paneConfig = paneDataMap[paneId] || { dataKey: null, type: paneId.replace('Pane', ''), titleField: 'id' };
  const isCreateAction = /^(new|add|create)\b/i.test((title || '').trim());
  const triggerButton = window.event?.target?.closest('button');
  const triggerRow = triggerButton?.closest('tr');
  const recordId = resolveRecordIdFromContext(paneId, title, isCreateAction);
  const paneMode = modeOverride || inferPaneMode(triggerButton, title, !!data, recordId, isCreateAction);
  
  currentPaneData = {
    id: recordId,
    type: paneConfig.type,
    title: title,
    status: status,
    mode: paneMode,
    dataKey: paneConfig.dataKey,
    originalData: data
  };
  
  if (!data && recordId && paneConfig.dataKey) {
    await hydrateModuleRecords();
    data = lookupRecord(paneConfig.dataKey, recordId);
    if (!data) {
      data = await fetchRecordFromServer(paneConfig.dataKey, recordId);
    }
  }
  if (!data && triggerRow) {
    data = buildRecordFromTableRow(paneId, triggerRow, status);
  }
  if (data && recordId && !data.id) {
    data = { id: recordId, ...data };
  }
  if (data && !currentPaneData.id && data.id) {
    currentPaneData.id = data.id;
  }
  
  resetPaneFields(pane);
  
  if (data) {
    console.log('Populating pane with data:', data);
    populatePaneWithRecordData(pane, data, paneId);
    addMaterialsToPane(pane, data);
    addStagesToPane(pane, data);
  }
  
  applyPaneMode(pane, paneMode, currentPaneData.type);
}

function lookupRecord(dataKey, recordId) {
  const overrides = getRecordOverrides();
  const overrideRecord = overrides[dataKey]?.[recordId] || null;
  const baseRecord = mockData[dataKey]?.[recordId] || null;
  
  if (!overrideRecord && !baseRecord) return null;
  return {
    ...(baseRecord || {}),
    ...(overrideRecord || {}),
    id: recordId
  };
}

function extractIdFromTitle(title) {
  const match = (title || '').match(/\b([A-Z]{2,})\s*-\s*(\d+)\b/);
  return match ? `${match[1]}-${match[2]}` : null;
}

function normalizeFieldValue(paneId, key, value) {
  if (value === null || value === undefined) return '';
  
  if (paneId === 'uomPane' && key === 'isBase') {
    return value === true || String(value).toLowerCase() === 'true' ? 'Yes' : 'No';
  }
  
  if (paneId === 'uomPane' && key === 'base' && !value) {
    return '- (this is the base)';
  }
  
  if (paneId === 'workopsPane' && key === 'scheduledStart') {
    return String(value).slice(0, 16);
  }
  
  return String(value);
}

function setSelectValue(selectEl, value) {
  const options = Array.from(selectEl.options);
  const normalized = String(value || '').trim();
  const normalizedLower = normalized.toLowerCase();
  const normalizedCompact = normalizedLower.replace(/[^a-z0-9]/g, '');
  
  const option = options.find(opt => {
    const val = (opt.value || '').trim();
    const text = (opt.textContent || '').trim();
    const valLower = val.toLowerCase();
    const textLower = text.toLowerCase();
    const valCompact = valLower.replace(/[^a-z0-9]/g, '');
    const textCompact = textLower.replace(/[^a-z0-9]/g, '');
    
    return (
      val === normalized ||
      text === normalized ||
      valLower === normalizedLower ||
      textLower === normalizedLower ||
      valCompact === normalizedCompact ||
      textCompact === normalizedCompact ||
      textLower.includes(normalizedLower) ||
      normalizedLower.includes(textLower)
    );
  });
  
  if (option) {
    selectEl.value = option.value;
  } else {
    selectEl.value = normalized;
  }
}

function populatePaneWithRecordData(pane, data, paneId) {
  const fieldMappings = getFieldMappings(paneId);
  
  Object.entries(data).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) return;
    
    const mappedId = fieldMappings[key] || key;
    const input = pane.querySelector(`#${mappedId}`);
    
    if (input) {
      const normalizedValue = normalizeFieldValue(paneId, key, value);
      console.log(`Setting ${mappedId} = ${normalizedValue}`);
      if (input.tagName === 'SELECT') {
        setSelectValue(input, normalizedValue);
      } else {
        input.value = normalizedValue;
      }
    }
  });
}

function getFieldMappings(paneId) {
  const mappings = {
    mfgPane: {
      id: 'mfg-id-input',
      soRef: 'mfg-soRef',
      product: 'mfg-product',
      qty: 'mfg-qty',
      quantity: 'mfg-qty',
      targetDate: 'mfg-targetDate',
      supervisor: 'mfg-supervisor',
      priority: 'mfg-priority',
      warehouse: 'mfg-warehouse',
      status: 'mfg-status',
      notes: 'mfg-notes'
    },
    invPane: {
      id: 'inv-id-input',
      category: 'inv-category',
      desc: 'inv-desc',
      description: 'inv-desc',
      uom: 'inv-uom',
      cost: 'inv-cost',
      warehouse: 'inv-warehouse',
      bin: 'inv-bin',
      stock: 'inv-stock',
      minStock: 'inv-minStock',
      reorderQty: 'inv-reorderQty'
    },
    salesPane: {
      id: 'sales-id-input',
      customer: 'sales-customer',
      product: 'sales-product',
      qty: 'sales-qty',
      quantity: 'sales-qty',
      price: 'sales-price',
      deliveryDate: 'sales-deliveryDate',
      paymentTerms: 'sales-paymentTerms',
      address: 'sales-address'
    },
    prPane: {
      id: 'pr-id-input',
      material: 'pr-material',
      supplier: 'pr-supplier',
      uom: 'pr-uom',
      qty: 'pr-qty',
      quantity: 'pr-qty',
      cost: 'pr-cost',
      reqDate: 'pr-reqDate',
      requiredDate: 'pr-requiredDate',
      requestedBy: 'pr-requestedBy',
      status: 'pr-status'
    },
    bomPane: {
      id: 'bom-id-input',
      product: 'bom-product',
      version: 'bom-version',
      wastage: 'bom-wastage',
      outputUom: 'bom-outputUom',
      status: 'bom-status'
    },
    supplierPane: {
      id: 'supplier-id-input',
      company: 'supplier-company',
      displayName: 'supplier-displayName',
      contact: 'supplier-contact',
      phone: 'supplier-phone',
      email: 'supplier-email',
      address: 'supplier-address',
      materials: 'supplier-materials',
      status: 'supplier-status'
    },
    staffPane: {
      id: 'staff-id-input',
      firstName: 'staff-firstName',
      lastName: 'staff-lastName',
      email: 'staff-email',
      role: 'staff-role',
      dept: 'staff-dept',
      department: 'staff-dept',
      rate: 'staff-rate',
      access: 'staff-access'
    },
    maintPane: {
      id: 'maint-id-input',
      machine: 'maint-machine',
      issue: 'maint-issue',
      reportedBy: 'maint-reportedBy',
      reportedDate: 'maint-reportedDate',
      estEndDate: 'maint-estEndDate',
      severity: 'maint-severity',
      status: 'maint-status'
    },
    workopsPane: {
      id: 'workops-id-input',
      mfgRef: 'workops-mfgRef',
      product: 'workops-product',
      stage: 'workops-stage',
      staff: 'workops-staff',
      machine: 'workops-machine',
      estTime: 'workops-estTime',
      actualTime: 'workops-actualTime',
      qty: 'workops-qty',
      priority: 'workops-priority',
      status: 'workops-status',
      startTime: 'workops-startTime',
      scheduledStart: 'workops-startTime',
      instructions: 'workops-instructions'
    },
    uomPane: {
      id: 'uom-id-input',
      code: 'uom-id-input',
      name: 'uom-name',
      category: 'uom-category',
      isBase: 'uom-isBase',
      factor: 'uom-factor',
      base: 'uom-base'
    }
  };
  
  return mappings[paneId] || {};
}

function addMaterialsToPane(pane, data) {
  const workopsMaterialsTbody = pane.querySelector('#workops-materials-tbody');
  if (workopsMaterialsTbody) {
    workopsMaterialsTbody.innerHTML = '';
    
    if (data.materials && Array.isArray(data.materials)) {
      data.materials.forEach(mat => {
        const tr = document.createElement('tr');
        const status = mat.status || '';
        const statusClass = status.toLowerCase().includes('low')
          ? 'badge badge-pending'
          : 'badge badge-active';
        tr.innerHTML = `
          <td>${mat.material || ''}</td>
          <td>${mat.required || mat.qty || ''}</td>
          <td>${mat.allocated || ''}</td>
          <td>${mat.available || mat.inStock || ''}</td>
          <td><span class="${statusClass}">${status || ''}</span></td>
        `;
        workopsMaterialsTbody.appendChild(tr);
      });
    }
    
    return;
  }
  
  const materialsTbody = pane.querySelector('#mfg-materials-tbody, #bom-materials-tbody');
  if (!materialsTbody) return;
  
  materialsTbody.innerHTML = '';
  
  if (data.materials && Array.isArray(data.materials)) {
    data.materials.forEach(mat => {
      const extraValue = mat.inStock || mat.notes || '';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input class="pane-input" value="${mat.material || ''}" style="width:100%"></td>
        <td><select class="pane-select"><option>${mat.uom || ''}</option></select></td>
        <td><input class="pane-input" type="number" value="${mat.qty || ''}" style="width:80px"></td>
        <td><input class="pane-input" type="number" value="${mat.wastage || 0}" style="width:60px"></td>
        <td><input class="pane-input" value="${extraValue}" style="width:80px"></td>
        <td><button class="btn-remove-row" onclick="removeRow(this)">×</button></td>
      `;
      materialsTbody.appendChild(tr);
    });
  }
}

function addStagesToPane(pane, data) {
  const stagesTbody = pane.querySelector('#mfg-stages-tbody');
  if (!stagesTbody) return;
  
  stagesTbody.innerHTML = '';
  
  if (data.stages && Array.isArray(data.stages)) {
    data.stages.forEach((stage, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td><input class="pane-input" value="${stage.stage || ''}" style="width:100%"></td>
        <td><input class="pane-input" value="${stage.role || ''}" style="width:100px"></td>
        <td><input class="pane-input" value="${stage.time || ''}" style="width:80px"></td>
        <td><input class="pane-input" value="${stage.cost || ''}" style="width:80px"></td>
        <td><button class="btn-remove-row" onclick="removeRow(this)">×</button></td>
      `;
      stagesTbody.appendChild(tr);
    });
  }
}

function resetPaneFields(pane) {
  pane.querySelectorAll('input, select, textarea').forEach(input => {
    if (input.classList.contains('pane-input') || 
        input.classList.contains('pane-select') || 
        input.classList.contains('pane-textarea')) {
      if (input.type === 'checkbox' || input.type === 'radio') {
        input.checked = false;
      } else if (input.tagName === 'SELECT') {
        input.selectedIndex = 0;
      } else {
        input.value = '';
      }
    }
  });
  
  pane.querySelectorAll('#mfg-materials-tbody, #bom-materials-tbody, #workops-materials-tbody').forEach(tbody => {
    tbody.innerHTML = '';
  });
  
  const stagesTbody = pane.querySelector('#mfg-stages-tbody');
  if (stagesTbody) {
    stagesTbody.innerHTML = '';
  }
}

function addMfgMaterialRow() {
  const tbody = document.getElementById('mfg-materials-tbody');
  if (!tbody) return;
  
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="pane-input" placeholder="Material name" style="width:100%"></td>
    <td><select class="pane-select"><option value="">UOM...</option><option>SHT</option><option>M</option><option>KG</option><option>L</option><option>PCS</option></select></td>
    <td><input class="pane-input" type="number" placeholder="0" style="width:80px"></td>
    <td><input class="pane-input" type="number" placeholder="0" style="width:60px"></td>
    <td><input class="pane-input" placeholder="Stock" style="width:80px"></td>
    <td><button class="btn-remove-row" onclick="removeRow(this)">×</button></td>
  `;
  tbody.appendChild(tr);
}

function addMfgStageRow() {
  const tbody = document.getElementById('mfg-stages-tbody');
  if (!tbody) return;
  
  const rowNum = tbody.children.length + 1;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${rowNum}</td>
    <td><input class="pane-input" placeholder="Stage name" style="width:100%"></td>
    <td><input class="pane-input" placeholder="Role" style="width:100px"></td>
    <td><input class="pane-input" placeholder="Time" style="width:80px"></td>
    <td><input class="pane-input" placeholder="Cost" style="width:80px"></td>
    <td><button class="btn-remove-row" onclick="removeRow(this)">×</button></td>
  `;
  tbody.appendChild(tr);
}

function addBomMaterialRow() {
  const tbody = document.getElementById('bom-materials-tbody');
  if (!tbody) return;
  
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="pane-input" placeholder="Material name" style="width:100%"></td>
    <td><select class="pane-select"><option value="">UOM...</option><option>SHT</option><option>M</option><option>KG</option><option>L</option><option>PCS</option></select></td>
    <td><input class="pane-input" type="number" placeholder="0" style="width:80px"></td>
    <td><input class="pane-input" type="number" placeholder="0" style="width:60px"></td>
    <td><input class="pane-input" placeholder="Notes" style="width:120px"></td>
    <td><button class="btn-remove-row" onclick="removeRow(this)">×</button></td>
  `;
  tbody.appendChild(tr);
}

function removeRow(btn) {
  const row = btn.closest('tr');
  if (row) row.remove();
}

function getStatusBadgeClassName(status) {
  const normalized = (status || '').toLowerCase();
  
  if (normalized === 'in production' || normalized === 'in progress') return 'badge badge-production';
  if (normalized === 'completed' || normalized === 'delivered' || normalized === 'received' || normalized === 'packed') return 'badge badge-complete';
  if (normalized === 'shipped') return 'badge badge-shipped';
  if (normalized === 'approved' || normalized === 'active' || normalized === 'ready' || normalized === 'resolved' || normalized === 'ok') return 'badge badge-active';
  if (normalized.includes('pending') || normalized === 'quote' || normalized === 'paused' || normalized === 'on leave' || normalized === 'scheduled' || normalized === 'low stock') return 'badge badge-pending';
  if (normalized === 'rejected' || normalized === 'cancelled' || normalized === 'critical') return 'badge badge-danger';
  
  return 'badge badge-' + normalized.replace(/[^a-z0-9]+/g, '-');
}

function updateStatus(btn, newStatus) {
  console.log('updateStatus called:', btn, newStatus);
  const row = btn.closest('tr');
  if (row) {
    const statusBadge = row.querySelector('td:nth-last-child(2) .badge') ||
                        Array.from(row.querySelectorAll('.badge')).pop();
    if (statusBadge) {
      statusBadge.className = getStatusBadgeClassName(newStatus);
      statusBadge.textContent = newStatus;
    }
    row.setAttribute('data-status', newStatus);
  }
  showToast('Status updated to ' + newStatus, 'success');
}

function triggerMRP(soRef) {
  console.log('triggerMRP called:', soRef);
  showToast('MRP triggered for ' + soRef, 'success');
}

function confirmSalesOrder(btn, soRef) {
  console.log('confirmSalesOrder called:', soRef);
  updateStatus(btn, 'Pending MFG');
  showToast('Sales order ' + soRef + ' confirmed', 'success');
}

function showToast(message, type) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + (type || 'info');
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--' + (type === 'success' ? 'success' : 'gray-800') + ');color:white;padding:12px 20px;border-radius:8px;z-index:10000;animation:fadeIn 0.3s';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function closePane() {
  console.log('closePane called');
  document.querySelectorAll('.pane.open').forEach(p => p.classList.remove('open'));
  const backdrop = document.querySelector('.pane-backdrop.open');
  if (backdrop) backdrop.classList.remove('open');
  document.body.style.overflow = '';
}

async function doLogout() {
  if (!confirm('Sign out of ForgeFlow?')) return;
  await signOut();
  localStorage.removeItem('forgeflow_user');
  localStorage.removeItem('forgeflow_trial_start');
  sessionStorage.removeItem('forgeflow_trial_start');
  window.location.href = 'index.html';
}

// ============ INTEGRATION FUNCTIONS ============
async function connectIntegration(provider) {
  console.log('connectIntegration called:', provider);
  
  const btn = document.getElementById(provider + '-connect') || document.getElementById('settings-' + provider + '-connect');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Connecting...';
  }
  
  try {
    if (window.IntegrationService) {
      const result = await window.IntegrationService.connect(provider);
      
      if (result.redirecting) {
        showToast('Redirecting to ' + provider + '...', 'info');
        return;
      }
      
      if (result.requiresConfig) {
        showToast('Please configure ' + provider + ' settings', 'info');
        openIntegrationConfigModal(provider);
        return;
      }
    }
    
    const statusMap = {
      zoho: 'Zoho Suite',
      shopify: 'Shopify',
      quickbooks: 'QuickBooks',
      xero: 'Xero',
      gsheets: 'Google Sheets',
      webhooks: 'Webhooks'
    };
    
    updateIntegrationStatus(provider, true);
    showToast('Connected to ' + (statusMap[provider] || provider) + ' successfully!', 'success');
  } catch (error) {
    console.error('Failed to connect integration:', error);
    showToast('Failed to connect to ' + provider + ': ' + error.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Connect';
    }
  }
}

function configureIntegration(provider) {
  console.log('configureIntegration called:', provider);
  openIntegrationConfigModal(provider);
}

function openIntegrationConfigModal(provider) {
  const configs = {
    webhooks: {
      title: 'Configure Webhook',
      fields: [
        { id: 'webhookUrl', label: 'Webhook URL', type: 'url', placeholder: 'https://your-webhook-endpoint.com/hook' },
        { id: 'webhookSecret', label: 'Secret Key', type: 'text', placeholder: 'Enter secret key' },
        { id: 'webhookEvents', label: 'Events', type: 'multiselect', options: ['order.created', 'order.updated', 'inventory.low', 'mfg.completed'] }
      ]
    }
  };
  
  const config = configs[provider];
  if (!config) {
    showToast('Configuration not available for ' + provider, 'info');
    return;
  }
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'integrationConfigModal';
  modal.innerHTML = `
    <div class="modal-container" style="max-width: 500px;">
      <div class="modal-header">
        <h2>${config.title}</h2>
        <button class="modal-close" onclick="closeIntegrationConfigModal()">×</button>
      </div>
      <div class="modal-body">
        ${config.fields.map(field => `
          <div class="form-group">
            <label>${field.label}</label>
            ${field.type === 'multiselect' 
              ? `<div class="checkbox-group">
                  ${field.options.map(opt => `
                    <label class="checkbox-label">
                      <input type="checkbox" value="${opt}" checked> ${opt}
                    </label>
                  `).join('')}
                </div>`
              : `<input type="${field.type}" id="${field.id}" class="form-input" placeholder="${field.placeholder || ''}">`
            }
          </div>
        `).join('')}
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeIntegrationConfigModal()">Cancel</button>
        <button class="btn-primary" onclick="saveIntegrationConfig('${provider}')">Save Configuration</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeIntegrationConfigModal() {
  const modal = document.getElementById('integrationConfigModal');
  if (modal) {
    modal.classList.remove('open');
    setTimeout(() => modal.remove(), 300);
  }
  document.body.style.overflow = '';
}

async function saveIntegrationConfig(provider) {
  if (provider === 'webhooks') {
    const url = document.getElementById('webhookUrl')?.value;
    const secret = document.getElementById('webhookSecret')?.value;
    const events = [];
    document.querySelectorAll('#integrationConfigModal input[type="checkbox"]:checked').forEach(cb => {
      events.push(cb.value);
    });
    
    if (!url) {
      showToast('Please enter a webhook URL', 'warn');
      return;
    }
    
    try {
      if (window.IntegrationService) {
        await window.IntegrationService.saveWebhookConfig(url, secret, events);
      }
      
      const settings = JSON.parse(localStorage.getItem('forgeflow_integration_settings') || '{}');
      settings[provider] = { url, secret, events };
      localStorage.setItem('forgeflow_integration_settings', JSON.stringify(settings));
      
      closeIntegrationConfigModal();
      updateIntegrationStatus(provider, true);
      showToast('Webhook configuration saved!', 'success');
    } catch (error) {
      console.error('Failed to save webhook config:', error);
      showToast('Failed to save configuration', 'error');
    }
  }
}

function updateIntegrationStatus(provider, connected) {
  const statusEl = document.getElementById(provider + '-status') || document.getElementById('settings-' + provider + '-status');
  const connectBtn = document.getElementById(provider + '-connect') || document.getElementById('settings-' + provider + '-connect');
  const configBtn = document.getElementById(provider + '-config') || document.getElementById('settings-' + provider + '-config');
  
  if (statusEl) {
    if (connected) {
      statusEl.textContent = 'Connected';
      statusEl.className = 'integration-status connected';
    } else {
      statusEl.textContent = 'Not Connected';
      statusEl.className = 'integration-status disconnected';
    }
  }
  
  if (connectBtn && configBtn) {
    if (connected) {
      connectBtn.style.display = 'none';
      configBtn.style.display = 'inline-block';
      configBtn.textContent = 'Disconnect';
      configBtn.onclick = () => disconnectIntegration(provider);
    } else {
      connectBtn.style.display = 'inline-block';
      configBtn.style.display = 'none';
    }
  }
}

async function disconnectIntegration(provider) {
  if (!confirm('Are you sure you want to disconnect ' + provider + '?')) return;
  
  try {
    if (window.IntegrationService) {
      await window.IntegrationService.disconnect(provider);
    }
    
    updateIntegrationStatus(provider, false);
    showToast('Disconnected from ' + provider, 'success');
  } catch (error) {
    console.error('Failed to disconnect:', error);
    showToast('Failed to disconnect', 'error');
  }
}

function closeIntegrationModal() {
  const modal = document.getElementById('integrationModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

// ============ RECORD MANAGEMENT ============
function saveRecord(type, id) {
  console.log('saveRecord called:', type, id);
  
  if (currentPaneData.mode === 'view') {
    showToast('Use Edit to update this entry', 'warn');
    return;
  }
  
  const paneId = getPaneId(type);
  const paneConfig = paneDataMap[paneId] || {};
  const recordData = collectPaneData(type);
  console.log('Record data:', recordData);
  
  const now = new Date().toISOString();
  const recordId =
    id ||
    currentPaneData.id ||
    recordData.id ||
    (paneConfig.dataKey ? generateRecordId(paneConfig.dataKey) : `${type.replace(/\s+/g, '_')}_${Date.now()}`);
  
  recordData.id = recordId;
  recordData.updatedAt = now;
  if (!recordData.createdAt) {
    recordData.createdAt = currentPaneData.originalData?.createdAt || now;
  }
  
  if (paneConfig.dataKey) {
    if (!mockData[paneConfig.dataKey]) mockData[paneConfig.dataKey] = {};
    mockData[paneConfig.dataKey][recordId] = {
      ...(mockData[paneConfig.dataKey][recordId] || {}),
      ...recordData
    };
    saveRecordOverride(paneConfig.dataKey, recordId, mockData[paneConfig.dataKey][recordId]);
  }
  
  closePane();
  showToast(
    type + (currentPaneData.mode === 'edit' ? ' updated successfully!' : ' saved successfully!'),
    'success'
  );
  
  if (typeof refreshCurrentModule === 'function') {
    refreshCurrentModule();
  }
}

function getLegacyRecordStorageKey(type) {
  return 'forgeflow_' + type.toLowerCase().replace(/\s+/g, '_') + 's';
}

function generateRecordId(dataKey) {
  const prefixMap = {
    mfg: 'MFG',
    inventory: 'INV',
    sales: 'SO',
    pr: 'PR',
    bom: 'BOM',
    suppliers: 'SUP',
    staff: 'STF',
    maintenance: 'MNT',
    operations: 'OP',
    uom: 'UOM'
  };
  
  const prefix = prefixMap[dataKey] || 'REC';
  const mergedData = {
    ...(mockData[dataKey] || {}),
    ...(getRecordOverrides()[dataKey] || {})
  };
  const ids = Object.keys(mergedData);
  const numericParts = ids
    .map(k => k.match(/-(\d+)$/))
    .filter(Boolean)
    .map(m => m[1]);
  
  const next = numericParts.length
    ? Math.max(...numericParts.map(n => parseInt(n, 10))) + 1
    : 1;
  const width = numericParts.length
    ? Math.max(...numericParts.map(s => s.length))
    : 4;
  
  return `${prefix}-${String(next).padStart(width, '0')}`;
}

function collectTableRows(tbody, mapper) {
  if (!tbody) return [];
  return Array.from(tbody.querySelectorAll('tr'))
    .map(mapper)
    .filter(row => Object.values(row).some(value => String(value || '').trim() !== ''));
}

function collectPaneData(type) {
  const paneId = getPaneId(type);
  if (!paneId) return {};
  
  const pane = document.getElementById(paneId);
  if (!pane) return {};
  
  const reverseMappings = {};
  Object.entries(getFieldMappings(paneId)).forEach(([recordKey, fieldId]) => {
    if (!reverseMappings[fieldId]) reverseMappings[fieldId] = recordKey;
  });
  
  const data = {};
  pane.querySelectorAll('input[id], select[id], textarea[id]').forEach(input => {
    const recordKey = reverseMappings[input.id] || input.id;
    const value = input.type === 'checkbox' ? input.checked : input.value;
    data[recordKey] = value;
  });
  
  if (currentPaneData.id) data.id = currentPaneData.id;
  
  if (paneId === 'mfgPane' || paneId === 'bomPane') {
    const materialsKey = paneId === 'mfgPane' ? 'inStock' : 'notes';
    const materialsTbody = pane.querySelector('#mfg-materials-tbody, #bom-materials-tbody');
    data.materials = collectTableRows(materialsTbody, row => ({
      material: row.cells?.[0]?.querySelector('input')?.value?.trim() || '',
      uom: row.cells?.[1]?.querySelector('select')?.value?.trim() || '',
      qty: row.cells?.[2]?.querySelector('input')?.value?.trim() || '',
      wastage: row.cells?.[3]?.querySelector('input')?.value?.trim() || '',
      [materialsKey]: row.cells?.[4]?.querySelector('input')?.value?.trim() || ''
    }));
  }
  
  if (paneId === 'mfgPane') {
    const stagesTbody = pane.querySelector('#mfg-stages-tbody');
    data.stages = collectTableRows(stagesTbody, row => ({
      stage: row.cells?.[1]?.querySelector('input')?.value?.trim() || '',
      role: row.cells?.[2]?.querySelector('input')?.value?.trim() || '',
      time: row.cells?.[3]?.querySelector('input')?.value?.trim() || '',
      cost: row.cells?.[4]?.querySelector('input')?.value?.trim() || ''
    }));
  }
  
  if (paneId === 'workopsPane') {
    const materialsTbody = pane.querySelector('#workops-materials-tbody');
    data.materials = collectTableRows(materialsTbody, row => ({
      material: row.cells?.[0]?.textContent?.trim() || '',
      required: row.cells?.[1]?.textContent?.trim() || '',
      allocated: row.cells?.[2]?.textContent?.trim() || '',
      available: row.cells?.[3]?.textContent?.trim() || '',
      status: row.cells?.[4]?.textContent?.trim() || ''
    }));
  }
  
  return data;
}

async function viewRecord(type, id) {
  console.log('viewRecord called:', type, id);
  
  const paneId = getPaneId(type);
  const dataKey = paneDataMap[paneId]?.dataKey;
  
  await hydrateModuleRecords();
  let record = dataKey ? lookupRecord(dataKey, id) : null;
  if (!record && dataKey) {
    record = await fetchRecordFromServer(dataKey, id);
  }
  
  if (!record) {
    showToast('Record not found', 'error');
    return;
  }
  
  await openPane(
    paneId,
    getPaneTitle(type, { id, ...record }),
    getPaneStatus(record),
    { id, ...record },
    'view'
  );
}

async function editRecord(type, id) {
  console.log('editRecord called:', type, id);
  
  const paneId = getPaneId(type);
  const dataKey = paneDataMap[paneId]?.dataKey;
  
  await hydrateModuleRecords();
  let record = dataKey ? lookupRecord(dataKey, id) : null;
  if (!record && dataKey) {
    record = await fetchRecordFromServer(dataKey, id);
  }
  
  if (!record) {
    showToast('Record not found', 'error');
    return;
  }
  
  await openPane(
    paneId,
    getPaneTitle(type, { id, ...record }),
    getPaneStatus(record),
    { id, ...record },
    'edit'
  );
}

function populatePaneWithData(type, data) {
  const paneMap = {
    'Manufacturing Order': 'mfgPane',
    'Inventory Item': 'invPane',
    'Sales Order': 'salesPane',
    'Purchase Request': 'prPane',
    'BOM': 'bomPane',
    'Supplier': 'supplierPane',
    'Staff Member': 'staffPane',
    'Maintenance Request': 'maintPane',
    'Operation': 'workopsPane',
    'UOM': 'uomPane'
  };
  
  const paneId = paneMap[type];
  const pane = document.getElementById(paneId);
  if (!pane) return;
  
  Object.entries(data).forEach(([key, value]) => {
    if (key === 'id' || key === 'createdAt' || key === 'updatedAt') return;
    
    const input = pane.querySelector(`[id*="${key}"]`) || pane.querySelector(`[name="${key}"]`);
    if (input) {
      input.value = value;
    }
  });
}

function getPaneId(type) {
  const map = {
    'Manufacturing Order': 'mfgPane',
    'Inventory Item': 'invPane',
    'Sales Order': 'salesPane',
    'Purchase Request': 'prPane',
    'BOM': 'bomPane',
    'Supplier': 'supplierPane',
    'Staff Member': 'staffPane',
    'Maintenance Request': 'maintPane',
    'Operation': 'workopsPane',
    'UOM': 'uomPane'
  };
  return map[type] || '';
}

const moduleTypeByViewId = {
  'mod-manufacturing': 'Manufacturing Order',
  'mod-workops': 'Operation',
  'mod-inventory': 'Inventory Item',
  'mod-sales': 'Sales Order',
  'mod-purchase': 'Purchase Request',
  'mod-bom': 'BOM',
  'mod-uom': 'UOM',
  'mod-suppliers': 'Supplier',
  'mod-staff': 'Staff Member',
  'mod-maintenance': 'Maintenance Request'
};

function resolveRecordTypeFromButton(button) {
  const moduleView = button?.closest('.module-view');
  if (!moduleView) return null;
  return moduleTypeByViewId[moduleView.id] || null;
}

let recordActionHandlersBound = false;

function bindRecordActionButtons() {
  if (recordActionHandlersBound) return;

  document.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('button.act-btn-view, button.act-btn-edit');
    if (!button) return;
    const inlineAction = button.getAttribute('onclick') || '';
    if (!inlineAction.includes('openPane(')) return;

    const type = resolveRecordTypeFromButton(button);
    if (!type) return;

    const paneId = getPaneId(type);
    const recordId = extractIdFromRow(button.closest('tr'), paneId);
    if (!recordId) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (button.classList.contains('act-btn-view')) {
      await viewRecord(type, recordId);
      return;
    }

    await editRecord(type, recordId);
  }, true);

  recordActionHandlersBound = true;
}

function getPaneTitle(type, data) {
  return data.id ? `${type} - ${data.id}` : `New ${type}`;
}

function getPaneStatus(data) {
  return data.status || 'Active';
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.json,.xlsx';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target.result;
        
        if (file.name.endsWith('.json')) {
          const data = JSON.parse(content);
          processImportedData(data);
        } else if (file.name.endsWith('.csv')) {
          const data = parseCSV(content);
          processImportedData(data);
        } else {
          showToast('Unsupported file format. Please use CSV or JSON.', 'error');
        }
      } catch (error) {
        console.error('Import error:', error);
        showToast('Failed to import data: ' + error.message, 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function parseCSV(content) {
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    data.push(row);
  }
  
  return data;
}

function processImportedData(data) {
  if (!Array.isArray(data)) data = [data];
  showToast(`Imported ${data.length} record(s) successfully!`, 'success');
  console.log('Imported data:', data);
}

// ============ SETTINGS FUNCTIONS ============
const planDetails = {
  trial: {
    name: 'Free Trial',
    price: '$0',
    period: '/14 days',
    features: ['Full platform access', 'Up to 3 users', '100MB storage', 'Community support'],
    limits: {
      products: 100,
      users: 3,
      storage: '100MB',
      api: '1,000'
    }
  },
  starter: {
    name: 'Starter',
    price: '$150',
    period: '/month',
    priceCents: 15000,
    features: ['Up to 15 users', 'Basic inventory tracking', 'Sales orders management', 'Purchase requests', 'BOM management', 'Email support'],
    limits: {
      products: 500,
      users: 15,
      storage: '10GB',
      api: '10,000'
    }
  },
  professional: {
    name: 'Professional',
    price: '$250',
    period: '/month',
    priceCents: 25000,
    features: ['Up to 30 users', 'Full inventory management', 'Sales orders management', 'Purchase requests', 'BOM management', 'Workfloor operations', 'Advanced reporting', 'API access', 'Priority support'],
    limits: {
      products: 2000,
      users: 30,
      storage: '50GB',
      api: '100,000'
    }
  },
  enterprise: {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    priceCents: 0,
    features: ['Unlimited users', 'Full inventory management', 'Sales orders management', 'Purchase requests', 'BOM management', 'Workfloor operations', 'Advanced reporting', 'API access', 'Multi-warehouse', 'Advanced automation', 'Custom integrations', 'Dedicated support', 'SLA guarantee'],
    limits: {
      products: 'Unlimited',
      users: 'Unlimited',
      storage: 'Unlimited',
      api: 'Unlimited'
    }
  }
};

// Subscription Billing Management
function getSubscription() {
  return JSON.parse(localStorage.getItem('forgeflow_subscription') || 'null');
}

function setSubscription(sub) {
  localStorage.setItem('forgeflow_subscription', JSON.stringify(sub));
}

function initSubscription() {
  let subscription = getSubscription();
  
  if (!subscription) {
    subscription = {
      status: 'trial',
      plan: 'trial',
      startDate: new Date().toISOString(),
      trialEndDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      billingCycle: 'monthly',
      lastPaymentDate: null,
      nextPaymentDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      paymentHistory: []
    };
    setSubscription(subscription);
  }
  
  return subscription;
}

function activateSubscription(planKey) {
  const now = new Date();
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  
  const subscription = {
    status: 'active',
    plan: planKey,
    planName: planDetails[planKey]?.name || 'Unknown',
    startDate: now.toISOString(),
    trialEndDate: null,
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: nextMonth.toISOString(),
    billingCycle: 'monthly',
    lastPaymentDate: now.toISOString(),
    nextPaymentDate: nextMonth.toISOString(),
    paymentHistory: []
  };
  
  // Add first payment record
  const plan = planDetails[planKey];
  subscription.paymentHistory.unshift({
    id: 'sub_' + Date.now(),
    date: now.toISOString(),
    description: plan.name + ' Plan - First Month',
    amount: plan.priceCents || 0,
    status: 'paid',
    invoiceId: 'INV-' + Date.now()
  });
  
  setSubscription(subscription);
  
  // Update user plan
  const user = getForgeflowUser() || {};
  user.planLabel = planKey.toUpperCase() === 'PROFESSIONAL' ? 'PRO' : planKey.toUpperCase();
  user.planName = plan.name;
  setForgeflowUser(user);
  
  return subscription;
}

function checkAndProcessRenewal() {
  const subscription = getSubscription();
  if (!subscription || subscription.status !== 'active') return;
  
  const now = new Date();
  const nextPayment = new Date(subscription.nextPaymentDate);
  
  // If next payment date has passed
  if (now >= nextPayment) {
    // In production, this would trigger payment collection via Paystack
    // For demo, we'll simulate successful renewal
    simulateRenewal();
  }
}

function simulateRenewal() {
  const subscription = getSubscription();
  if (!subscription) return;
  
  const now = new Date();
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  
  const plan = planDetails[subscription.plan] || planDetails.starter;
  
  subscription.currentPeriodStart = now.toISOString();
  subscription.currentPeriodEnd = nextMonth.toISOString();
  subscription.lastPaymentDate = now.toISOString();
  subscription.nextPaymentDate = nextMonth.toISOString();
  
  // Add payment to history
  subscription.paymentHistory.unshift({
    id: 'sub_' + Date.now(),
    date: now.toISOString(),
    description: plan.name + ' Plan - Monthly Renewal',
    amount: plan.priceCents || 0,
    status: 'paid',
    invoiceId: 'INV-' + Date.now()
  });
  
  setSubscription(subscription);
  showToast('Monthly subscription renewed successfully!', 'success');
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function getTrialDaysRemaining() {
  const subscription = getSubscription();
  if (!subscription) return 14;
  
  const now = new Date();
  const endDate = new Date(subscription.trialEndDate || subscription.nextPaymentDate);
  const diff = endDate - now;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function updateBillingInfo() {
  const subscription = initSubscription();
  const user = getForgeflowUser() || {};
  const planKey = planLabels[user.planLabel] || 'trial';
  const isPaidPlan = ['STARTER', 'PRO', 'PROFESSIONAL', 'ENTERPRISE'].includes(user.planLabel);
  
  const billingCard = document.getElementById('billingInfoCard');
  const statusDot = document.getElementById('billingStatusDot');
  const statusText = document.getElementById('billingStatusText');
  const billingDetails = document.getElementById('billingDetails');
  const billingTrialInfo = document.getElementById('billingTrialInfo');
  const trialDaysLeft = document.getElementById('trialDaysLeft');
  
  if (!billingCard) return;
  
  billingCard.classList.remove('active', 'trial');
  
  if (isPaidPlan) {
    billingCard.classList.add('active');
    statusText.textContent = 'Active Subscription';
    billingDetails.style.display = 'grid';
    billingTrialInfo.style.display = 'none';
    
    const plan = planDetails[planKey];
    document.getElementById('nextPaymentDate').textContent = formatDate(subscription.nextPaymentDate);
    document.getElementById('amountDue').textContent = plan ? plan.price + '/mo' : '-';
    document.getElementById('billingCycle').textContent = subscription.billingCycle.charAt(0).toUpperCase() + subscription.billingCycle.slice(1);
  } else {
    billingCard.classList.add('trial');
    statusText.textContent = 'Free Trial';
    billingDetails.style.display = 'none';
    billingTrialInfo.style.display = 'block';
    trialDaysLeft.textContent = getTrialDaysRemaining() + ' days';
  }
  
  // Update billing history
  updateBillingHistory(subscription.paymentHistory, isPaidPlan);
}

function updateBillingHistory(paymentHistory, isPaidPlan) {
  const tbody = document.getElementById('billingHistoryBody');
  if (!tbody) return;
  
  let html = '';
  
  if (!isPaidPlan) {
    html = `<tr><td>${formatDate(new Date().toISOString())}</td><td>Free Trial Started</td><td>$0.00</td><td><span class="badge badge-paid">Active</span></td></tr>`;
  } else if (paymentHistory && paymentHistory.length > 0) {
    paymentHistory.forEach(payment => {
      html += `<tr>
        <td>${formatDate(payment.date)}</td>
        <td>${payment.description}</td>
        <td>${formatCurrency(payment.amount)}</td>
        <td><span class="badge badge-${payment.status}">${payment.status === 'paid' ? 'Paid' : payment.status}</span></td>
      </tr>`;
    });
  } else {
    html = `<tr><td colspan="4" style="text-align: center; color: var(--gray-400);">No billing history</td></tr>`;
  }
  
  tbody.innerHTML = html;
}

function updateBillingSection() {
  const userData = getForgeflowUser() || {};
  const planKey = planLabels[userData.planLabel] || 'trial';
  const plan = planDetails[planKey];
  const paidPlans = ['STARTER', 'PRO', 'PROFESSIONAL', 'ENTERPRISE'];
  const isPaidPlan = paidPlans.includes(userData.planLabel);
  
  const planCard = document.querySelector('.plan-card.current');
  const planNameEl = document.getElementById('currentPlanName');
  const planPriceEl = document.getElementById('currentPlanPrice');
  const planFeaturesEl = document.querySelector('.plan-features ul');
  const upgradeBtn = document.querySelector('.plan-card.current .btn-primary');
  
  if (planCard) {
    planCard.classList.toggle('paid-plan', isPaidPlan);
  }
  
  if (planNameEl) planNameEl.textContent = plan.name;
  if (planPriceEl) planPriceEl.innerHTML = plan.price + '<span>' + plan.period + '</span>';
  
  if (planFeaturesEl) {
    planFeaturesEl.innerHTML = plan.features.map(f => `<li>${f}</li>`).join('');
  }
  
  if (upgradeBtn) {
    if (isPaidPlan) {
      upgradeBtn.textContent = 'Manage Plan';
    } else {
      upgradeBtn.textContent = 'Upgrade Plan';
    }
  }
  
  updateUsageSection(planKey);
}

function updateUsageSection(planKey) {
  const plan = planDetails[planKey] || planDetails.trial;
  const limits = plan.limits;
  
  // Get current usage (these would come from the backend in production)
  const currentUsage = {
    products: 15,
    users: 3,
    storageGB: 0.8,
    apiCalls: 150
  };
  
  // Update Products
  const productsEl = document.getElementById('usageProducts');
  const productsFill = document.getElementById('usageProductsFill');
  if (productsEl && limits.products !== 'Unlimited') {
    const pct = Math.min((currentUsage.products / limits.products) * 100, 100);
    productsEl.textContent = `${currentUsage.products} / ${limits.products}`;
    if (productsFill) productsFill.style.width = pct + '%';
  } else if (productsEl) {
    productsEl.textContent = `${currentUsage.products} / ${limits.products}`;
    if (productsFill) productsFill.style.width = '5%';
  }
  
  // Update Users
  const usersEl = document.getElementById('usageUsers');
  const usersFill = document.getElementById('usageUsersFill');
  if (usersEl && limits.users !== 'Unlimited') {
    const pct = Math.min((currentUsage.users / limits.users) * 100, 100);
    usersEl.textContent = `${currentUsage.users} / ${limits.users}`;
    if (usersFill) usersFill.style.width = pct + '%';
  } else if (usersEl) {
    usersEl.textContent = `${currentUsage.users} / ${limits.users}`;
    if (usersFill) usersFill.style.width = '5%';
  }
  
  // Update Storage
  const storageEl = document.getElementById('usageStorage');
  const storageFill = document.getElementById('usageStorageFill');
  const storageLimits = { '100MB': 0.1, '10GB': 10, '50GB': 50 };
  if (storageEl && limits.storage !== 'Unlimited') {
    const maxGB = storageLimits[limits.storage] || 10;
    const pct = Math.min((currentUsage.storageGB / maxGB) * 100, 100);
    storageEl.textContent = `${currentUsage.storageGB.toFixed(1)} GB / ${limits.storage}`;
    if (storageFill) storageFill.style.width = pct + '%';
  } else if (storageEl) {
    storageEl.textContent = `${currentUsage.storageGB.toFixed(1)} GB / ${limits.storage}`;
    if (storageFill) storageFill.style.width = '5%';
  }
  
  // Update API Calls
  const apiEl = document.getElementById('usageAPI');
  const apiFill = document.getElementById('usageAPIFill');
  const apiLimits = { '1,000': 1000, '10,000': 10000, '100,000': 100000 };
  if (apiEl && limits.api !== 'Unlimited') {
    const maxAPI = apiLimits[limits.api] || 10000;
    const pct = Math.min((currentUsage.apiCalls / maxAPI) * 100, 100);
    apiEl.textContent = `${currentUsage.apiCalls.toLocaleString()} / ${limits.api}`;
    if (apiFill) apiFill.style.width = pct + '%';
  } else if (apiEl) {
    apiEl.textContent = `${currentUsage.apiCalls.toLocaleString()} / ${limits.api}`;
    if (apiFill) apiFill.style.width = '5%';
  }
}

function openSettingsSubscription() {
  closeUserDropdown();
  showModule('settings', null);
  setTimeout(() => {
    const settingsTab = document.getElementById('settingsTab');
    if (settingsTab) {
      const billingTab = settingsTab.querySelector('[data-tab="billing"]');
      if (billingTab) {
        billingTab.click();
      }
    }
    updateBillingSection();
  }, 50);
}

function switchSettingsTab(el, tabName) {
  // Update nav
  document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
  
  // Update panel
  document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('settings-' + tabName).classList.add('active');
  
  // Update billing section when billing tab is shown
  if (tabName === 'billing') {
    updateBillingSection();
    updateBillingInfo();
    updatePaymentMethodDisplay();
  }
}

function applyCurrentAppearanceSettings() {
  const settings = {
    theme: document.querySelector('.theme-option.active')?.dataset.theme || 'light',
    compactMode: document.getElementById('toggle-compact')?.checked || false,
    fixedSidebar: document.getElementById('toggle-fixed-sidebar')?.checked ?? true,
    iconsOnly: document.getElementById('toggle-icons-only')?.checked || false
  };
  applyAppearanceSettings(settings);
  saveAppearanceSettings();
}

function saveAppearanceSettings() {
  const settings = {
    theme: document.querySelector('.theme-option.active')?.dataset.theme || 'light',
    compactMode: document.getElementById('toggle-compact')?.checked || false,
    fixedSidebar: document.getElementById('toggle-fixed-sidebar')?.checked ?? true,
    iconsOnly: document.getElementById('toggle-icons-only')?.checked || false
  };
  localStorage.setItem('forgeflow_appearance', JSON.stringify(settings));
}

function saveSettings(section) {
  if (section === 'General') {
    const settings = {
      firstName: document.getElementById('settingsFirstName')?.value || '',
      lastName: document.getElementById('settingsLastName')?.value || '',
      email: document.getElementById('settingsEmail')?.value || '',
      phone: document.getElementById('settingsPhone')?.value || '',
      jobTitle: document.getElementById('settingsJobTitle')?.value || '',
      timezone: document.getElementById('settingsTimezone')?.value || 'America/New_York',
      dateFormat: document.getElementById('settingsDateFormat')?.value || 'MM/DD/YYYY',
      currency: document.getElementById('settingsCurrency')?.value || 'USD',
      language: document.getElementById('settingsLanguage')?.value || 'en',
      defaultWarehouse: document.getElementById('settingsDefaultWarehouse')?.value || 'WH-A',
      defaultUOM: document.getElementById('settingsDefaultUOM')?.value || 'metric',
      autoSave: document.getElementById('toggleAutoSave')?.checked || false,
      productivityTips: document.getElementById('toggleProductivityTips')?.checked || false
    };
    localStorage.setItem('forgeflow_general', JSON.stringify(settings));
    
    const user = getForgeflowUser() || {};
    user.firstName = settings.firstName;
    user.lastName = settings.lastName;
    user.email = settings.email;
    user.initials = ((settings.firstName?.[0] || '') + (settings.lastName?.[0] || '')).toUpperCase() || user.initials;
    setForgeflowUser(user);
    
    applyGeneralSettings(settings);
    updateUserUI();
    showToast('General settings saved successfully!', 'success');
    return;
  }
  
  if (section === 'Company') {
    const settings = {
      name: document.getElementById('companyName')?.value || '',
      industry: document.getElementById('companyIndustry')?.value || '',
      size: document.getElementById('companySize')?.value || '',
      address: document.getElementById('companyAddress')?.value || '',
      email: document.getElementById('companyEmail')?.value || '',
      phone: document.getElementById('companyPhone')?.value || '',
      website: document.getElementById('companyWebsite')?.value || '',
      taxId: document.getElementById('companyTaxId')?.value || ''
    };
    localStorage.setItem('forgeflow_company', JSON.stringify(settings));
    applyCompanySettings(settings);
    showToast('Company settings saved successfully!', 'success');
    return;
  }
  
  if (section === 'Security') {
    const settings = {
      twoFactorEnabled: document.getElementById('toggle2FA')?.checked || false
    };
    localStorage.setItem('forgeflow_security', JSON.stringify(settings));
    showToast('Security settings saved successfully!', 'success');
    return;
  }
  
  if (section === 'Notifications') {
    const settings = {
      orderUpdates: document.getElementById('notifOrderUpdates')?.checked || false,
      inventoryAlerts: document.getElementById('notifInventoryAlerts')?.checked || false,
      productionUpdates: document.getElementById('notifProductionUpdates')?.checked || false,
      maintenanceAlerts: document.getElementById('notifMaintenanceAlerts')?.checked || false,
      dailySummary: document.getElementById('notifDailySummary')?.checked || false,
      pushEnabled: document.getElementById('notifPushEnabled')?.checked || false,
      soundAlerts: document.getElementById('notifSoundAlerts')?.checked || false,
      lowStockThreshold: document.getElementById('notifLowStockThreshold')?.value || 20,
      criticalStockThreshold: document.getElementById('notifCriticalStockThreshold')?.value || 10,
      productionDelayAlert: document.getElementById('notifProductionDelayAlert')?.value || 4,
      maintenanceDueDays: document.getElementById('notifMaintenanceDueDays')?.value || 7
    };
    localStorage.setItem('forgeflow_notifications', JSON.stringify(settings));
    applyNotificationSettings(settings);
    showToast('Notification settings saved successfully!', 'success');
    return;
  }
  
  if (section === 'Integrations') {
    const settings = {
      webhooksEnabled: document.querySelector('#settings-integrations input[type="checkbox"]')?.checked || false
    };
    localStorage.setItem('forgeflow_integrations_settings', JSON.stringify(settings));
    showToast('Integration settings saved successfully!', 'success');
    return;
  }
  
  if (section === 'Appearance') {
    const activeColor = document.querySelector('.color-option.active');
    const accentColor = activeColor ? activeColor.style.background : '#FF6A00';
    
    const settings = {
      theme: document.querySelector('.theme-option.active')?.dataset.theme || 'light',
      accentColor: accentColor,
      compactMode: document.getElementById('toggle-compact')?.checked || false,
      fixedSidebar: document.getElementById('toggle-fixed-sidebar')?.checked ?? true,
      iconsOnly: document.getElementById('toggle-icons-only')?.checked || false
    };
    localStorage.setItem('forgeflow_appearance', JSON.stringify(settings));
    applyAppearanceSettings(settings);
    applyAccentColor(accentColor);
    showToast('Appearance settings saved successfully!', 'success');
    return;
  }
  showToast(`${section} settings saved successfully!`, 'success');
}

function applyGeneralSettings(settings) {
  if (settings.firstName || settings.lastName) {
    const initials = ((settings.firstName?.[0] || '') + (settings.lastName?.[0] || '')).toUpperCase();
    updateUserInitials(initials);
  }
}

function applyCompanySettings(settings) {
  const companyNameEl = document.getElementById('companyNameDisplay');
  if (companyNameEl && settings.name) {
    companyNameEl.textContent = settings.name;
  }
}

function updateUserInitials(initials) {
  const avEl = document.querySelector('.user-avatar');
  const avElTop = document.querySelector('.user-avatar-top');
  const avElLarge = document.querySelector('.user-avatar-large');
  if (avEl) avEl.textContent = initials;
  if (avElTop) avElTop.textContent = initials;
  if (avElLarge) avElLarge.textContent = initials;
  
  const user = getForgeflowUser() || {};
  user.initials = initials;
  setForgeflowUser(user);
}

function toggleApiKey() {
  const input = document.getElementById('apiKeyInput');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function copyApiKey() {
  const input = document.getElementById('apiKeyInput');
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('API key copied to clipboard!', 'success');
  });
}

function selectTheme(theme, event) {
  document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('active'));
  const target = event ? event.target.closest('.theme-option') : document.querySelector(`.theme-option[data-theme="${theme}"]`);
  if (target) target.classList.add('active');
  applyTheme(theme);
  saveAppearanceSettings();
}

function selectColor(el, color) {
  document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
  el.classList.add('active');
}

function applyAccentColor(color) {
  document.documentElement.style.setProperty('--cobalt', color);
  document.documentElement.style.setProperty('--cobalt-dark', adjustColorBrightness(color, -20));
  document.documentElement.style.setProperty('--cobalt-light', adjustColorBrightness(color, 40));
  document.documentElement.style.setProperty('--cobalt-shadow', color + '66');
  document.documentElement.style.setProperty('--cobalt-shadow-hover', color + '99');
  document.documentElement.style.setProperty('--sidebar-accent', color);
  document.documentElement.style.setProperty('--sidebar-hover-bg', color + '1a');
  document.documentElement.style.setProperty('--sidebar-count-color', color);
  document.documentElement.style.setProperty('--sidebar-count-border', '1px solid ' + color);
}

function adjustColorBrightness(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

// ============ DATA MANAGEMENT ============
function confirmClearData() {
  if (!confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
    return;
  }
  
  showToast('Clearing all data...', 'warn');
  
  setTimeout(() => {
    const keysToKeep = ['forgeflow_subscription', 'forgeflow_user', 'forgeflow_trial_start', 'forgeflow_roles', 'forgeflow_invited_users'];
    
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('forgeflow_') && !keysToKeep.includes(key)) {
        localStorage.removeItem(key);
      }
    });
    
    showToast('All data has been cleared successfully', 'success');
    
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }, 500);
}

function confirmDeleteAccount() {
  if (!confirm('Are you sure you want to delete your account? All data will be permanently lost.')) {
    return;
  }
  
  if (!confirm('This is your FINAL WARNING! All your data will be permanently deleted. Are you absolutely sure?')) {
    return;
  }
  
  const confirmation = prompt('Type "DELETE" to confirm account deletion:');
  if (confirmation !== 'DELETE') {
    showToast('Account deletion cancelled', 'info');
    return;
  }
  
  showToast('Deleting your account...', 'warn');
  
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('forgeflow_')) {
      localStorage.removeItem(key);
    }
  });
  
  localStorage.removeItem('supabase-auth-token');
  localStorage.removeItem('sb-' + import.meta.env.VITE_SUPABASE_URL + '-auth-token');
  
  setTimeout(() => {
    window.location.href = 'index.html';
  }, 1500);
}

function exportAllData() {
  const allData = {};
  
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('forgeflow_')) {
      try {
        allData[key] = JSON.parse(localStorage.getItem(key));
      } catch {
        allData[key] = localStorage.getItem(key);
      }
    }
  });
  
  const dataStr = JSON.stringify(allData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `forgeflow-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
  showToast('Data exported successfully!', 'success');
}

function exportCurrentModule() {
  const moduleName = document.getElementById('topbarBreadcrumb')?.textContent || 'module';
  const storageKey = 'forgeflow_' + moduleName.toLowerCase().replace(/\s+/g, '_') + 's';
  
  let data = localStorage.getItem(storageKey);
  if (!data) {
    showToast('No data to export in ' + moduleName, 'info');
    return;
  }
  
  const dataStr = JSON.stringify(JSON.parse(data), null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${moduleName.toLowerCase().replace(/\s+/g, '-')}-export.json`;
  a.click();
  
  URL.revokeObjectURL(url);
  showToast(moduleName + ' data exported!', 'success');
}

function clearModuleData(moduleName) {
  if (!confirm('Are you sure you want to clear all ' + moduleName + ' data?')) {
    return;
  }
  
  const storageKey = 'forgeflow_' + moduleName.toLowerCase().replace(/\s+/g, '_') + 's';
  localStorage.removeItem(storageKey);
  
  showToast(moduleName + ' data cleared!', 'success');
  
  setTimeout(() => {
    window.location.reload();
  }, 500);
}

function updatePassword() {
  const current = document.getElementById('currentPassword')?.value;
  const newPass = document.getElementById('newPassword')?.value;
  const confirmPass = document.getElementById('confirmPassword')?.value;
  
  if (!current || !newPass || !confirmPass) {
    showToast('Please fill in all password fields', 'warn');
    return;
  }
  
  if (newPass !== confirmPass) {
    showToast('New passwords do not match', 'error');
    return;
  }
  
  if (newPass.length < 8) {
    showToast('Password must be at least 8 characters', 'warn');
    return;
  }
  
  document.getElementById('currentPassword').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('confirmPassword').value = '';
  showToast('Password updated successfully', 'success');
}

function revokeSession(btn) {
  if (confirm('Are you sure you want to revoke this session?')) {
    const sessionItem = btn.closest('.session-item');
    if (sessionItem) {
      sessionItem.remove();
      showToast('Session revoked successfully', 'success');
    }
  }
}

function regenerateApiKey() {
  if (confirm('Are you sure you want to regenerate your API key? This will invalidate your current key.')) {
    const newKey = 'forgeflow_live_' + Math.random().toString(36).substring(2, 34);
    const apiKeyInput = document.getElementById('apiKeyInput');
    if (apiKeyInput) {
      apiKeyInput.value = newKey;
    }
    showToast('New API key generated', 'success');
  }
}

function uploadCompanyLogo() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      showToast('Logo uploaded successfully', 'success');
    }
  };
  input.click();
}

function removeCompanyLogo() {
  if (confirm('Are you sure you want to remove your company logo?')) {
    showToast('Logo removed', 'success');
  }
}

function upgradePlan() {
  window.location.href = 'pricing-select.html?upgrade=true';
}

// Payment Card Management
function getPaymentMethod() {
  return JSON.parse(localStorage.getItem('forgeflow_payment_method') || 'null');
}

function setPaymentMethod(card) {
  localStorage.setItem('forgeflow_payment_method', JSON.stringify(card));
}

function removePaymentMethodData() {
  localStorage.removeItem('forgeflow_payment_method');
}

function updatePaymentMethodDisplay() {
  const paymentCard = document.getElementById('paymentCardDisplay');
  const cardType = document.getElementById('paymentCardType');
  const cardDesc = document.getElementById('paymentCardDesc');
  const cardBtn = document.getElementById('paymentCardBtn');
  const paymentActions = document.getElementById('paymentActions');
  const cardIcon = document.getElementById('paymentCardIcon');
  
  const savedCard = getPaymentMethod();
  
  if (savedCard) {
    paymentCard.classList.add('has-card');
    if (cardType) cardType.textContent = savedCard.brand + ' ending in ' + savedCard.last4;
    if (cardDesc) cardDesc.textContent = 'Expires ' + savedCard.expiry;
    if (cardBtn) cardBtn.textContent = 'Update';
    if (paymentActions) paymentActions.style.display = 'flex';
  } else {
    paymentCard.classList.remove('has-card');
    if (cardType) cardType.textContent = 'No payment method';
    if (cardDesc) cardDesc.textContent = 'Add a payment method to upgrade';
    if (cardBtn) cardBtn.textContent = 'Add Card';
    if (paymentActions) paymentActions.style.display = 'none';
  }
}

function openAddCardModal() {
  const modal = document.getElementById('addCardModal');
  if (!modal) return;
  
  const savedCard = getPaymentMethod();
  if (savedCard) {
    document.getElementById('cardName').value = savedCard.name || '';
    document.getElementById('cardNumber').value = savedCard.last4 ? '**** **** **** ' + savedCard.last4 : '';
    document.getElementById('cardExpiry').value = savedCard.expiry || '';
  } else {
    document.getElementById('addCardForm').reset();
  }
  
  const errorEl = document.getElementById('cardError');
  if (errorEl) errorEl.classList.remove('show');
  
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeAddCardModal() {
  const modal = document.getElementById('addCardModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

function formatCardNumber(input) {
  let value = input.value.replace(/\D/g, '');
  let formatted = '';
  for (let i = 0; i < value.length; i++) {
    if (i > 0 && i % 4 === 0) formatted += ' ';
    formatted += value[i];
  }
  input.value = formatted.substring(0, 19);
}

function formatCardExpiry(input) {
  let value = input.value.replace(/\D/g, '');
  if (value.length >= 2) {
    value = value.substring(0, 2) + '/' + value.substring(2);
  }
  input.value = value.substring(0, 5);
}

function getCardBrand(number) {
  const firstDigit = number[0];
  const firstTwo = number.substring(0, 2);
  
  if (firstDigit === '4') return 'Visa';
  if (['51', '52', '53', '54', '55'].includes(firstTwo)) return 'Mastercard';
  if (['34', '37'].includes(firstTwo)) return 'Amex';
  if (firstTwo === '60') return 'Paystack';
  return 'Card';
}

function handleAddCard(e) {
  e.preventDefault();
  
  const cardNumber = document.getElementById('cardNumber').value.replace(/\s/g, '');
  const cardExpiry = document.getElementById('cardExpiry').value;
  const cardCvv = document.getElementById('cardCvv').value;
  const cardName = document.getElementById('cardName').value.trim();
  const errorEl = document.getElementById('cardError');
  const submitBtn = document.getElementById('addCardBtn');
  
  // Validate card number
  if (cardNumber.length < 13 || cardNumber.length > 19) {
    if (errorEl) {
      errorEl.textContent = 'Please enter a valid card number';
      errorEl.classList.add('show');
    }
    return;
  }
  
  // Validate expiry
  const expiryParts = cardExpiry.split('/');
  if (expiryParts.length !== 2 || expiryParts[0].length !== 2 || expiryParts[1].length !== 2) {
    if (errorEl) {
      errorEl.textContent = 'Please enter a valid expiry date (MM/YY)';
      errorEl.classList.add('show');
    }
    return;
  }
  
  const month = parseInt(expiryParts[0]);
  const year = parseInt('20' + expiryParts[1]);
  const now = new Date();
  if (month < 1 || month > 12 || year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
    if (errorEl) {
      errorEl.textContent = 'Card has expired or expiry date is invalid';
      errorEl.classList.add('show');
    }
    return;
  }
  
  // Validate CVV
  if (cardCvv.length < 3 || cardCvv.length > 4) {
    if (errorEl) {
      errorEl.textContent = 'Please enter a valid CVV';
      errorEl.classList.add('show');
    }
    return;
  }
  
  // Validate name
  if (!cardName) {
    if (errorEl) {
      errorEl.textContent = 'Please enter the cardholder name';
      errorEl.classList.add('show');
    }
    return;
  }
  
  if (errorEl) errorEl.classList.remove('show');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="loading-spinner"></span> Adding...';
  
  // Simulate card verification (in production, this would use Paystack's API)
  setTimeout(() => {
    const cardBrand = getCardBrand(cardNumber);
    const last4 = cardNumber.slice(-4);
    
    const paymentCard = {
      brand: cardBrand,
      last4: last4,
      expiry: cardExpiry,
      name: cardName,
      addedAt: new Date().toISOString()
    };
    
    setPaymentMethod(paymentCard);
    updatePaymentMethodDisplay();
    closeAddCardModal();
    
    showToast('Payment method added successfully!', 'success');
    
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Add Payment Method';
  }, 1500);
}

function removePaymentMethod() {
  if (!confirm('Are you sure you want to remove this payment method?')) return;
  
  removePaymentMethodData();
  updatePaymentMethodDisplay();
  showToast('Payment method removed', 'success');
}

function addPaymentMethod() {
  openAddCardModal();
}

const availableModules = [
  { id: 'dashboard', name: 'Dashboard', icon: 'chart' },
  { id: 'manufacturing', name: 'Manufacturing Orders', icon: 'package' },
  { id: 'workops', name: 'Work Operations', icon: 'clipboard' },
  { id: 'inventory', name: 'Inventory', icon: 'box' },
  { id: 'sales', name: 'Sales Orders', icon: 'file' },
  { id: 'purchase', name: 'Purchase Requests', icon: 'cart' },
  { id: 'bom', name: 'Product BOM', icon: 'list' },
  { id: 'uom', name: 'Unit of Measure', icon: 'ruler' },
  { id: 'suppliers', name: 'Suppliers', icon: 'truck' },
  { id: 'staff', name: 'Staff', icon: 'users' },
  { id: 'maintenance', name: 'Maintenance', icon: 'tool' }
];

const moduleActions = [
  { id: 'view', name: 'View' },
  { id: 'create', name: 'Create' },
  { id: 'edit', name: 'Edit' },
  { id: 'delete', name: 'Delete' }
];

const defaultRoles = [
  { 
    id: 'superadmin', 
    name: 'Super Admin', 
    tier: 'superadmin', 
    modules: ['all'], 
    permissions: {},
    isSystem: true 
  }
];

function getRoles() {
  const saved = localStorage.getItem('forgeflow_roles');
  if (saved) {
    const parsed = JSON.parse(saved);
    const hasSuperadmin = parsed.find(r => r.id === 'superadmin');
    if (!hasSuperadmin) {
      parsed.unshift(...defaultRoles);
      localStorage.setItem('forgeflow_roles', JSON.stringify(parsed));
    }
    return parsed;
  }
  return [...defaultRoles];
}

function saveRoles(roles) {
  localStorage.setItem('forgeflow_roles', JSON.stringify(roles));
}

function getInvitedUsers() {
  const saved = localStorage.getItem('forgeflow_invited_users');
  return saved ? JSON.parse(saved) : [];
}

function saveInvitedUsers(users) {
  localStorage.setItem('forgeflow_invited_users', JSON.stringify(users));
}

function switchTeamsTab(tabName) {
  document.querySelectorAll('.teams-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.teams-tab[data-tab="${tabName}"]`).classList.add('active');
  document.querySelectorAll('.teams-tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('teamsTab' + tabName.charAt(0).toUpperCase() + tabName.slice(1)).classList.add('active');
}

let editingRoleId = null;

function openCreateRoleModal(roleId = null) {
  console.log('openCreateRoleModal called with roleId:', roleId);
  try {
  editingRoleId = roleId;
  const modal = document.getElementById('roleModal');
  const backdrop = document.getElementById('roleModalBackdrop');
  const title = document.getElementById('roleModalTitle');
  const saveBtn = document.getElementById('saveRoleBtn');
  const tierSelect = document.getElementById('roleTierInput');
  
  if (roleId) {
    const roles = getRoles();
    const role = roles.find(r => r.id === roleId);
    if (role) {
      title.textContent = 'Edit Role';
      saveBtn.textContent = 'Save Changes';
      document.getElementById('roleNameInput').value = role.name;
      tierSelect.value = role.tier || 'team';
      renderModuleSelection(role.modules);
      renderActionPermissions(role.permissions || {});
    }
  } else {
    title.textContent = 'Create New Role';
    saveBtn.textContent = 'Create Role';
    document.getElementById('roleNameInput').value = '';
    tierSelect.value = 'team';
    renderModuleSelection([]);
    renderActionPermissions({});
  }
  
  modal.classList.add('active');
  backdrop.classList.add('active');
  console.log('Modal should be visible now');
  } catch(e) {
    console.error('Error in openCreateRoleModal:', e);
    alert('Error: ' + e.message);
  }
}

function closeRoleModal() {
  const modal = document.getElementById('roleModal');
  const backdrop = document.getElementById('roleModalBackdrop');
  modal.classList.remove('active');
  backdrop.classList.remove('active');
  editingRoleId = null;
}

function renderModuleSelection(selectedModules) {
  const grid = document.getElementById('moduleSelectionGrid');
  if (!grid) return;
  
  grid.innerHTML = availableModules.map(mod => {
    const isSelected = selectedModules.includes(mod.id) || selectedModules.includes('all');
    return `
      <label class="module-checkbox-item ${isSelected ? 'selected' : ''}">
        <input type="checkbox" value="${mod.id}" ${isSelected ? 'checked' : ''} onchange="toggleModuleSelection(this)">
        <span>${mod.name}</span>
      </label>
    `;
  }).join('');
}

function renderActionPermissions(permissions) {
  const grid = document.getElementById('actionPermissionsGrid');
  if (!grid) return;
  
  let html = '';
  
  availableModules.slice(1, 5).forEach(mod => {
    const modPerms = permissions[mod.id] || { view: true, create: false, edit: false, delete: false };
    html += `
      <div class="action-perm-group">
        <h4>${mod.name}</h4>
        <div class="action-checkboxes">
          ${moduleActions.map(action => `
            <label class="action-checkbox-item">
              <input type="checkbox" data-module="${mod.id}" data-action="${action.id}" ${modPerms[action.id] ? 'checked' : ''}>
              <span>${action.name}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  });
  
  grid.innerHTML = html || '<p style="color:var(--gray-400);font-size:13px">Select modules above to configure permissions</p>';
}

function toggleModuleSelection(checkbox) {
  const item = checkbox.closest('.module-checkbox-item');
  if (checkbox.checked) {
    item.classList.add('selected');
  } else {
    item.classList.remove('selected');
  }
}

function saveNewRole() {
  const name = document.getElementById('roleNameInput')?.value.trim();
  const tier = document.getElementById('roleTierInput')?.value || 'team';
  
  if (!name) {
    showToast('Please enter a role name', 'warn');
    return;
  }
  
  const selectedModules = [];
  document.querySelectorAll('#moduleSelectionGrid input[type="checkbox"]:checked').forEach(cb => {
    selectedModules.push(cb.value);
  });
  
  if (selectedModules.length === 0) {
    showToast('Please select at least one module', 'warn');
    return;
  }
  
  const permissions = {};
  document.querySelectorAll('#actionPermissionsGrid input[type="checkbox"]').forEach(cb => {
    const moduleId = cb.dataset.module;
    const action = cb.dataset.action;
    if (!permissions[moduleId]) permissions[moduleId] = { view: true, create: false, edit: false, delete: false };
    permissions[moduleId][action] = cb.checked;
  });
  
  const roles = getRoles();
  
  if (editingRoleId) {
    const role = roles.find(r => r.id === editingRoleId);
    if (role) {
      role.name = name;
      role.tier = tier;
      role.modules = selectedModules;
      role.permissions = permissions;
    }
    showToast('Role updated successfully', 'success');
  } else {
    if (roles.find(r => r.name.toLowerCase() === name.toLowerCase())) {
      showToast('A role with this name already exists', 'warn');
      return;
    }
    
    const newRole = {
      id: 'role_' + Date.now(),
      name: name,
      tier: tier,
      modules: selectedModules,
      permissions: permissions,
      isSystem: false
    };
    roles.push(newRole);
    showToast('Role created successfully', 'success');
  }
  
  saveRoles(roles);
  renderRoles();
  renderTeamMembers();
  closeRoleModal();
}

function renderRoles() {
  const roles = getRoles();
  const rolesList = document.getElementById('rolesList');
  const roleSelect = document.getElementById('inviteRoleInput');
  
  if (rolesList) {
    rolesList.innerHTML = roles.map(role => {
      const userCount = getUserCountForRole(role.id);
      const tierLabel = role.tier === 'superadmin' ? 'Super Admin' : role.tier === 'admin' ? 'Admin' : 'Team Member';
      const modulesDisplay = role.modules.includes('all') 
        ? '<span class="module-tag">All Modules</span>' 
        : role.modules.map(m => {
            const mod = availableModules.find(am => am.id === m);
            return mod ? `<span class="module-tag">${mod.name}</span>` : '';
          }).join('');
      
      return `
        <div class="role-perm-card">
          <div class="role-perm-header">
            <div>
              <div class="role-perm-title">${role.name}</div>
              <span class="role-perm-tier ${role.tier}">${tierLabel}</span>
            </div>
          </div>
          <div class="role-perm-meta">${userCount} member${userCount !== 1 ? 's' : ''}</div>
          <div class="role-perm-modules">${modulesDisplay}</div>
          <div class="role-perm-actions">
            ${!role.isSystem ? `
              <button class="btn-secondary" style="font-size:11px;padding:6px 12px" onclick="editRole('${role.id}')">Edit Role</button>
              <button class="btn-secondary" style="font-size:11px;padding:6px 12px;color:var(--danger)" onclick="deleteRole('${role.id}')">Delete</button>
            ` : '<span style="font-size:11px;color:var(--gray-400)">System role - cannot be modified</span>'}
          </div>
        </div>
      `;
    }).join('');
  }
  
  if (roleSelect) {
    roleSelect.innerHTML = '<option value="">Select a role</option>' + 
      roles.filter(r => !r.isSystem).map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  }
}

function getUserCountForRole(roleId) {
  const users = getInvitedUsers();
  return users.filter(u => u.roleId === roleId).length;
}

function renderTeamMembers() {
  const users = getInvitedUsers();
  const membersList = document.getElementById('teamMembersList');
  
  if (!membersList) return;
  
  if (users.length === 0) {
    membersList.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:40px">No users invited yet. Click "Invite User" to add team members.</td></tr>';
    return;
  }
  
  membersList.innerHTML = users.map(user => `
    <tr>
      <td><strong>${user.name}</strong></td>
      <td>${user.email}</td>
      <td><span class="badge badge-active">${user.roleName}</span></td>
      <td><span class="badge ${user.status === 'Active' ? 'badge-active' : 'badge-pending'}">${user.status}</span></td>
      <td>${user.lastActive || 'Never'}</td>
      <td>
        <button class="btn-secondary" style="font-size:11px;padding:4px 8px" onclick="editUserRole('${user.id}')">Edit Role</button>
        <button class="btn-secondary" style="font-size:11px;padding:4px 8px;color:var(--danger)" onclick="removeUser('${user.id}')">Remove</button>
      </td>
    </tr>
  `).join('');
}

function openInviteUserModal() {
  console.log('openInviteUserModal called');
  try {
  const modal = document.getElementById('inviteModal');
  const backdrop = document.getElementById('inviteModalBackdrop');
  document.getElementById('inviteNameInput').value = '';
  document.getElementById('inviteEmailInput').value = '';
  document.getElementById('inviteRoleInput').value = '';
  modal.classList.add('active');
  backdrop.classList.add('active');
  console.log('Invite modal should be visible now');
  } catch(e) {
    console.error('Error in openInviteUserModal:', e);
    alert('Error: ' + e.message);
  }
}

function closeInviteModal() {
  const modal = document.getElementById('inviteModal');
  const backdrop = document.getElementById('inviteModalBackdrop');
  modal.classList.remove('active');
  backdrop.classList.remove('active');
}

function sendInvite() {
  const name = document.getElementById('inviteNameInput')?.value.trim();
  const email = document.getElementById('inviteEmailInput')?.value.trim();
  const roleId = document.getElementById('inviteRoleInput')?.value;
  
  if (!name) {
    showToast('Please enter a name', 'warn');
    return;
  }
  
  if (!email || !email.includes('@')) {
    showToast('Please enter a valid email address', 'warn');
    return;
  }
  
  if (!roleId) {
    showToast('Please select a role', 'warn');
    return;
  }
  
  const roles = getRoles();
  const role = roles.find(r => r.id === roleId);
  if (!role) {
    showToast('Role not found', 'warn');
    return;
  }
  
  const users = getInvitedUsers();
  if (users.find(u => u.email === email)) {
    showToast('A user with this email already exists', 'warn');
    return;
  }
  
  const newUser = {
    id: 'user_' + Date.now(),
    name: name,
    email: email,
    roleId: roleId,
    roleName: role.name,
    status: 'Pending',
    invitedAt: new Date().toISOString(),
    lastActive: null
  };
  
  users.push(newUser);
  saveInvitedUsers(users);
  
  closeInviteModal();
  renderTeamMembers();
  showToast('Invitation sent successfully!', 'success');
}

function editUserRole(userId) {
  const users = getInvitedUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return;
  
  const roles = getRoles();
  const newRoleId = prompt('Select new role (enter role name):\n\n' + roles.filter(r => !r.isSystem).map(r => r.name).join('\n'));
  if (!newRoleId) return;
  
  const role = roles.find(r => r.name.toLowerCase() === newRoleId.toLowerCase());
  if (!role) {
    showToast('Role not found', 'warn');
    return;
  }
  
  user.roleId = role.id;
  user.roleName = role.name;
  saveInvitedUsers(users);
  renderRoles();
  renderTeamMembers();
  showToast('User role updated', 'success');
}

function removeUser(userId) {
  if (!confirm('Are you sure you want to remove this user?')) return;
  
  const users = getInvitedUsers();
  const userIndex = users.findIndex(u => u.id === userId);
  if (userIndex === -1) return;
  
  users.splice(userIndex, 1);
  saveInvitedUsers(users);
  renderRoles();
  renderTeamMembers();
  showToast('User removed successfully', 'success');
}

function editRole(roleId) {
  openCreateRoleModal(roleId);
}

function deleteRole(roleId) {
  if (!confirm('Are you sure you want to delete this role?')) return;
  
  const users = getInvitedUsers();
  const userCount = users.filter(u => u.roleId === roleId).length;
  
  if (userCount > 0) {
    showToast('Cannot delete role with assigned users. Remove users first.', 'warn');
    return;
  }
  
  const roles = getRoles();
  const roleIndex = roles.findIndex(r => r.id === roleId);
  if (roleIndex === -1) return;
  
  roles.splice(roleIndex, 1);
  saveRoles(roles);
  renderRoles();
  showToast('Role deleted successfully', 'success');
}

function applyUserRolePermissions() {
  const user = getForgeflowUser() || {};
  
  if (checkIsSuperAdmin()) {
    return;
  }
  
  const roles = getRoles();
  const invitedUsers = getInvitedUsers();
  const currentUser = invitedUsers.find(u => u.email === user.email);
  
  if (!currentUser) {
    return;
  }
  
  const currentRole = roles.find(r => r.id === currentUser.roleId);
  
  if (!currentRole || currentRole.modules.includes('all')) {
    return;
  }
  
  const allowedModules = currentRole.modules;
  document.querySelectorAll('.sidebar-nav-item').forEach(item => {
    const onclick = item.getAttribute('onclick') || '';
    const moduleMatch = onclick.match(/showModule\('([^']+)'/);
    const moduleId = moduleMatch ? moduleMatch[1] : null;
    
    if (moduleId && moduleId !== 'settings' && moduleId !== 'teams' && !allowedModules.includes(moduleId)) {
      item.style.display = 'none';
    }
  });
}

function checkIsSuperAdmin() {
  const user = getForgeflowUser() || {};
  const normalizedRole = String(user.role || '').toLowerCase();
  return normalizedRole === 'admin' || normalizedRole === 'superadmin' || normalizedRole === 'owner';
}

function closeUserDropdown() {
  const dropdown = document.querySelector('.user-dropdown');
  if (dropdown) {
    dropdown.style.visibility = '';
    dropdown.style.opacity = '';
  }
}

// ============ FILTER FUNCTIONALITY ============
let filtersInitialized = false;

function initFilters() {
  if (filtersInitialized) return;
  
  document.querySelectorAll('.filter-chip, .filter_chip').forEach(chip => {
    if (chip.dataset.filterBound) return;
    chip.dataset.filterBound = 'true';
    
    chip.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      const container = this.closest('.module-actions') || 
                        this.closest('.table-filters') || 
                        this.closest('.table-card-header');
      if (!container) return;
      
      container.querySelectorAll('.filter-chip, .filter_chip').forEach(c => {
        if (c !== this) c.classList.remove('active');
      });
      this.classList.add('active');
      
      const filterValue = this.textContent.trim();
      const moduleView = this.closest('.module-view');
      if (!moduleView) return;
      
      const tables = moduleView.querySelectorAll('table tbody');
      let totalVisible = 0;
      
      tables.forEach(tbody => {
        const rows = tbody.querySelectorAll('tr');
        let visibleCount = 0;
        
        rows.forEach(row => {
          let matches = false;
          const status = row.getAttribute('data-status');
          const rowText = row.textContent.toLowerCase();
          const filterLower = filterValue.toLowerCase();
          const statusLower = status ? status.toLowerCase() : '';
          
          if (filterValue === 'All' || filterValue === 'All Orders' || filterValue === 'All Requests' || 
              filterValue === 'All BOMs' || filterValue === 'All Staff' || filterValue === 'All Suppliers' || 
              filterValue === 'All Warehouses' || filterValue === 'All Items' || filterValue === 'All Operations' ||
              filterValue === 'All Requests' || filterValue === 'All Staff') {
            matches = true;
          } else if (filterLower === 'pending' && (statusLower.includes('pending') || statusLower === 'quote')) {
            matches = true;
          } else if (filterLower === 'approved' && (statusLower === 'approved' || statusLower === 'active')) {
            matches = true;
          } else if (filterLower === 'active' && statusLower === 'active') {
            matches = true;
          } else if (filterLower === 'in production' && statusLower === 'in production') {
            matches = true;
          } else if (filterLower === 'in progress' && statusLower === 'in progress') {
            matches = true;
          } else if (filterLower === 'paused' && statusLower === 'paused') {
            matches = true;
          } else if (filterLower === 'wh-a' && rowText.includes('wh-a')) {
            matches = true;
          } else if (filterLower === 'wh-b' && rowText.includes('wh-b')) {
            matches = true;
          } else if (filterLower === 'draft' && statusLower === 'draft') {
            matches = true;
          } else if (filterLower === 'scheduled' && statusLower === 'scheduled') {
            matches = true;
          } else if (filterLower === 'inactive' && statusLower === 'inactive') {
            matches = true;
          } else if (filterLower === 'on leave' && statusLower === 'on leave') {
            matches = true;
          } else if (filterLower === 'received' && statusLower === 'received') {
            matches = true;
          } else if (filterLower === 'shipped' && statusLower === 'shipped') {
            matches = true;
          } else if (filterLower === 'delivered' && statusLower === 'delivered') {
            matches = true;
          } else if (filterLower === 'completed' && statusLower === 'completed') {
            matches = true;
          } else if (filterLower === 'resolved' && statusLower === 'resolved') {
            matches = true;
          } else if (filterLower === 'packed' && statusLower === 'packed') {
            matches = true;
          } else if (filterLower === 'ready' && (statusLower === 'ready' || statusLower === 'ready to ship')) {
            matches = true;
          } else if (filterLower === 'ready to ship' && (statusLower === 'ready' || statusLower === 'ready to ship')) {
            matches = true;
          } else if (filterLower === 'raw materials' && rowText.includes('raw material')) {
            matches = true;
          } else if (filterLower === 'finished goods' && rowText.includes('finished good')) {
            matches = true;
          } else if (!status && !rowText.includes(filterLower)) {
            matches = true;
          } else if (status && statusLower === filterLower) {
            matches = true;
          } else if (rowText.includes(filterLower)) {
            matches = true;
          }
          
          row.style.display = matches ? '' : 'none';
          if (matches) visibleCount++;
        });
        
        totalVisible += visibleCount;
        
        let noResultsMsg = tbody.parentElement.querySelector('.no-results-message');
        if (visibleCount === 0 && rows.length > 0) {
          if (!noResultsMsg) {
            noResultsMsg = document.createElement('div');
            noResultsMsg.className = 'no-results-message';
            noResultsMsg.style.cssText = 'text-align:center;padding:40px;color:var(--gray-400);font-size:14px;';
            noResultsMsg.innerHTML = 'No entries found matching your filter.';
            tbody.parentElement.insertBefore(noResultsMsg, tbody.nextSibling);
          }
          noResultsMsg.style.display = '';
        } else if (noResultsMsg) {
          noResultsMsg.style.display = 'none';
        }
      });
      
      console.log('Filter applied:', filterValue, '- Visible rows:', totalVisible);
    });
  });
  
  filtersInitialized = true;
}

// ============ CHARTS ============
let chartsInited = false;
let lineChart = null;
let pieChart = null;
let chartResizeListenerBound = false;

function ensureChartCanvasWrapper(canvas) {
  if (!canvas) return null;
  if (canvas.parentElement?.classList.contains('chart-canvas-wrap')) {
    return canvas.parentElement;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'chart-canvas-wrap';
  canvas.parentNode.insertBefore(wrapper, canvas);
  wrapper.appendChild(canvas);
  return wrapper;
}

function bindChartResizeListener() {
  if (chartResizeListenerBound) return;
  window.addEventListener('resize', () => {
    lineChart?.resize();
    pieChart?.resize();
  });
  chartResizeListenerBound = true;
}

function initCharts() {
  if (chartsInited) {
    lineChart?.resize();
    pieChart?.resize();
    return;
  }
  
  const lCtx = document.getElementById('dashLineChart');
  const pCtx = document.getElementById('dashPieChart');
  
  if (!lCtx || !pCtx) {
    setTimeout(initCharts, 100);
    return;
  }

  const lineWrap = ensureChartCanvasWrapper(lCtx);
  const pieWrap = ensureChartCanvasWrapper(pCtx);
  [lineWrap, pieWrap].forEach(wrapper => {
    if (!wrapper) return;
    wrapper.style.height = '220px';
    wrapper.style.minHeight = '220px';
    wrapper.style.width = '100%';
    wrapper.style.position = 'relative';
  });

  lCtx.removeAttribute('height');
  pCtx.removeAttribute('height');
  
  try {
    if (lineChart) {
      lineChart.destroy();
      lineChart = null;
    }
    if (pieChart) {
      pieChart.destroy();
      pieChart = null;
    }
    
    const lCtx2d = lCtx.getContext('2d');
    const pCtx2d = pCtx.getContext('2d');
    lCtx2d.clearRect(0, 0, lCtx.width, lCtx.height);
    pCtx2d.clearRect(0, 0, pCtx.width, pCtx.height);
    
    lineChart = new Chart(lCtx, {
      type: 'line',
      data: {
        labels: ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'],
        datasets: [
          {
            label: 'Sales ($k)',
            data: [42, 48, 51, 58, 63, 55, 69, 72, 78, 75, 82, 84],
            borderColor: '#F97316',
            backgroundColor: 'rgba(249,115,22,0.06)',
            tension: 0.4,
            fill: true,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: '#F97316',
          },
          {
            label: 'Production (units)',
            data: [180, 210, 195, 240, 260, 228, 290, 310, 330, 305, 350, 360],
            borderColor: '#0EA5A4',
            backgroundColor: 'rgba(14,165,164,0.04)',
            tension: 0.4,
            fill: true,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: '#0EA5A4',
            yAxisID: 'y2',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 120,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#64748B', font: { family: 'Figtree', size: 12 }, boxWidth: 14 } }
        },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#94A3B8', font: { family: 'Figtree', size: 11 } } },
          y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#94A3B8', font: { family: 'Figtree', size: 11 } } },
          y2: { position: 'right', grid: { display: false }, ticks: { color: '#00C896', font: { family: 'Figtree', size: 11 } } },
        }
      }
    });

    pieChart = new Chart(pCtx, {
      type: 'doughnut',
      data: {
        labels: ['In Production', 'Completed', 'Pending', 'Shipped', 'Delivered'],
        datasets: [{
          data: [35, 22, 18, 12, 13],
          backgroundColor: ['#F97316', '#0EA5A4', '#F59E0B', '#22D3EE', '#14B8A6'],
          borderColor: '#F9FAFB',
          borderWidth: 2,
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 120,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#64748B', font: { family: 'Figtree', size: 11 }, padding: 10, boxWidth: 12 }
          }
        }
      }
    });
    
    bindChartResizeListener();
    chartsInited = true;
    console.log('Charts initialized successfully');
  } catch (e) {
    console.error('Error initializing charts:', e);
  }
}

function updateCharts() {
  if (lineChart) lineChart.update();
  if (pieChart) pieChart.update();
}

// ============ EXPOSE FUNCTIONS TO GLOBAL SCOPE ============
window.showModule = showModule;
window.doLogout = doLogout;
window.updateStatus = updateStatus;
window.openPane = openPane;
window.closePane = closePane;
window.openHelpPage = openHelpPage;
window.toggleNotifications = toggleNotifications;
window.markAllRead = markAllRead;
window.openSettingsSubscription = openSettingsSubscription;
window.switchSettingsTab = switchSettingsTab;
window.clearDemoData = clearDemoData;
window.saveSettings = saveSettings;
window.closeUserDropdown = closeUserDropdown;
window.triggerMRP = triggerMRP;
window.confirmSalesOrder = confirmSalesOrder;
window.saveRecord = saveRecord;
window.viewRecord = viewRecord;
window.editRecord = editRecord;
window.exportCurrentModule = exportCurrentModule;
window.exportAllData = exportAllData;
window.importData = importData;
window.selectTheme = selectTheme;
window.selectColor = selectColor;
window.applyAccentColor = applyAccentColor;
window.applyTheme = applyTheme;
window.applyCurrentAppearanceSettings = applyCurrentAppearanceSettings;
window.confirmClearData = confirmClearData;
window.confirmDeleteAccount = confirmDeleteAccount;
window.updatePassword = updatePassword;
window.regenerateApiKey = regenerateApiKey;
window.upgradePlan = upgradePlan;
window.addPaymentMethod = addPaymentMethod;
window.toggleApiKey = toggleApiKey;
window.copyApiKey = copyApiKey;
window.openCreateRoleModal = openCreateRoleModal;
window.closeRoleModal = closeRoleModal;
window.editRole = editRole;
window.saveNewRole = saveNewRole;
window.openInviteUserModal = openInviteUserModal;
window.closeInviteModal = closeInviteModal;
window.sendInvite = sendInvite;
window.editUserRole = editUserRole;
window.removeUser = removeUser;
window.deleteRole = deleteRole;
window.addMfgMaterialRow = addMfgMaterialRow;
window.addMfgStageRow = addMfgStageRow;
window.addBomMaterialRow = addBomMaterialRow;
window.removeRow = removeRow;
window.renderRoles = renderRoles;
window.renderTeamMembers = renderTeamMembers;
window.applyUserRolePermissions = applyUserRolePermissions;
window.connectIntegration = connectIntegration;
window.configureIntegration = configureIntegration;
window.closeIntegrationModal = closeIntegrationModal;
window.switchTeamsTab = switchTeamsTab;
window.uploadCompanyLogo = uploadCompanyLogo;
window.removeCompanyLogo = removeCompanyLogo;
window.revokeSession = revokeSession;
window.openAddCardModal = openAddCardModal;
window.closeAddCardModal = closeAddCardModal;
window.removePaymentMethod = removePaymentMethod;
window.handleAddCard = handleAddCard;
window.formatCardNumber = formatCardNumber;
window.formatCardExpiry = formatCardExpiry;
window.toggleNotifications = toggleNotifications;
window.markAllRead = markAllRead;
window.openHelpPage = openHelpPage;
window.clearDemoData = clearDemoData;
window.switchTeamsTab = switchTeamsTab;
window.closeUserDropdown = closeUserDropdown;
window.openPane = openPane;
window.closePane = closePane;
window.updateStatus = updateStatus;
window.triggerMRP = triggerMRP;
window.confirmSalesOrder = confirmSalesOrder;
window.exportAllData = exportAllData;
window.exportCurrentModule = exportCurrentModule;
window.switchSettingsTab = switchSettingsTab;
window.doLogout = doLogout;
window.connectIntegration = connectIntegration;
window.configureIntegration = configureIntegration;
window.closeIntegrationModal = closeIntegrationModal;
window.saveRecord = saveRecord;
window.importData = importData;

// ============ INIT ============
let appInitializationComplete = false;
let storageSyncListenerBound = false;

function bindStorageSyncListener() {
  if (storageSyncListenerBound) return;
  window.addEventListener('storage', function(e) {
    if (e.key !== 'forgeflow_user') return;
    const newUser = JSON.parse(e.newValue || 'null');
    if (!newUser) return;
    applyUser(newUser);
    initPlanAccessControl();
  });
  storageSyncListenerBound = true;
}

async function initializeApplication() {
  if (appInitializationComplete) return;

  try {
    await updateUserUI();
    await hydrateModuleRecords();

    initTrialCountdown();
    initPlanAccessControl();
    initSubscription();
    checkAndProcessRenewal();
    loadAppearanceSettings();
    await loadAllSettings();
    loadNotificationSettings();
    renderRoles();
    renderTeamMembers();
    applyUserRolePermissions();

    initFilters();
    initCharts();
    initTableWrappers();
    initNotifications();
    bindRecordActionButtons();
    bindStorageSyncListener();

    setTimeout(() => {
      initFilters();
      lineChart?.resize();
      pieChart?.resize();
    }, 300);

    appInitializationComplete = true;
    console.log('App initialized successfully');
  } catch (e) {
    console.error('Error initializing app:', e);
    showToast('Failed to initialize app. Please refresh.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void initializeApplication();
});

function initTableWrappers() {
  document.querySelectorAll('.table-card').forEach(card => {
    const table = card.querySelector('table.data-table');
    if (table && !card.querySelector('.table-wrapper')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'table-wrapper';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  });
}

console.log('App.js fully loaded - end of file reached');

