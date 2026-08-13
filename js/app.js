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
  const planLabel = existingUser.planLabel || 'FREE TRIAL';
  const planName = existingUser.planName || 'Free Trial';

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

  // Team member login: keep the invited member's identity instead of the
  // admin session profile so role permissions apply to the right person.
  applyTeamIdentity(normalizedUser);

  setForgeflowUser(normalizedUser);
  applyUser(normalizedUser);
}

function applyTeamIdentity(normalizedUser) {
  if (localStorage.getItem('forgeflow_team_login') !== 'true') return;
  const identity = JSON.parse(localStorage.getItem('forgeflow_team_identity') || 'null');
  const invitedUsers = JSON.parse(localStorage.getItem('forgeflow_invited_users') || '[]');
  const stillMember = identity && invitedUsers.some(u => u.email && u.email.toLowerCase() === identity.email.toLowerCase());
  if (!stillMember) {
    localStorage.removeItem('forgeflow_team_login');
    localStorage.removeItem('forgeflow_team_identity');
    return;
  }
  if (!identity.email) return;
  const memberName = identity.name || identity.email.split('@')[0];
  normalizedUser.email = identity.email;
  normalizedUser.firstName = identity.firstName || memberName;
  normalizedUser.lastName = identity.lastName || '';
  normalizedUser.first_name = normalizedUser.firstName;
  normalizedUser.last_name = normalizedUser.lastName;
  normalizedUser.fullName = memberName;
  normalizedUser.initials = identity.initials || memberName.slice(0, 2).toUpperCase();
  normalizedUser.role = identity.role || 'team';
}

// ============ AUTH STATE LISTENER ============
let isSigningOut = false;

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' && !isSigningOut) {
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
  const logo = document.querySelector('.ff-logo--sidebar');
  if (logo) {
    logo.src = theme === 'light'
      ? new URL('../assets/forge_flow_logo-removebg-preview.png', import.meta.url).href
      : new URL('../assets/forge flow white logo wirh icon.png', import.meta.url).href;
  }
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
    initTableSearch();
    initTableWrappers();
  }, 50);

  closeMobileMenu();
}

// ============ MOBILE MENU (SIDEBAR DRAWER) ============
function isMobileViewport() {
  return window.innerWidth <= 1024;
}

function openMobileMenu() {
  if (!isMobileViewport()) return;
  const appLayout = document.querySelector('.app-layout');
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const toggle = document.getElementById('mobileMenuToggle');
  if (appLayout) appLayout.classList.add('mobile-menu-open');
  if (sidebar) sidebar.classList.add('open');
  if (backdrop) backdrop.classList.add('open');
  if (toggle) toggle.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
  const appLayout = document.querySelector('.app-layout');
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const toggle = document.getElementById('mobileMenuToggle');
  if (appLayout) appLayout.classList.remove('mobile-menu-open');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

function toggleMobileMenu() {
  const appLayout = document.querySelector('.app-layout');
  const isOpen = appLayout ? appLayout.classList.contains('mobile-menu-open') : false;
  if (isOpen) {
    closeMobileMenu();
  } else {
    openMobileMenu();
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const appLayout = document.querySelector('.app-layout');
    if (appLayout && appLayout.classList.contains('mobile-menu-open')) closeMobileMenu();
  }
});

window.addEventListener('resize', () => {
  if (!isMobileViewport()) closeMobileMenu();
});

window.toggleMobileMenu = toggleMobileMenu;
window.openMobileMenu = openMobileMenu;
window.closeMobileMenu = closeMobileMenu;

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

async function syncNotificationToServer(notif) {
  const companyId = await ensureCompanyContext();
  if (!companyId || !supabase) return;
  try {
    await supabase.from('notifications').upsert({
      id: notif.id,
      company_id: companyId,
      type: notif.type,
      title: notif.title,
      description: notif.description,
      icon_type: notif.iconType || 'system',
      module_id: notif.moduleId || null,
      read: notif.read || false,
      created_at: notif.timestamp
    }, { onConflict: 'id' });
  } catch (e) {
    console.warn('Notification sync failed:', e);
  }
}

async function syncNotificationRead(id) {
  const companyId = await ensureCompanyContext();
  if (!companyId || !supabase) return;
  try {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .eq('company_id', companyId);
  } catch (e) {
    console.warn('Notification read sync failed:', e);
  }
}

async function syncAllNotificationsRead() {
  const companyId = await ensureCompanyContext();
  if (!companyId || !supabase) return;
  try {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('company_id', companyId)
      .eq('read', false);
  } catch (e) {
    console.warn('Notification read-all sync failed:', e);
  }
}

async function clearNotificationsFromServer() {
  const companyId = await ensureCompanyContext();
  if (!companyId || !supabase) return;
  try {
    await supabase.from('notifications').delete().eq('company_id', companyId);
  } catch (e) {
    console.warn('Notification clear sync failed:', e);
  }
}

async function hydrateNotificationsFromServer() {
  const companyId = await ensureCompanyContext();
  if (!companyId || !supabase) return;
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const serverList = (data || []).map(row => ({
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      iconType: row.icon_type || 'system',
      moduleId: row.module_id || null,
      read: !!row.read,
      timestamp: row.created_at
    }));

    const byId = new Map();
    getNotifications().forEach(n => byId.set(n.id, n));
    serverList.forEach(n => {
      if (byId.has(n.id)) {
        const existing = byId.get(n.id);
        byId.set(n.id, { ...existing, ...n, read: n.read || existing.read });
      } else {
        byId.set(n.id, n);
      }
    });

    const merged = Array.from(byId.values())
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 50);
    saveNotifications(merged);
  } catch (e) {
    console.warn('Failed to hydrate notifications from backend:', e);
  }
}

function updateNotificationBadge() {
  const dot = document.getElementById('notifDot');
  if (dot) {
    dot.style.display = notificationCount > 0 ? 'block' : 'none';
    dot.textContent = notificationCount > 9 ? '9+' : notificationCount;
  }
}

function addNotification(type, title, description, iconType = 'system', moduleId = null) {
  const notifications = getNotifications();
  const newNotif = {
    id: 'notif_' + Date.now(),
    type: type,
    title: title,
    description: description,
    iconType: iconType,
    moduleId: moduleId,
    read: false,
    timestamp: new Date().toISOString()
  };
  notifications.unshift(newNotif);
  if (notifications.length > 50) notifications.pop();
  saveNotifications(notifications);
  renderNotifications();
  void syncNotificationToServer(newNotif);
  return newNotif;
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
      <div class="notification-item ${notif.read ? '' : 'unread'}" data-id="${notif.id}" data-type="${notif.type}" data-module="${notif.moduleId || ''}">
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
      const moduleId = this.dataset.module;
      markAsRead(notifId);
      if (moduleId && typeof showModule === 'function') {
        const dropdown = document.querySelector('.notification-dropdown');
        if (dropdown) dropdown.classList.remove('open');
        showModule(moduleId);
      }
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
    inventory: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    draft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    import: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    export: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    role: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    webhook: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/><path d="M6 17V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h3a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h1"/><path d="M18 17a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/></svg>',
    integration: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };
  return icons[type] || icons.system;
}

// Maps a module data key to its sidebar module id so a notification can jump
// straight to the affected module when clicked.
function getModuleIdForDataKey(dataKey) {
  const map = {
    mfg: 'manufacturing',
    inventory: 'inventory',
    sales: 'sales',
    pr: 'purchase',
    bom: 'bom',
    suppliers: 'suppliers',
    staff: 'staff',
    maintenance: 'maintenance',
    operations: 'workops',
    uom: 'uom'
  };
  return map[dataKey] || null;
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
    void syncNotificationRead(notifId);
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
  void syncAllNotificationsRead();
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

async function initNotifications() {
  await hydrateNotificationsFromServer();
  const list = getNotifications();
  notificationCount = list.filter(n => !n.read).length;
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

  loadIntegrationSettings();
}

function getIntegrationSettings() {
  try {
    const saved = localStorage.getItem('forgeflow_integrations_settings');
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function loadIntegrationSettings() {
  const settings = getIntegrationSettings();

  const autoSync = document.getElementById('integrationsAutoSync');
  if (autoSync) autoSync.classList.toggle('active', settings.autoSync === true);

  const syncInterval = document.getElementById('integrationsSyncInterval');
  if (syncInterval) syncInterval.value = settings.syncInterval || 'manual';

  const notify = document.getElementById('integrationsNotifyOnFailure');
  if (notify) notify.classList.toggle('active', settings.notifyOnFailure !== false);
}

function getTrialEndDate() {
  const subscription = getSubscription();
  const start = subscription?.startDate ? new Date(subscription.startDate) : new Date();
  return addDays(start, TRIAL_DURATION_DAYS);
}

let trialCountdownTimer = null;

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
  
  // Trial runs 7 days from the persistent subscription start so the countdown
  // is identical on every device instead of resetting each browser session.
  const endDate = getTrialEndDate();
  
  countdownEl.style.display = 'inline';
  
  if (trialCountdownTimer) {
    clearInterval(trialCountdownTimer);
  }
  
  const pad = n => String(n).padStart(2, '0');
  
  function formatCountdown(diff) {
    const totalSeconds = Math.max(0, Math.floor(diff / 1000));
    const day = Math.max(1, Math.min(Math.ceil(totalSeconds / 86400), TRIAL_DURATION_DAYS));
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `Day ${day} · ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  
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
      countdownEl.title = 'Your free trial has expired';
      const trialDaysLeft = document.getElementById('trialDaysLeft');
      if (trialDaysLeft) trialDaysLeft.textContent = 'Expired';
      evaluateTrialStatus();
      return;
    }
    
    const text = `${formatCountdown(diff)} left`;
    countdownEl.textContent = text;
    countdownEl.title = `Trial ends ${endDate.toLocaleString()} — upgrade to keep Pro features`;
    
    // Keep the billing card countdown live too (Day 7 → Day 1)
    const trialDaysLeft = document.getElementById('trialDaysLeft');
    if (trialDaysLeft) {
      const totalSeconds = Math.floor(diff / 1000);
      const day = Math.max(1, Math.min(Math.ceil(totalSeconds / 86400), TRIAL_DURATION_DAYS));
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      trialDaysLeft.textContent = `Day ${day} left · ${pad(hours)}:${pad(minutes)}:${pad(totalSeconds % 60)}`;
    }
  }
  
  // Run immediately and then tick every second so the countdown is live
  updateCountdown();
  trialCountdownTimer = setInterval(updateCountdown, 1000);
}

// ============ LIVE CLOCK (24-hour time system) ============
function getUserTimezone() {
  try {
    const general = JSON.parse(localStorage.getItem('forgeflow_general') || 'null');
    if (general?.timezone) return general.timezone;
  } catch (e) { /* ignore */ }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch (e) {
    return 'America/New_York';
  }
}

let liveClockTimer = null;

function initLiveClock() {
  const timeEl = document.getElementById('topbarClockTime');
  const dateEl = document.getElementById('topbarClockDate');
  const periodEl = document.getElementById('topbarClockPeriod');
  if (!timeEl || !dateEl) return;
  
  if (liveClockTimer) {
    clearInterval(liveClockTimer);
    liveClockTimer = null;
  }
  
  const timeZone = getUserTimezone();
  
  // 12-hour clock (AM/PM) regardless of locale defaults
  const timeFmt = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', second: '2-digit',
    hour12: true, timeZone
  });
  const dateFmt = new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone
  });
  
  function tick() {
    const now = new Date();
    const t = timeFmt.formatToParts(now);
    const hour = t.find(p => p.type === 'hour')?.value || '12';
    const minute = t.find(p => p.type === 'minute')?.value || '00';
    const second = t.find(p => p.type === 'second')?.value || '00';
    const period = t.find(p => p.type === 'dayPeriod')?.value?.toUpperCase() || '';
    timeEl.textContent = `${hour}:${minute}:${second}`;
    if (periodEl) periodEl.textContent = period;
    
    const d = dateFmt.formatToParts(now);
    const weekday = d.find(p => p.type === 'weekday')?.value || '';
    const month = d.find(p => p.type === 'month')?.value || '';
    const day = d.find(p => p.type === 'day')?.value || '';
    dateEl.textContent = `${weekday}, ${month} ${day}`;
  }
  
  tick();
  liveClockTimer = setInterval(tick, 1000);
  console.log('Live clock initialized (12-hour):', timeZone);
}

// ============ DASHBOARD RANGE SELECT ============
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function shiftMonths(d, n) {
  const c = new Date(d);
  c.setMonth(c.getMonth() + n);
  return c;
}

function monthsBetween(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function dashboardMonthLabel(d) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function dashboardShortMonthLabel(d) {
  return d.toLocaleDateString('en-US', { month: 'short' });
}

async function getAccountCreatedAt() {
  const companyId = await ensureCompanyContext();
  if (companyId) {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('created_at')
        .eq('id', companyId)
        .maybeSingle();
      if (!error && data?.created_at) return new Date(data.created_at);
    } catch (e) {
      console.warn('Failed to load account creation date:', e);
    }
  }
  const subscription = getSubscription();
  if (subscription?.startDate) return new Date(subscription.startDate);
  return null;
}

function updateDashboardSubtitle(subtitle, value, now, startMonth) {
  if (!subtitle) return;
  let rangeText = 'This Month';
  if (value === 'last-month') {
    rangeText = 'Last Month';
  } else if (value.startsWith('last-')) {
    rangeText = `Last ${value.replace('last-', '')} Months`;
  } else if (value === 'all') {
    rangeText = startMonth ? `All Months (since ${dashboardMonthLabel(startMonth)})` : 'All Months';
  }
  subtitle.textContent = `Your manufacturing operations at a glance — ${rangeText}`;
}

async function initDashboardRange() {
  const select = document.getElementById('dashboardRangeSelect');
  const subtitle = document.getElementById('dashboardSubtitle');
  if (!select) return;

  const now = startOfMonth(new Date());
  const created = await getAccountCreatedAt();
  const startMonth = created ? startOfMonth(created) : null;

  const options = [];
  const add = (value, label) => options.push({ value, label });

  add('this-month', `This Month (${dashboardMonthLabel(now)})`);
  add('last-month', `Last Month (${dashboardMonthLabel(shiftMonths(now, -1))})`);

  [2, 3, 6, 12].forEach(n => {
    const start = startMonth && monthsBetween(startMonth, now) < n
      ? startMonth
      : shiftMonths(now, -(n - 1));
    add(`last-${n}`, `Last ${n} Months (${dashboardShortMonthLabel(start)} – ${dashboardShortMonthLabel(now)})`);
  });

  if (startMonth) {
    add('all', `All Months (${dashboardShortMonthLabel(startMonth)} ${startMonth.getFullYear()} – Present)`);
  } else {
    add('all', 'All Months');
  }

  select.innerHTML = '';
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    select.appendChild(option);
  });
  select.value = 'this-month';
  updateDashboardSubtitle(subtitle, 'this-month', now, startMonth);
}

async function onDashboardRangeChange(select) {
  const value = select?.value || 'this-month';
  await renderDashboard(value);
}

// ============ DATA-DRIVEN DASHBOARD (real-time month ranges) ============
function getMergedModuleData(dataKey) {
  return {
    ...(mockData[dataKey] || {}),
    ...(getRecordOverrides()[dataKey] || {})
  };
}

function toDateValue(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function getDashboardRangeBounds(value) {
  const now = new Date();
  const startOfCurrent = startOfMonth(now);
  const endOfMonth = (month) => new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);

  if (value === 'last-month') {
    const start = startOfMonth(shiftMonths(now, -1));
    return { start, end: endOfMonth(start) };
  }
  if (typeof value === 'string' && value.startsWith('last-')) {
    const n = Math.max(1, parseInt(value.replace('last-', ''), 10) || 1);
    const start = startOfMonth(shiftMonths(now, -(n - 1)));
    return { start, end: endOfMonth(startOfCurrent) };
  }
  if (value === 'all') {
    return { start: new Date(0), end: new Date(8640000000000000) };
  }
  return { start: startOfCurrent, end: endOfMonth(startOfCurrent) };
}

function recordInRange(record, bounds, dateField) {
  const d = toDateValue(record?.[dateField]);
  if (!d) return false;
  return d >= bounds.start && d <= bounds.end;
}

function computeDashboardMetrics(rangeValue) {
  const bounds = getDashboardRangeBounds(rangeValue);
  const sales = Object.values(getMergedModuleData('sales'));
  const mfg = Object.values(getMergedModuleData('mfg'));
  const pr = Object.values(getMergedModuleData('pr'));
  const inventory = Object.values(getMergedModuleData('inventory'));
  const staff = Object.values(getMergedModuleData('staff'));
  const suppliers = Object.values(getMergedModuleData('suppliers'));

  let salesRevenue = 0;
  const activeCustomers = new Set();
  sales.forEach(o => {
    if (!recordInRange(o, bounds, 'deliveryDate') && !recordInRange(o, bounds, 'orderDate')) return;
    salesRevenue += (parseFloat(o.qty) || 0) * (parseFloat(o.price) || 0);
    if (o.customer) activeCustomers.add(String(o.customer).toLowerCase());
  });

  const closedStatuses = ['Delivered', 'Cancelled', 'Rejected'];
  let activeMfg = 0;
  mfg.forEach(o => {
    if (!recordInRange(o, bounds, 'targetDate')) return;
    if (!closedStatuses.includes((o.status || '').trim())) activeMfg++;
  });

  let purchaseCost = 0;
  pr.forEach(o => {
    if (!recordInRange(o, bounds, 'reqDate') && !recordInRange(o, bounds, 'orderDate')) return;
    purchaseCost += (parseFloat(o.qty) || 0) * (parseFloat(o.cost) || 0);
  });

  let inventoryValue = 0;
  let lowStock = 0;
  inventory.forEach(o => {
    inventoryValue += (parseFloat(o.stock) || 0) * (parseFloat(o.cost) || 0);
    if ((parseFloat(o.stock) || 0) < (parseFloat(o.minStock) || 0)) lowStock++;
  });

  return {
    salesRevenue,
    inventoryValue,
    activeMfg,
    lowStock,
    purchaseCost,
    staffCount: staff.length,
    supplierCount: suppliers.length,
    customerCount: activeCustomers.size
  };
}

function getMonthlyBuckets(rangeValue) {
  const bounds = getDashboardRangeBounds(rangeValue);
  const buckets = [];
  const cursor = new Date(bounds.start.getFullYear(), bounds.start.getMonth(), 1);
  const end = new Date(bounds.end.getFullYear(), bounds.end.getMonth(), 1);
  while (cursor <= end) {
    buckets.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return buckets;
}

function computeChartSeries(rangeValue) {
  const bounds = getDashboardRangeBounds(rangeValue);
  const buckets = getMonthlyBuckets(rangeValue);
  const sales = Object.values(getMergedModuleData('sales'));
  const mfg = Object.values(getMergedModuleData('mfg'));

  const labels = buckets.map(b => b.toLocaleDateString('en-US', { month: 'short' }));
  const salesData = buckets.map(() => 0);
  const prodData = buckets.map(() => 0);

  const bucketIndex = (d) => buckets.findIndex(b => b.getMonth() === d.getMonth() && b.getFullYear() === d.getFullYear());

  sales.forEach(o => {
    const d = toDateValue(o.deliveryDate || o.orderDate);
    if (!d || d < bounds.start || d > bounds.end) return;
    const idx = bucketIndex(d);
    if (idx >= 0) salesData[idx] += (parseFloat(o.qty) || 0) * (parseFloat(o.price) || 0);
  });
  mfg.forEach(o => {
    const d = toDateValue(o.targetDate);
    if (!d || d < bounds.start || d > bounds.end) return;
    const idx = bucketIndex(d);
    if (idx >= 0) prodData[idx] += parseFloat(o.qty) || 0;
  });

  return { labels, salesData: salesData.map(v => +(v / 1000).toFixed(1)), prodData };
}

function computeStatusDistribution(rangeValue) {
  const bounds = getDashboardRangeBounds(rangeValue);
  const mfg = Object.values(getMergedModuleData('mfg'));
  const counts = { 'In Production': 0, 'Completed': 0, 'Pending': 0, 'Shipped': 0, 'Delivered': 0 };
  mfg.forEach(o => {
    if (!recordInRange(o, bounds, 'targetDate')) return;
    const s = (o.status || '').trim();
    let bucket = 'Pending';
    if (['Delivered', 'Received'].includes(s)) bucket = 'Delivered';
    else if (['Shipped'].includes(s)) bucket = 'Shipped';
    else if (['Completed', 'Closed'].includes(s)) bucket = 'Completed';
    else if (['In Production', 'Approved', 'Packed', 'Ready', 'Pending MFG', 'On Hold'].includes(s)) bucket = 'In Production';
    counts[bucket]++;
  });
  return counts;
}

function renderDashboardCharts(rangeValue) {
  const lCtx = document.getElementById('dashLineChart');
  const pCtx = document.getElementById('dashPieChart');
  if (!lCtx || !pCtx) return;

  const dataCleared = localStorage.getItem('forgeflow_data_cleared') === 'true';

  let labels = [], salesData = [], prodData = [];
  let status = { 'In Production': 0, 'Completed': 0, 'Pending': 0, 'Shipped': 0, 'Delivered': 0 };
  if (!dataCleared) {
    const series = computeChartSeries(rangeValue);
    labels = series.labels; salesData = series.salesData; prodData = series.prodData;
    status = computeStatusDistribution(rangeValue);
  }

  if (lineChart) {
    lineChart.data.labels = labels;
    lineChart.data.datasets[0].data = salesData;
    lineChart.data.datasets[1].data = prodData;
    lineChart.update();
  }
  if (pieChart) {
    pieChart.data.labels = Object.keys(status);
    pieChart.data.datasets[0].data = Object.values(status);
    pieChart.update();
  }
}

async function renderDashboard(rangeValue) {
  const select = document.getElementById('dashboardRangeSelect');
  const value = rangeValue || select?.value || 'this-month';
  const metrics = computeDashboardMetrics(value);

  const fmt = n => n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : String(Math.round(n));
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  setText('kpiSalesRevenue', '$' + fmt(metrics.salesRevenue));
  setText('kpiInventoryValue', fmt(metrics.inventoryValue));
  setText('kpiActiveMfg', fmt(metrics.activeMfg));
  setText('kpiLowStock', fmt(metrics.lowStock));
  setText('kpiPurchaseCost', fmt(metrics.purchaseCost));
  setText('kpiStaff', fmt(metrics.staffCount));
  setText('kpiSuppliers', fmt(metrics.supplierCount));
  setText('kpiCustomers', fmt(metrics.customerCount));

  renderDashboardCharts(value);

  const subtitle = document.getElementById('dashboardSubtitle');
  const created = await getAccountCreatedAt();
  const startMonth = created ? startOfMonth(created) : null;
  updateDashboardSubtitle(subtitle, value, startOfMonth(new Date()), startMonth);
}

let dashboardMonthTimer = null;

function initDashboardAutoRefresh() {
  if (dashboardMonthTimer) return;
  let lastMonth = startOfMonth(new Date()).getTime();
  dashboardMonthTimer = setInterval(() => {
    const now = startOfMonth(new Date()).getTime();
    if (now !== lastMonth) {
      lastMonth = now;
      const select = document.getElementById('dashboardRangeSelect');
      if (select) {
        const prev = select.value;
        void initDashboardRange().then(() => renderDashboard(select.value || prev));
      }
    }
  }, 30000);
}

async function clearDemoData() {
  if (!confirm('Are you sure you want to clear ALL data? This will remove every record across all modules (manufacturing, inventory, sales, purchase, BOM, suppliers, staff, maintenance, operations, UOM) and reset the dashboard. Your account, plan and settings will be kept.')) {
    return;
  }

  showToast('Clearing all data...', 'warn');

  // 1. Wipe in-memory module stores so search/pane data is gone immediately
  Object.keys(mockData).forEach(key => { mockData[key] = {}; });
  Object.keys(serverRecordCache).forEach(key => delete serverRecordCache[key]);

  // 2. Wipe backend records for this company (keep settings + team membership)
  try {
    const companyId = await ensureCompanyContext();
    if (companyId) {
      const { error } = await supabase
        .from('module_records')
        .delete()
        .eq('company_id', companyId)
        .neq('module_key', 'settings')
        .neq('module_key', 'teams');
      if (error) console.warn('Failed to clear backend records:', error.message);
    }
  } catch (e) {
    console.warn('Backend clear failed:', e);
  }

  // 3. Clear all visible table rows
  document.querySelectorAll('.data-table tbody').forEach(tbody => {
    tbody.innerHTML = '';
  });

  // 4. Reset KPI values (e.g. Total Sales Revenue, Inventory Value, Purchase Cost MTD)
  resetDashboardKpis();

  // 5. Wipe dashboard summary widgets (MRP shortages, demand pipeline,
  //    production capacity, low stock alerts) so nothing remains on screen
  clearDashboardSummaryWidgets();

  // 6. Clear notifications
  localStorage.removeItem('forgeflow_notifications_list');
  notifications = [];
  const notifList = document.getElementById('notificationList');
  if (notifList) notifList.innerHTML = '';
  const notifDot = document.getElementById('notifDot');
  if (notifDot) notifDot.style.display = 'none';
  await clearNotificationsFromServer();

  // 7. Clear search history and close the results dropdown
  localStorage.removeItem('forgeflow_search_history');
  const dropdown = document.getElementById('searchResultsDropdown');
  if (dropdown) dropdown.classList.remove('open');

  // 8. Reset dashboard charts to empty state
  try {
    if (lineChart) lineChart.destroy();
    if (pieChart) pieChart.destroy();
    lineChart = null;
    pieChart = null;
    chartsInited = false;
    initCharts();
  } catch (e) {
    console.warn('Chart reset failed:', e);
  }

  // 9. Flag so a page reload keeps everything cleared
  localStorage.setItem('forgeflow_data_cleared', 'true');
  void persistSettingsToBackend();

  showToast('All data has been cleared successfully', 'success');
}

function resetDashboardKpis() {
  document.querySelectorAll('.kpi-value').forEach(kpi => {
    kpi.textContent = '0';
  });
  document.querySelectorAll('.kpi-trend').forEach(trend => {
    trend.textContent = '';
  });
  document.querySelectorAll('.kpi-bar-fill').forEach(fill => {
    fill.style.width = '0%';
  });
}

function clearDashboardSummaryWidgets() {
  ['mrpShortagesList', 'demandPipelineList', 'productionCapacityList', 'lowStockAlertsList'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
}

function applyClearedDataState() {
  if (localStorage.getItem('forgeflow_data_cleared') !== 'true') return;

  document.querySelectorAll('.data-table tbody').forEach(tbody => {
    tbody.innerHTML = '';
  });

  resetDashboardKpis();
  clearDashboardSummaryWidgets();

  Object.keys(mockData).forEach(key => { mockData[key] = {}; });
  Object.keys(serverRecordCache).forEach(key => delete serverRecordCache[key]);
}

function applyUser(user) {
  const safeUser = user || {};
  const firstName = safeUser.firstName || safeUser.first_name || '';
  const lastName = safeUser.lastName || safeUser.last_name || '';
  const fullName = safeUser.fullName || `${firstName} ${lastName}`.trim() || safeUser.email || `${safeUser.planName || 'User'} Account`;
  const initials = safeUser.initials || (firstName[0] || safeUser.email?.[0] || 'U').toUpperCase() + (lastName[0] || '').toUpperCase();
  const planName = safeUser.planName || 'Free Trial';
  const planLabel = safeUser.planLabel || 'FREE TRIAL';

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
  
  const endDate = getTrialEndDate();
  
  const now = new Date();
  const diff = endDate - now;
  const daysLeft = Math.max(0, Math.min(Math.ceil(diff / (1000 * 60 * 60 * 24)), TRIAL_DURATION_DAYS));
  
  if (diff <= 0) {
    countdownEl.textContent = 'Trial Expired';
    countdownEl.title = 'Your free trial has expired';
    return;
  }
  
  countdownEl.textContent = 'Day ' + daysLeft + ' left';
  countdownEl.title = 'Free trial ends ' + endDate.toLocaleString() + ' — upgrade to keep Pro features';
}

// ============ PLAN-BASED ACCESS CONTROL ============

const planHierarchy = {
  'starter': 1,
  'trial': 3,
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
    'trial': 'Free Trial',
    'starter': 'Starter',
    'professional': 'Professional',
    'enterprise': 'Enterprise'
  };
  return names[planKey] || 'Free Trial';
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
window.showToast = showToast;

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

// ============ SETTINGS PERSISTENCE (backend sync) ============
const SETTINGS_STORAGE_KEYS = [
  'forgeflow_appearance',
  'forgeflow_general',
  'forgeflow_company',
  'forgeflow_notifications',
  'forgeflow_security',
  'forgeflow_integrations_settings',
  'forgeflow_integration_states',
  'forgeflow_subscription',
  'forgeflow_payment_method',
  'forgeflow_roles',
  'forgeflow_invited_users'
];

// Subscription/payment data is excluded from hydration: it can be updated on
// dedicated pages and a stale backend bundle must never roll it back.
const SETTINGS_HYDRATE_KEYS = SETTINGS_STORAGE_KEYS.filter(key =>
  key !== 'forgeflow_subscription' && key !== 'forgeflow_payment_method'
);

function getSettingsBundleFromStorage() {
  const bundle = {};
  SETTINGS_STORAGE_KEYS.forEach(key => {
    const raw = localStorage.getItem(key);
    if (raw) {
      try { bundle[key.replace('forgeflow_', '')] = JSON.parse(raw); }
      catch (e) { bundle[key.replace('forgeflow_', '')] = raw; }
    }
  });
  bundle['data_cleared'] = localStorage.getItem('forgeflow_data_cleared') === 'true';
  bundle['user'] = getForgeflowUser();
  return bundle;
}

async function persistSettingsToBackend() {
  const companyId = await ensureCompanyContext();
  if (!companyId) return;

  try {
    const { error } = await supabase
      .from('module_records')
      .upsert({
        company_id: companyId,
        module_key: 'settings',
        record_id: 'user_settings',
        data: getSettingsBundleFromStorage(),
        created_by: currentAuthUser?.id || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'company_id,module_key,record_id' });
    if (error) throw error;
  } catch (e) {
    console.warn('Failed to persist settings to backend:', e);
  }
}

async function hydrateSettingsFromBackend() {
  const companyId = await ensureCompanyContext();
  if (!companyId) return;

  try {
    const { data, error } = await supabase
      .from('module_records')
      .select('data')
      .eq('company_id', companyId)
      .eq('module_key', 'settings')
      .eq('record_id', 'user_settings')
      .maybeSingle();

    if (error) throw error;
    if (!data?.data) return;

    SETTINGS_HYDRATE_KEYS.forEach(key => {
      const bundleKey = key.replace('forgeflow_', '');
      const value = data.data[bundleKey];
      if (value === undefined || value === null) return;
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    });

    // Payment method is only bootstrapped on a brand-new device so a stale
    // cloud bundle can never roll back a newer local card change.
    const paymentMethod = data.data.payment_method;
    if (paymentMethod !== undefined && paymentMethod !== null && localStorage.getItem('forgeflow_payment_method') === null) {
      localStorage.setItem('forgeflow_payment_method', JSON.stringify(paymentMethod));
    }

    // Subscription is server-authoritative: the trial anchor (day 7) always
    // comes from the server and paid upgrades propagate instantly. A stale
    // bundle can never extend a trial or roll back an active plan.
    if (data.data.subscription) {
      applyServerSubscription(data.data.subscription);
    }

    // Restore the plan label on a fresh device so plan gating and the trial
    // countdown match the account that owns this company.
    if (data.data.user?.planLabel) {
      const user = getForgeflowUser() || {};
      if (!user.planLabel) {
        user.planLabel = data.data.user.planLabel;
        user.planName = data.data.user.planName || user.planName;
        setForgeflowUser(user);
        applyUser(user);
      }
    }

    if (data.data.data_cleared === true) {
      localStorage.setItem('forgeflow_data_cleared', 'true');
      applyClearedDataState();
    }

    if (localStorage.getItem('forgeflow_team_login') === 'true') {
      const user = getForgeflowUser();
      if (user) {
        applyTeamIdentity(user);
        setForgeflowUser(user);
        applyUser(user);
      }
    }
  } catch (e) {
    console.warn('Failed to hydrate settings from backend:', e);
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
  if (triggerButton?.classList.contains('act-btn-view')) return 'edit';
  if (isCreateAction) return 'create';
  if (hasData || recordId) return 'edit';
  return 'create';
}

function applyPaneMode(pane, mode, recordType) {
  pane.dataset.mode = mode;
  
  const saveBtn = pane.querySelector('.btn-pane-save');
  if (saveBtn) {
    saveBtn.style.display = '';
    saveBtn.textContent = mode === 'create'
      ? 'Save ' + recordType
      : 'Update ' + recordType;
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
    paneId: paneId,
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

  if (paneMode === 'create' && !data) {
    const draft = getPaneDraft(paneConfig.type);
    if (draft && hasMeaningfulDraftData(draft)) {
      populatePaneWithRecordData(pane, draft, paneId);
      addMaterialsToPane(pane, draft);
      addStagesToPane(pane, draft);
      renderDraftBar(pane, 'restored', getPaneDraftSavedAt(paneConfig.type));
      showToast('Draft restored for ' + paneConfig.type, 'info');
    }
  }
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

const statusSelectStyles = {
  'Approved': ['var(--success-bg)', 'var(--success-ink)', 'var(--success)'],
  'Active': ['var(--success-bg)', 'var(--success-ink)', 'var(--success)'],
  'Resolved': ['var(--success-bg)', 'var(--success-ink)', 'var(--success)'],
  'Available': ['var(--success-bg)', 'var(--success-ink)', 'var(--success)'],
  'OK': ['var(--success-bg)', 'var(--success-ink)', 'var(--success)'],
  'Delivered': ['var(--success-bg)', 'var(--success-ink)', 'var(--success)'],
  'Received': ['var(--success-bg)', 'var(--success-ink)', 'var(--success)'],
  'Completed': ['var(--blue-bg)', 'var(--blue-ink)', 'var(--blue)'],
  'Packed': ['var(--blue-bg)', 'var(--blue-ink)', 'var(--blue)'],
  'In Progress': ['var(--blue-bg)', 'var(--blue-ink)', 'var(--blue)'],
  'In Production': ['var(--blue-bg)', 'var(--blue-ink)', 'var(--blue)'],
  'Ready': ['var(--blue-bg)', 'var(--blue-ink)', 'var(--blue)'],
  'Shipped': ['var(--purple-bg)', 'var(--purple-ink)', 'var(--purple)'],
  'Rejected': ['var(--danger-bg)', 'var(--danger-ink)', 'var(--danger)'],
  'Cancelled': ['var(--danger-bg)', 'var(--danger-ink)', 'var(--danger)'],
  'Critical': ['var(--danger-bg)', 'var(--danger-ink)', 'var(--danger)'],
  'Pending': ['var(--warn-bg)', 'var(--warn-ink)', 'var(--warn)'],
  'Pending MFG': ['var(--warn-bg)', 'var(--warn-ink)', 'var(--warn)'],
  'Paused': ['var(--warn-bg)', 'var(--warn-ink)', 'var(--warn)'],
  'Scheduled': ['var(--warn-bg)', 'var(--warn-ink)', 'var(--warn)'],
  'On Leave': ['var(--warn-bg)', 'var(--warn-ink)', 'var(--warn)'],
  'Low Stock': ['var(--warn-bg)', 'var(--warn-ink)', 'var(--warn)'],
  'Quote': ['var(--neutral-bg)', 'var(--neutral-ink)', 'var(--neutral)'],
  'Draft': ['var(--neutral-bg)', 'var(--neutral-ink)', 'var(--neutral)'],
  'Retired': ['var(--neutral-bg)', 'var(--neutral-ink)', 'var(--neutral)'],
  'Inactive': ['var(--neutral-bg)', 'var(--neutral-ink)', 'var(--neutral)']
};

function applyStatusSelectStyle(select) {
  const status = select.value || select.dataset.status || '';
  const style = statusSelectStyles[status] || ['var(--neutral-bg)', 'var(--neutral-ink)', 'var(--neutral)'];
  select.style.backgroundColor = style[0];
  select.style.color = style[1];
  select.style.borderColor = style[2];
}

function changeStatus(select) {
  const newStatus = select.value;
  if (!newStatus) return;
  updateStatus(select, newStatus);
  applyStatusSelectStyle(select);
  persistRowStatus(select, newStatus);
  
  const row = select.closest('tr');
  const view = select.closest('.module-view');
  const type = view ? (moduleTypeByViewId[view.id] || 'Record') : 'Record';
  const paneId = getPaneId(type);
  const recordId = row ? (extractIdFromRow(row, paneId) || '') : '';
  const moduleId = view?.id ? view.id.replace('mod-', '') : null;
  addNotification('order', 'Status Changed', `${type} ${recordId} was changed to ${newStatus}.`.trim(), 'order', moduleId);
}

function persistRowStatus(select, newStatus) {
  const row = select.closest('tr');
  const view = select.closest('.module-view');
  if (!row || !view) return;
  const type = moduleTypeByViewId[view.id];
  if (!type) return;
  const paneId = getPaneId(type);
  const recordId = extractIdFromRow(row, paneId);
  if (!recordId) return;
  const dataKey = paneDataMap[paneId]?.dataKey;
  if (!dataKey) return;
  const record = lookupRecord(dataKey, recordId);
  if (!record) return;
  saveRecordOverride(dataKey, recordId, { ...record, status: newStatus });
}

function initStatusDropdowns() {
  document.querySelectorAll('select.status-select').forEach(select => {
    const status = select.dataset.status || select.value;
    if (status && !Array.from(select.options).some(o => o.value === status)) {
      const opt = document.createElement('option');
      opt.value = status;
      opt.textContent = status;
      select.appendChild(opt);
    }
    if (status) select.value = status;
    applyStatusSelectStyle(select);
  });
}

function triggerMRP(soRef) {
  console.log('triggerMRP called:', soRef);
  showToast('MRP triggered for ' + soRef, 'success');
  addNotification('operation', 'MRP Triggered', 'MRP run triggered for sales order ' + soRef + '.', 'operation', 'sales');
}

function confirmSalesOrder(btn, soRef) {
  console.log('confirmSalesOrder called:', soRef);
  updateStatus(btn, 'Pending MFG');
  showToast('Sales order ' + soRef + ' confirmed', 'success');
  addNotification('order', 'Sales Order Confirmed', 'Sales order ' + soRef + ' was confirmed and queued for manufacturing.', 'order', 'sales');
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
  isSigningOut = true;
  localStorage.removeItem('forgeflow_team_login');
  localStorage.removeItem('forgeflow_team_identity');
  await signOut();
  
  const keysToPreserve = [
    'forgeflow_integration_states',
    'forgeflow_search_history',
    'forgeflow_general',
    'forgeflow_company',
    'forgeflow_appearance',
    'forgeflow_notifications',
    'forgeflow_subscription',
    'forgeflow_payment_method',
    'forgeflow_roles',
    'forgeflow_invited_users',
    'forgeflow_security'
  ];
  
  const preserved = {};
  keysToPreserve.forEach(key => {
    const val = localStorage.getItem(key);
    if (val !== null) preserved[key] = val;
  });
  
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('forgeflow_')) {
      localStorage.removeItem(key);
    }
  });
  
  Object.entries(preserved).forEach(([key, val]) => {
    localStorage.setItem(key, val);
  });
  
  localStorage.removeItem('forgeflow_user');
  window.location.href = 'index.html';
}

// ============ INTEGRATION FUNCTIONS ============
const INTEGRATION_PROVIDER_MAP = {
  zoho: 'Zoho Suite',
  shopify: 'Shopify',
  quickbooks: 'QuickBooks',
  gsheets: 'Google Sheets',
};

const INTEGRATION_PROVIDER_CONFIG = {
  zoho: {
    name: 'Zoho Suite',
    fields: [
      { key: 'organization_id', label: 'Organization ID', type: 'text', placeholder: 'Zoho Books org id', help: 'Auto-detected on first sync. Set manually if detection fails.' },
      { key: 'api_domain', label: 'API Domain', type: 'text', placeholder: 'https://www.zohoapis.com', help: 'Data-center specific API domain.' },
    ],
  },
  shopify: {
    name: 'Shopify',
    fields: [
      { key: 'store_domain', label: 'Store Domain', type: 'text', placeholder: 'your-store.myshopify.com', help: 'Used to address your store API.' },
    ],
  },
  quickbooks: {
    name: 'QuickBooks',
    fields: [
      { key: 'company_id', label: 'Company ID (Realm)', type: 'text', placeholder: '1234567890', help: 'Your QuickBooks company realm ID.' },
    ],
  },
  gsheets: {
    name: 'Google Sheets',
    fields: [
      { key: 'spreadsheet_id', label: 'Spreadsheet ID', type: 'text', placeholder: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms', help: 'The id in your spreadsheet URL.' },
      { key: 'sheet_name', label: 'Default Sheet Name', type: 'text', placeholder: 'Inventory', help: 'Default tab used for exports.' },
    ],
  },
};

const INTEGRATION_SYNC_ACTIONS = {
  gsheets: [
    { action: 'list_spreadsheets', label: 'List Spreadsheets' },
    { action: 'export_inventory', label: 'Export Inventory' },
    { action: 'export_orders', label: 'Export Sales Orders' },
    { action: 'export_mfg', label: 'Export Manufacturing' },
  ],
  zoho: [
    { action: 'test', label: 'Test Connection' },
    { action: 'list_contacts', label: 'List Contacts' },
    { action: 'list_invoices', label: 'List Invoices' },
    { action: 'export_sales_orders', label: 'Export Sales Orders to Zoho' },
  ],
  shopify: [
    { action: 'get_products', label: 'Get Products' },
    { action: 'get_orders', label: 'Get Orders' },
    { action: 'sync_products', label: 'Sync Products' },
    { action: 'sync_orders', label: 'Sync Orders' },
  ],
  quickbooks: [],
};

let activeIntegrationProvider = null;
let activeIntegrationSettings = {};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function connectIntegration(provider) {
  console.log('connectIntegration called:', provider);

  // Integrations require Professional plan or higher (aligned with sidebar gating)
  if (getUserPlanLevel() < planHierarchy.professional) {
    showUpgradeModal('Integrations', 'professional');
    return;
  }
  
  const btn = document.getElementById(provider + '-connect') || document.getElementById('settings-' + provider + '-connect');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Connecting...';
  }
  
  try {
    const result = await window.IntegrationService.connect(provider);
      
    if (result.redirecting) {
      showToast('Redirecting to ' + provider + '...', 'info');
      return;
    }

    updateIntegrationStatus(provider, true, { connectedVia: 'manual' });
    showToast('Connected to ' + (INTEGRATION_PROVIDER_MAP[provider] || provider) + ' successfully!', 'success');
    addNotification('integration', 'Integration Connected', 'Connected to ' + (INTEGRATION_PROVIDER_MAP[provider] || provider) + '.', 'integration', 'integrations');
  } catch (error) {
    console.error('Failed to connect integration:', error);
    showToast('Failed to connect to ' + (INTEGRATION_PROVIDER_MAP[provider] || provider) + ': ' + error.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Connect';
    }
  }
}

function getIntegrationStates() {
  try {
    const saved = localStorage.getItem('forgeflow_integration_states');
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function setIntegrationState(provider, state) {
  const states = getIntegrationStates();
  states[provider] = { ...state, updatedAt: new Date().toISOString() };
  localStorage.setItem('forgeflow_integration_states', JSON.stringify(states));
  void persistSettingsToBackend();
}

function removeIntegrationState(provider) {
  const states = getIntegrationStates();
  delete states[provider];
  localStorage.setItem('forgeflow_integration_states', JSON.stringify(states));
  void persistSettingsToBackend();
}

function updateIntegrationCard(provider, prefix, connected) {
  const statusEl = document.getElementById(prefix + provider + '-status');
  const connectBtn = document.getElementById(prefix + provider + '-connect');
  const configBtn = document.getElementById(prefix + provider + '-config');

  if (statusEl) {
    statusEl.textContent = connected ? 'Connected' : 'Not Connected';
    statusEl.className = 'integration-status ' + (connected ? 'connected' : 'disconnected');
  }

  if (connectBtn && configBtn) {
    connectBtn.style.display = connected ? 'none' : 'inline-block';
    configBtn.style.display = connected ? 'inline-block' : 'none';
    if (connected) {
      configBtn.textContent = 'Configure';
      configBtn.onclick = () => openIntegrationModal(provider);
    } else {
      configBtn.onclick = null;
    }
  }
}

function updateIntegrationStatus(provider, connected, meta = {}) {
  updateIntegrationCard(provider, '', connected);
  updateIntegrationCard(provider, 'settings-', connected);

  if (connected) {
    setIntegrationState(provider, { connected: true, ...meta });
  } else {
    removeIntegrationState(provider);
  }
}

function restoreAllIntegrationStates() {
  const states = getIntegrationStates();
  Object.entries(states).forEach(([provider, state]) => {
    if (state.connected) {
      updateIntegrationStatus(provider, true, state);
    }
  });
}

async function refreshIntegrationStatuses() {
  if (!window.IntegrationService) return;
  try {
    const statuses = await window.IntegrationService.getAllStatuses();
    Object.entries(statuses).forEach(([provider, status]) => {
      if (status && status.connected) {
        updateIntegrationStatus(provider, true, {
          connectedVia: status.metadata?.connectedVia || 'oauth',
          lastSync: status.lastSync,
        });
      }
    });
  } catch (error) {
    console.warn('Failed to refresh integration statuses from backend:', error);
  }
}

function handleIntegrationOAuthCallback() {
  if (!window.IntegrationService) return;

  const result = window.IntegrationService.parseOAuthCallback();
  if (!result) return;

  window.IntegrationService.clearOAuthCallbackFromUrl();

  if (result.status === 'success') {
    updateIntegrationStatus(result.provider, true, { connectedVia: 'oauth' });
    showToast('Connected to ' + (INTEGRATION_PROVIDER_MAP[result.provider] || result.provider) + ' successfully!', 'success');
    void refreshIntegrationStatuses();
  } else {
    const reason = result.description || result.message || 'Authorization failed';
    showToast('Failed to connect ' + (INTEGRATION_PROVIDER_MAP[result.provider] || result.provider) + ': ' + reason, 'error');
  }
}

// ============ WEBHOOK CONFIG ============
const WEBHOOK_EVENTS = [
  { value: 'manufacturing_created', label: 'Manufacturing order created' },
  { value: 'manufacturing_completed', label: 'Manufacturing order completed' },
  { value: 'inventory_low', label: 'Low stock alert' },
  { value: 'inventory_updated', label: 'Inventory updated' },
  { value: 'order_created', label: 'Sales order created' },
  { value: 'order_shipped', label: 'Sales order shipped' },
];

async function loadWebhookConfig() {
  if (!window.IntegrationService) return;
  try {
    const config = await window.IntegrationService.getWebhookConfig();
    const urlInput = document.getElementById('webhookUrl');
    const secretInput = document.getElementById('webhookSecret');
    const activeToggle = document.getElementById('webhookActive');
    const eventsContainer = document.getElementById('webhookEvents');

    if (!urlInput) return;

    if (config) {
      urlInput.value = config.webhook_url || '';
      secretInput.value = config.webhook_secret || '';
      if (activeToggle) {
        activeToggle.classList.toggle('active', config.is_active !== false);
      }
      updateWebhookEventCheckboxes(config.events || []);
      updateWebhookStatusUI(true, config);
    } else {
      if (activeToggle) activeToggle.classList.add('active');
      updateWebhookStatusUI(false, null);
    }
  } catch (error) {
    console.warn('Failed to load webhook config:', error);
  }
}

function updateWebhookEventCheckboxes(selectedEvents) {
  const eventsContainer = document.getElementById('webhookEvents');
  if (!eventsContainer) return;
  eventsContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = selectedEvents.includes(cb.value);
  });
}

function getSelectedWebhookEvents() {
  const eventsContainer = document.getElementById('webhookEvents');
  if (!eventsContainer) return [];
  return Array.from(eventsContainer.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value);
}

function updateWebhookStatusUI(configured, config) {
  const statusEl = document.getElementById('webhook-status');
  const saveBtn = document.getElementById('saveWebhookBtn');
  const testBtn = document.getElementById('testWebhookBtn');
  const deleteBtn = document.getElementById('deleteWebhookBtn');

  if (statusEl) {
    statusEl.textContent = configured ? 'Configured' : 'Not configured';
    statusEl.className = 'integration-status ' + (configured ? 'connected' : 'disconnected');
  }
  if (saveBtn) saveBtn.textContent = configured ? 'Update' : 'Save';
  if (testBtn) testBtn.style.display = configured ? 'inline-block' : 'none';
  if (deleteBtn) deleteBtn.style.display = configured ? 'inline-block' : 'none';
}

async function saveWebhookConfig() {
  const urlInput = document.getElementById('webhookUrl');
  const secretInput = document.getElementById('webhookSecret');
  const activeToggle = document.getElementById('webhookActive');

  if (!urlInput || !urlInput.value.trim()) {
    showToast('Webhook URL is required', 'error');
    return;
  }

  let url = urlInput.value.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

    const config = {
      webhook_url: url,
      webhook_secret: secretInput?.value.trim() || null,
      events: getSelectedWebhookEvents(),
      headers: {},
      is_active: activeToggle ? activeToggle.classList.contains('active') : true,
    };

  try {
    const result = await window.IntegrationService.saveWebhookConfig(config);
    updateWebhookStatusUI(true, result.data);
    showToast('Webhook configuration saved!', 'success');
    addNotification('webhook', 'Webhook Saved', 'Outgoing webhook configuration was saved.', 'webhook', 'integrations');
  } catch (error) {
    showToast('Failed to save webhook: ' + error.message, 'error');
  }
}

async function testWebhook() {
  const testBtn = document.getElementById('testWebhookBtn');
  if (testBtn) {
    testBtn.disabled = true;
    testBtn.textContent = 'Sending...';
  }
  try {
    const result = await window.IntegrationService.sendWebhook('test_event', {
      message: 'ForgeFlow webhook test',
    });
    showToast(result.success ? 'Webhook delivered successfully!' : 'Webhook event not subscribed', result.success ? 'success' : 'info');
  } catch (error) {
    showToast('Webhook test failed: ' + error.message, 'error');
  } finally {
    if (testBtn) {
      testBtn.disabled = false;
      testBtn.textContent = 'Test';
    }
  }
}

async function deleteWebhook() {
  if (!confirm('Are you sure you want to remove the webhook configuration?')) return;
  try {
    await window.IntegrationService.deleteWebhookConfig();
    const urlInput = document.getElementById('webhookUrl');
    const secretInput = document.getElementById('webhookSecret');
    if (urlInput) urlInput.value = '';
    if (secretInput) secretInput.value = '';
    updateWebhookStatusUI(false, null);
    showToast('Webhook configuration removed', 'success');
    addNotification('webhook', 'Webhook Removed', 'Outgoing webhook configuration was removed.', 'webhook', 'integrations');
  } catch (error) {
    showToast('Failed to remove webhook: ' + error.message, 'error');
  }
}

async function disconnectIntegration(provider) {
  if (!confirm('Are you sure you want to disconnect ' + provider + '?')) return;
  
  try {
    if (window.IntegrationService) {
      await window.IntegrationService.disconnect(provider);
    }
    
    updateIntegrationStatus(provider, false);
    removeIntegrationState(provider);
    showToast('Disconnected from ' + provider, 'success');
    addNotification('integration', 'Integration Disconnected', 'Disconnected from ' + provider + '.', 'integration', 'integrations');
  } catch (error) {
    console.error('Failed to disconnect:', error);
    showToast('Failed to disconnect', 'error');
  }
}

function closeIntegrationModal() {
  const modal = document.getElementById('integrationModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
  activeIntegrationProvider = null;
  activeIntegrationSettings = {};
}

function buildIntegrationSettingsForm(provider, settings) {
  const config = INTEGRATION_PROVIDER_CONFIG[provider];
  if (!config) return '';

  return config.fields.map((field) => {
    const value = settings[field.key] || '';
    return `<div class="integration-form-group">
      <label for="int-settings-${field.key}">${field.label}</label>
      <input type="${field.type || 'text'}" id="int-settings-${field.key}" value="${escapeHtml(value)}" placeholder="${field.placeholder || ''}">
      ${field.help ? `<small>${field.help}</small>` : ''}
    </div>`;
  }).join('');
}

function buildIntegrationSyncActions(provider) {
  const actions = INTEGRATION_SYNC_ACTIONS[provider] || [];
  if (!actions.length) return '';

  return `<div class="integration-form-group">
    <label>Sync Actions</label>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${actions.map((a) => `<button type="button" class="btn-secondary" style="flex:none;font-size:12px;padding:8px 12px" onclick="runIntegrationSync('${provider}', '${a.action}')">${a.label}</button>`).join('')}
    </div>
    <small>Runs a sync against the connected provider. Results are recorded in the activity log.</small>
  </div>`;
}

function buildIntegrationSyncLogs(provider) {
  return `<div class="integration-form-group">
    <label>Recent Activity</label>
    <div id="integrationLogsList"><p style="font-size:13px;color:var(--gray-400);padding:8px 0">Loading...</p></div>
  </div>`;
}

async function openIntegrationModal(provider) {
  if (!window.IntegrationService) return;

  const modal = document.getElementById('integrationModal');
  const title = document.getElementById('modalIntegrationTitle');
  const body = document.getElementById('modalIntegrationBody');
  if (!modal || !body) return;

  activeIntegrationProvider = provider;
  activeIntegrationSettings = {};

  title.textContent = 'Configure ' + (INTEGRATION_PROVIDER_MAP[provider] || provider);

  const status = await window.IntegrationService.getStatus(provider);
  const settings = (status && status.settings) || {};

  body.innerHTML = `
    <div class="integration-form-group">
      <label>Connection Status</label>
      <div class="integration-sync-info">
        <p>${status && status.connected ? 'Connected' : 'Not connected'}</p>
        ${status && status.lastSync ? `<small>Last sync: ${new Date(status.lastSync).toLocaleString()}</small>` : ''}
      </div>
    </div>
    ${buildIntegrationSettingsForm(provider, settings)}
    <div class="integration-toggle">
      <div>
        <span class="integration-toggle-label">Auto Sync</span>
        <span class="integration-toggle-desc">Allow scheduled background syncs for this provider</span>
      </div>
      <div class="integration-toggle-switch${settings.auto_sync !== false ? ' active' : ''}" id="int-auto-sync" onclick="this.classList.toggle('active')"></div>
    </div>
    ${buildIntegrationSyncActions(provider)}
    <div style="display:flex;gap:12px;padding:20px 0 8px;flex-wrap:wrap">
      <button class="btn-primary" onclick="saveProviderSettings('${provider}')">Save Settings</button>
      <button class="btn-secondary" onclick="testProviderConnection('${provider}')">Test Connection</button>
      <button class="btn-danger" onclick="disconnectIntegrationFromModal('${provider}')">Disconnect</button>
    </div>
    ${buildIntegrationSyncLogs(provider)}
  `;

  activeIntegrationSettings = settings;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  void renderIntegrationLogs(provider);
}

async function saveProviderSettings(provider) {
  if (!window.IntegrationService) return;

  const settings = { ...activeIntegrationSettings };
  const config = INTEGRATION_PROVIDER_CONFIG[provider];
  if (config) {
    config.fields.forEach((field) => {
      const el = document.getElementById('int-settings-' + field.key);
      if (el) settings[field.key] = el.value.trim();
    });
  }
  const autoSync = document.getElementById('int-auto-sync');
  if (autoSync) settings.auto_sync = autoSync.classList.contains('active');

  try {
    await window.IntegrationService.saveSettings(provider, settings);
    activeIntegrationSettings = settings;
    showToast('Settings saved for ' + (INTEGRATION_PROVIDER_MAP[provider] || provider), 'success');
    addNotification('integration', 'Integration Settings Saved', 'Updated settings for ' + (INTEGRATION_PROVIDER_MAP[provider] || provider) + '.', 'settings', 'integrations');
  } catch (error) {
    console.error('Failed to save integration settings:', error);
    showToast('Failed to save settings: ' + error.message, 'error');
  }
}

async function testProviderConnection(provider) {
  if (!window.IntegrationService) return;
  showToast('Testing connection to ' + (INTEGRATION_PROVIDER_MAP[provider] || provider) + '...', 'info');
  const result = await window.IntegrationService.testConnection(provider);
  if (result.success) {
    showToast('Connection OK', 'success');
  } else {
    showToast('Connection failed: ' + (result.error || 'Unknown error'), 'error');
  }
  void renderIntegrationLogs(provider);
}

async function runIntegrationSync(provider, action) {
  if (!window.IntegrationService) return;
  const data = {};
  if (provider === 'gsheets') {
    data.spreadsheetId = activeIntegrationSettings.spreadsheet_id || '';
    data.sheetName = activeIntegrationSettings.sheet_name || 'Inventory';
  }
  showToast('Running ' + action + '...', 'info');
  try {
    await window.IntegrationService.sync(provider, action, data);
    showToast('Sync completed successfully', 'success');
  } catch (error) {
    console.error('Sync failed:', error);
    showToast('Sync failed: ' + error.message, 'error');
  }
  void renderIntegrationLogs(provider);
}

async function renderIntegrationLogs(provider) {
  if (!window.IntegrationService) return;
  const container = document.getElementById('integrationLogsList');
  if (!container) return;

  const logs = await window.IntegrationService.getLogs(provider, 10);
  if (!logs.length) {
    container.innerHTML = '<p style="font-size:13px;color:var(--gray-400);padding:8px 0">No activity yet.</p>';
    return;
  }

  container.innerHTML = logs.map((log) => {
    const time = log.created_at ? new Date(log.created_at).toLocaleString() : '';
    const isSuccess = log.status === 'success';
    const isError = log.status === 'error';
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--gray-100);font-size:13px">
      <div>
        <strong>${escapeHtml(log.action)}</strong>
        ${log.error_message ? `<span style="color:var(--danger);display:block;font-size:12px">${escapeHtml(log.error_message)}</span>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
        <span style="color:var(--gray-400);font-size:12px">${time}</span>
        <span class="badge ${isSuccess ? 'badge-active' : (isError ? 'badge-pending' : 'badge-draft')}" style="${isError ? 'background:var(--danger-bg);color:var(--danger)' : ''}">${escapeHtml(log.status)}</span>
      </div>
    </div>`;
  }).join('');
}

async function disconnectIntegrationFromModal(provider) {
  await disconnectIntegration(provider);
  closeIntegrationModal();
}

// ============ RECORD MANAGEMENT ============
function saveRecord(type, id) {
  console.log('saveRecord called:', type, id);
  
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

  clearPaneDraft(type);

  closePane();
  const isEdit = currentPaneData?.mode === 'edit';
  const savedAction = isEdit ? 'updated' : 'saved';
  showToast(
    type + (isEdit ? ' updated successfully!' : ' saved successfully!'),
    'success'
  );
  
  const recordLabel = recordData.name || recordData.product || recordData.customer || recordData.supplier || recordData.firstName || recordId;
  const moduleId = paneConfig.dataKey ? getModuleIdForDataKey(paneConfig.dataKey) : null;
  addNotification(
    isEdit ? 'order' : 'success',
    (isEdit ? 'Record Updated' : 'Record Created'),
    `${type} ${recordLabel} was ${savedAction}.`,
    isEdit ? 'order' : 'success',
    moduleId
  );
  
  if (typeof refreshCurrentModule === 'function') {
    refreshCurrentModule();
  }
}

function getLegacyRecordStorageKey(type) {
  return 'forgeflow_' + type.toLowerCase().replace(/\s+/g, '_') + 's';
}

const DRAFT_STORAGE_KEY = 'forgeflow_drafts';
let draftSaveTimer = null;

function getDraftServerRecordId(type) {
  return type.toLowerCase().replace(/\s+/g, '_');
}

function getPaneDraft(type) {
  try {
    const store = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || '{}');
    const draft = store[type];
    if (draft && draft.data) return { ...draft.data };
  } catch (e) { /* ignore */ }
  const serverDraft = serverRecordCache['drafts']?.[getDraftServerRecordId(type)];
  if (serverDraft && serverDraft.data) return { ...serverDraft.data };
  return null;
}

function getPaneDraftSavedAt(type) {
  try {
    const store = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || '{}');
    const draft = store[type];
    if (draft && draft.savedAt) return draft.savedAt;
  } catch (e) { /* ignore */ }
  const serverDraft = serverRecordCache['drafts']?.[getDraftServerRecordId(type)];
  return serverDraft?.savedAt || null;
}

function hasMeaningfulDraftData(data) {
  return Object.entries(data || {}).some(([key, value]) => {
    if (key === 'id' || key === 'createdAt' || key === 'updatedAt') return false;
    if (Array.isArray(value)) return value.length > 0;
    return value !== '' && value !== null && value !== undefined;
  });
}

function savePaneDraft(type, silent = false) {
  if (!type) return;
  const data = collectPaneData(type);
  if (!hasMeaningfulDraftData(data)) return;
  const savedAt = new Date().toISOString();
  let isNewDraft = false;
  try {
    const store = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || '{}');
    isNewDraft = !store[type];
    store[type] = { data, savedAt };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(store));
  } catch (e) { return; }
  if (isNewDraft) {
    const paneId = getPaneId(type);
    const moduleId = paneDataMap[paneId]?.dataKey ? getModuleIdForDataKey(paneDataMap[paneId].dataKey) : null;
    addNotification('draft', 'Draft Saved', `A draft for ${type} was saved and will restore on your next visit.`, 'draft', moduleId);
  }
  void savePaneDraftToServer(type, { data, savedAt });
  const pane = document.getElementById(getPaneId(type));
  if (pane) renderDraftBar(pane, 'saved', savedAt);
  if (!silent) showToast('Draft saved for ' + type, 'info');
}

function clearPaneDraft(type) {
  if (!type) return;
  try {
    const store = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || '{}');
    delete store[type];
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(store));
  } catch (e) { /* ignore */ }
  const pane = document.getElementById(getPaneId(type));
  if (pane) renderDraftBar(pane, null);
  void clearPaneDraftFromServer(type);
}

async function savePaneDraftToServer(type, draft) {
  const companyId = await ensureCompanyContext();
  if (!companyId || !supabase) return;
  try {
    await supabase.from('module_records').upsert({
      company_id: companyId,
      module_key: 'drafts',
      record_id: getDraftServerRecordId(type),
      data: draft,
      updated_at: draft.savedAt
    }, { onConflict: 'company_id,module_key,record_id' });
  } catch (e) { console.warn('Draft sync failed:', e); }
}

async function clearPaneDraftFromServer(type) {
  const companyId = await ensureCompanyContext();
  if (!companyId || !supabase) return;
  try {
    await supabase.from('module_records')
      .delete()
      .eq('company_id', companyId)
      .eq('module_key', 'drafts')
      .eq('record_id', getDraftServerRecordId(type));
  } catch (e) { console.warn('Draft delete failed:', e); }
}

function renderDraftBar(pane, state, savedAt) {
  if (!pane) return;
  let bar = pane.querySelector('.pane-draft-bar');
  if (!state) {
    if (bar) bar.remove();
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'pane-draft-bar';
    const body = pane.querySelector('.pane-body');
    if (body) body.prepend(bar);
    else pane.appendChild(bar);
  }
  bar.innerHTML = '';
  const label = document.createElement('span');
  label.textContent = state === 'restored'
    ? 'Draft restored — ' + timeAgoLabel(savedAt)
    : 'Draft saved ' + timeAgoLabel(savedAt);
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'draft-clear-btn';
  clearBtn.textContent = 'Discard draft';
  clearBtn.addEventListener('click', () => {
    const type = paneDataMap[pane.id]?.type;
    if (type) clearPaneDraft(type);
    resetPaneFields(pane);
    showToast('Draft discarded', 'info');
  });
  bar.appendChild(label);
  bar.appendChild(clearBtn);
}

function timeAgoLabel(iso) {
  if (!iso) return 'just now';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60000) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

function initPaneDraftBinding() {
  const scheduleDraftSave = (e) => {
    const pane = e.target.closest('.pane');
    if (!pane) return;
    if (currentPaneData?.paneId !== pane.id) return;
    if (currentPaneData?.mode !== 'create') return;
    const type = paneDataMap[pane.id]?.type;
    if (!type) return;
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => {
      savePaneDraft(type, true);
    }, 600);
  };
  document.addEventListener('input', scheduleDraftSave);
  document.addEventListener('change', scheduleDraftSave);
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
    'edit'
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
  const activeModule = document.querySelector('.module-view.active')?.id?.replace('mod-', '') || null;
  addNotification('import', 'Data Imported', `${data.length} record(s) imported into the active module.`, 'import', activeModule);
  console.log('Imported data:', data);
}

// ============ SETTINGS FUNCTIONS ============
const TRIAL_DURATION_DAYS = 7;
const BILLING_PERIOD_DAYS = 30;
const ANNUAL_PERIOD_DAYS = 365;

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getBillingPeriodDays(billingCycle) {
  return billingCycle === 'annual' ? ANNUAL_PERIOD_DAYS : BILLING_PERIOD_DAYS;
}

const planDetails = {
  trial: {
    name: 'Free Trial',
    price: '$0',
    period: '/' + TRIAL_DURATION_DAYS + ' days',
    features: ['Full platform access', 'Workfloor Operations', 'Advanced reporting', 'API access', 'Up to 30 users', 'Priority support'],
    limits: {
      products: 2000,
      users: 30,
      storage: '50GB',
      api: '100,000'
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

// ============ SERVER-AUTHORITATIVE SUBSCRIPTION SYNC ============
// The subscription is persisted inside the settings bundle on the backend so
// the 7-day trial is anchored server-wide. The server owns the trial start
// date, which stops users from resetting their countdown by clearing local
// storage, and keeps every device for the same company counting down together.
function resolveSubscription(local, serverSub) {
  if (!local) return serverSub;
  if (!serverSub) return local;

  const localStatus = local.status || 'trial';
  const serverStatus = serverSub.status || 'trial';

  // A paid/active subscription on the server is authoritative because a payment
  // was received (and instantly persisted) somewhere — adopt it everywhere.
  if (serverStatus === 'active') return serverSub;

  // Never downgrade a locally active plan because of a stale trial bundle.
  if (localStatus === 'active') return local;

  // Both are trial/expired: the server owns the trial start so every device
  // counts down from the same day-7 anchor.
  return {
    ...local,
    status: serverSub.status || local.status,
    plan: serverSub.plan || local.plan,
    planName: serverSub.planName || local.planName,
    startDate: serverSub.startDate || local.startDate,
    trialEndDate: serverSub.trialEndDate || local.trialEndDate,
    currentPeriodStart: serverSub.currentPeriodStart || local.currentPeriodStart,
    currentPeriodEnd: serverSub.currentPeriodEnd || local.currentPeriodEnd,
    nextPaymentDate: serverSub.nextPaymentDate || local.nextPaymentDate,
    billingCycle: serverSub.billingCycle || local.billingCycle,
    lastPaymentDate: serverSub.lastPaymentDate || local.lastPaymentDate,
    paymentHistory: serverSub.paymentHistory && serverSub.paymentHistory.length
      ? serverSub.paymentHistory
      : (local.paymentHistory || [])
  };
}

function applyServerSubscription(serverSub) {
  if (!serverSub || typeof serverSub !== 'object') return;
  const local = getSubscription();
  const merged = resolveSubscription(local, serverSub);
  if (!merged) return;

  const localJson = local ? JSON.stringify(local) : null;
  if (JSON.stringify(merged) === localJson) return;

  setSubscription(merged);
  refreshSubscriptionUI();
  void persistSettingsToBackend();
}

function refreshSubscriptionUI() {
  initTrialCountdown();
  applyUser(getForgeflowUser());
  updateBillingInfo();
  checkAndProcessRenewal();
  evaluateTrialStatus();
}

let subscriptionRealtimeChannel = null;

function initSubscriptionRealtime() {
  if (!supabase || subscriptionRealtimeChannel) return;
  try {
    subscriptionRealtimeChannel = supabase
      .channel('forgeflow-subscription-sync')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'module_records',
        filter: 'module_key=eq.settings'
      }, (payload) => {
        const newData = payload?.new?.data;
        if (!newData || !newData.subscription) return;
        applyServerSubscription(newData.subscription);
      })
      .subscribe();
  } catch (e) {
    console.warn('Realtime subscription sync unavailable:', e);
  }
}

// ============ TRIAL EXPIRED DETECTION + UPGRADE POPUP ============
let trialExpiredPromptShown = false;
let trialEndingPromptShown = false;

function evaluateTrialStatus() {
  const user = getForgeflowUser() || {};
  if (['STARTER', 'PRO', 'PROFESSIONAL', 'ENTERPRISE'].includes(user.planLabel)) return;

  // Day 1 (last day) of the trial → prompt the user to upgrade so they can
  // keep using the Pro features they already have access to.
  if (!isTrialExpired()) {
    if (!trialEndingPromptShown && getTrialDaysRemaining() <= 1) {
      trialEndingPromptShown = true;
      showTrialEndingModal();
    }
    return;
  }

  const subscription = getSubscription() || {};
  if (subscription.status !== 'expired') {
    subscription.status = 'expired';
    setSubscription(subscription);
    void persistSettingsToBackend();
  }

  const badgeText = document.getElementById('planBadge')?.querySelector('.plan-badge-text');
  if (badgeText && badgeText.textContent !== 'TRIAL EXPIRED') {
    badgeText.textContent = 'TRIAL EXPIRED';
  }

  if (!trialExpiredPromptShown) {
    trialExpiredPromptShown = true;
    showTrialExpiredModal();
  }
}

function createTrialExpiredModal() {
  const modalHTML = `
    <div id="trialExpiredModal" class="modal-overlay">
      <div class="modal-container upgrade-modal">
        <button class="modal-close" onclick="closeTrialExpiredModal()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        
        <div class="modal-header">
          <div class="modal-icon upgrade-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h2 class="modal-title">Your Free Trial Has Ended</h2>
          <p class="modal-subtitle">Your 7-day free trial has expired. Upgrade to a paid plan to keep using ForgeFlow without interruption. Paid plans recur every 30 days.</p>
        </div>
        
        <div class="upgrade-features">
          <div class="upgrade-feature">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Full platform access</span>
          </div>
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
            <span>Priority Support</span>
          </div>
        </div>
        
        <button class="modal-submit-btn" onclick="goToUpgradeFromTrial()">
          Upgrade Now
        </button>
        <button class="trial-later-btn" onclick="closeTrialExpiredModal()">Maybe Later</button>
        
        <p class="modal-disclaimer">Cancel anytime. No hidden fees.</p>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modal = document.getElementById('trialExpiredModal');
  modal.addEventListener('click', function(e) {
    if (e.target === this) closeTrialExpiredModal();
  });
}

function showTrialExpiredModal() {
  let modal = document.getElementById('trialExpiredModal');
  if (!modal) {
    createTrialExpiredModal();
    modal = document.getElementById('trialExpiredModal');
  }
  if (!modal) return;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeTrialExpiredModal() {
  const modal = document.getElementById('trialExpiredModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

function goToUpgradeFromTrial() {
  closeTrialExpiredModal();
  window.location.href = 'pricing-select.html?upgrade=true';
}

window.closeTrialExpiredModal = closeTrialExpiredModal;
window.goToUpgradeFromTrial = goToUpgradeFromTrial;

function createTrialEndingModal() {
  const modalHTML = `
    <div id="trialEndingModal" class="modal-overlay">
      <div class="modal-container upgrade-modal">
        <button class="modal-close" onclick="closeTrialEndingModal()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        
        <div class="modal-header">
          <div class="modal-icon upgrade-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <h2 class="modal-title">Last Day of Your Free Trial</h2>
          <p class="modal-subtitle">This is <strong>Day 1</strong> of your 7-day free trial — tomorrow your Pro features switch off unless you upgrade. Keep full platform access with a paid plan that recurs every 30 days.</p>
        </div>
        
        <div class="upgrade-features">
          <div class="upgrade-feature">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Full platform access</span>
          </div>
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
            <span>Priority Support</span>
          </div>
        </div>
        
        <button class="modal-submit-btn" onclick="goToUpgradeFromTrialEnding()">
          Upgrade Now
        </button>
        <button class="trial-later-btn" onclick="closeTrialEndingModal()">Maybe Later</button>
        
        <p class="modal-disclaimer">Cancel anytime. No hidden fees.</p>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modal = document.getElementById('trialEndingModal');
  modal.addEventListener('click', function(e) {
    if (e.target === this) closeTrialEndingModal();
  });
}

function showTrialEndingModal() {
  let modal = document.getElementById('trialEndingModal');
  if (!modal) {
    createTrialEndingModal();
    modal = document.getElementById('trialEndingModal');
  }
  if (!modal) return;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeTrialEndingModal() {
  const modal = document.getElementById('trialEndingModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

function goToUpgradeFromTrialEnding() {
  closeTrialEndingModal();
  window.location.href = 'pricing-select.html?upgrade=true';
}

window.closeTrialEndingModal = closeTrialEndingModal;
window.goToUpgradeFromTrialEnding = goToUpgradeFromTrialEnding;

function initSubscription() {
  let subscription = getSubscription();
  
  if (!subscription) {
    const now = new Date();
    subscription = {
      status: 'trial',
      plan: 'trial',
      startDate: now.toISOString(),
      trialEndDate: addDays(now, TRIAL_DURATION_DAYS).toISOString(),
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: addDays(now, TRIAL_DURATION_DAYS).toISOString(),
      billingCycle: 'monthly',
      lastPaymentDate: null,
      nextPaymentDate: addDays(now, TRIAL_DURATION_DAYS).toISOString(),
      paymentHistory: []
    };
    setSubscription(subscription);
    void persistSettingsToBackend();
  }
  
  return subscription;
}

function activateSubscription(planKey) {
  const now = new Date();
  const periodDays = getBillingPeriodDays('monthly');
  
  const subscription = {
    status: 'active',
    plan: planKey,
    planName: planDetails[planKey]?.name || 'Unknown',
    startDate: now.toISOString(),
    trialEndDate: null,
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: addDays(now, periodDays).toISOString(),
    billingCycle: 'monthly',
    lastPaymentDate: now.toISOString(),
    nextPaymentDate: addDays(now, periodDays).toISOString(),
    paymentHistory: []
  };
  
  // Add first payment record
  const plan = planDetails[planKey];
  subscription.paymentHistory.unshift({
    id: 'sub_' + Date.now(),
    date: now.toISOString(),
    description: plan.name + ' Plan - First Payment',
    amount: plan.priceCents || 0,
    status: 'paid',
    invoiceId: 'INV-' + Date.now()
  });
  
  setSubscription(subscription);
  void persistSettingsToBackend();
  
  // Update user plan
  const user = getForgeflowUser() || {};
  user.planLabel = planKey.toUpperCase() === 'PROFESSIONAL' ? 'PRO' : planKey.toUpperCase();
  user.planName = plan.name;
  setForgeflowUser(user);
  applyUser(user);
  
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
  const periodDays = getBillingPeriodDays(subscription.billingCycle || 'monthly');
  
  const plan = planDetails[subscription.plan] || planDetails.starter;
  
  subscription.currentPeriodStart = now.toISOString();
  subscription.currentPeriodEnd = addDays(now, periodDays).toISOString();
  subscription.lastPaymentDate = now.toISOString();
  subscription.nextPaymentDate = addDays(now, periodDays).toISOString();
  
  // Add payment to history
  subscription.paymentHistory.unshift({
    id: 'sub_' + Date.now(),
    date: now.toISOString(),
    description: plan.name + ' Plan - ' + (subscription.billingCycle === 'annual' ? 'Annual Renewal' : '30-Day Renewal'),
    amount: plan.priceCents || 0,
    status: 'paid',
    invoiceId: 'INV-' + Date.now()
  });
  
  setSubscription(subscription);
  void persistSettingsToBackend();
  showToast('Subscription renewed successfully!', 'success');
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
  if (!subscription) return TRIAL_DURATION_DAYS;
  
  const now = new Date();
  const endDate = new Date(subscription.trialEndDate || subscription.nextPaymentDate);
  const diff = endDate - now;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function isTrialExpired() {
  const user = getForgeflowUser() || {};
  if (['STARTER', 'PRO', 'PROFESSIONAL', 'ENTERPRISE'].includes(user.planLabel)) return false;
  const subscription = getSubscription();
  if (!subscription) return false;
  const endDate = new Date(subscription.trialEndDate || subscription.nextPaymentDate);
  return new Date() >= endDate;
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
    billingDetails.style.display = 'none';
    billingTrialInfo.style.display = 'block';
    if (isTrialExpired()) {
      statusText.textContent = 'Trial Expired';
      trialDaysLeft.textContent = 'Expired';
    } else {
      statusText.textContent = 'Free Trial';
      trialDaysLeft.textContent = 'Day ' + getTrialDaysRemaining() + ' left';
    }
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

  // Refresh integration settings when the integrations tab is shown
  if (tabName === 'integrations') {
    loadIntegrationSettings();
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
  void persistSettingsToBackend();
}

function saveSettings(section) {
  void persistSettingsToBackend();
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
    initLiveClock();
    showToast('General settings saved successfully!', 'success');
    addNotification('settings', 'General Settings Saved', 'Your profile and general preferences were saved.', 'settings');
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
    addNotification('settings', 'Company Settings Saved', 'Your company details were saved.', 'settings');
    return;
  }
  
  if (section === 'Security') {
    const settings = {
      twoFactorEnabled: document.getElementById('toggle2FA')?.checked || false
    };
    localStorage.setItem('forgeflow_security', JSON.stringify(settings));
    showToast('Security settings saved successfully!', 'success');
    addNotification('settings', 'Security Settings Saved', 'Your security preferences were saved.', 'settings');
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
    addNotification('settings', 'Notification Settings Saved', 'Your notification preferences were saved.', 'settings');
    return;
  }
  
  if (section === 'Integrations') {
    const settings = {
      autoSync: document.getElementById('integrationsAutoSync')?.classList.contains('active') || false,
      syncInterval: document.getElementById('integrationsSyncInterval')?.value || 'manual',
      notifyOnFailure: document.getElementById('integrationsNotifyOnFailure')?.classList.contains('active') ?? true,
    };
    localStorage.setItem('forgeflow_integrations_settings', JSON.stringify(settings));
    void persistSettingsToBackend();
    showToast('Integration settings saved successfully!', 'success');
    addNotification('settings', 'Integration Settings Saved', 'Your integration preferences were saved.', 'settings');
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
    addNotification('settings', 'Appearance Settings Saved', 'Your theme and layout preferences were saved.', 'settings');
    return;
  }
  showToast(`${section} settings saved successfully!`, 'success');
  addNotification('settings', section + ' Settings Saved', 'Your ' + section + ' settings were saved.', 'settings');
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
  if (!confirm('Are you sure you want to clear all manufacturing data? This will remove every record across all modules and reset the dashboard. Your account, plan and settings will be kept.')) {
    return;
  }
  
  showToast('Clearing all data...', 'warn');
  
  setTimeout(async () => {
    const keysToKeep = [
      'forgeflow_subscription', 'forgeflow_user',
      'forgeflow_roles', 'forgeflow_invited_users',
      'forgeflow_appearance', 'forgeflow_general', 'forgeflow_company',
      'forgeflow_security', 'forgeflow_integrations_settings',
      'forgeflow_integration_states', 'forgeflow_notifications',
      'forgeflow_payment_method'
    ];
    
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('forgeflow_') && !keysToKeep.includes(key)) {
        localStorage.removeItem(key);
      }
    });
    
    localStorage.setItem('forgeflow_data_cleared', 'true');
    
    try {
      const companyId = await ensureCompanyContext();
      if (companyId) {
        await supabase
          .from('module_records')
          .delete()
          .eq('company_id', companyId)
          .neq('module_key', 'settings')
          .neq('module_key', 'teams');
      }
    } catch (e) {
      console.warn('Backend clear failed:', e);
    }

    void persistSettingsToBackend();

    showToast('All data has been cleared successfully', 'success');
    await clearNotificationsFromServer();
    addNotification('trash', 'All Data Cleared', 'Every record across all modules was cleared.', 'trash');
    
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
  const allTables = document.querySelectorAll('.module-view.active table.data-table, .module-view:not(.active) table.data-table');
  if (!allTables.length) {
    showToast('No table data found to export', 'info');
    return;
  }

  let csv = '';
  allTables.forEach(table => {
    const moduleView = table.closest('.module-view');
    const moduleId = moduleView ? moduleView.id.replace('mod-', '') : 'data';
    const headers = [];
    table.querySelectorAll('thead th').forEach(th => {
      if (th.textContent.trim() !== 'Actions') headers.push(th.textContent.trim());
    });
    if (!headers.length) return;

    csv += '--- ' + moduleId.toUpperCase() + ' ---\n';
    csv += headers.join(',') + '\n';

    table.querySelectorAll('tbody tr').forEach(row => {
      if (row.classList.contains('empty-row') || row.style.display === 'none') return;
      const cells = [];
      row.querySelectorAll('td').forEach((td, i) => {
        if (i === headers.length) return; // skip actions col
        let val = td.textContent.trim().replace(/"/g, '""');
        cells.push('"' + val + '"');
      });
      csv += cells.join(',') + '\n';
    });
    csv += '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'forgeflow-all-data-' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('All data exported as CSV!', 'success');
  addNotification('export', 'Data Exported', 'All data was exported as a CSV file.', 'export');
}

function exportCurrentModule() {
  const moduleView = document.querySelector('.module-view.active');
  if (!moduleView) {
    showToast('No active module to export', 'info');
    return;
  }

  const table = moduleView.querySelector('table.data-table');
  if (!table) {
    showToast('No table found in this module', 'info');
    return;
  }

  const moduleName = document.getElementById('topbarBreadcrumb')?.textContent || 'module';
  const headers = [];
  table.querySelectorAll('thead th').forEach(th => {
    if (th.textContent.trim() !== 'Actions') headers.push(th.textContent.trim());
  });

  if (!headers.length) {
    showToast('No data to export', 'info');
    return;
  }

  let csv = headers.join(',') + '\n';

  table.querySelectorAll('tbody tr').forEach(row => {
    if (row.classList.contains('empty-row') || row.style.display === 'none') return;
    const cells = [];
    row.querySelectorAll('td').forEach((td, i) => {
      if (i === headers.length) return;
      let val = td.textContent.trim().replace(/"/g, '""');
      cells.push('"' + val + '"');
    });
    csv += cells.join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = moduleName.toLowerCase().replace(/\s+/g, '-') + '-' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast(moduleName + ' exported as CSV!', 'success');
  addNotification('export', 'Module Exported', moduleName + ' was exported as a CSV file.', 'export', moduleView.id.replace('mod-', ''));
}

function clearModuleData(moduleName) {
  if (!confirm('Are you sure you want to clear all ' + moduleName + ' data?')) {
    return;
  }
  
  const storageKey = 'forgeflow_' + moduleName.toLowerCase().replace(/\s+/g, '_') + 's';
  localStorage.removeItem(storageKey);
  
  showToast(moduleName + ' data cleared!', 'success');
  addNotification('trash', 'Module Data Cleared', moduleName + ' data was cleared.', 'trash');
  
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
  addNotification('system', 'Password Updated', 'Your account password was changed successfully.', 'user');
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
    addNotification('system', 'API Key Regenerated', 'A new API key was generated and your old key was invalidated.', 'settings');
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
    addNotification('settings', 'Payment Method Added', 'A ' + cardBrand + ' card ending in ' + last4 + ' was added to your account.', 'settings');
    
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Add Payment Method';
  }, 1500);
}

function removePaymentMethod() {
  if (!confirm('Are you sure you want to remove this payment method?')) return;
  
  removePaymentMethodData();
  updatePaymentMethodDisplay();
  showToast('Payment method removed', 'success');
  addNotification('settings', 'Payment Method Removed', 'Your saved payment method was removed.', 'settings');
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

async function syncTeamMemberToBackend(user) {
  const companyId = await ensureCompanyContext();
  if (!companyId || !user?.email) return;
  try {
    const { error } = await supabase
      .from('team_members')
      .upsert({
        company_id: companyId,
        email: user.email,
        name: user.name || '',
        role_id: user.roleId || null,
        role_name: user.roleName || 'Team Member',
        status: user.status || 'Active'
      }, { onConflict: 'company_id,email' });
    if (error) {
      console.warn('team_members sync failed (table may not be applied yet):', error.message);
    }
  } catch (e) {
    console.warn('team_members sync unavailable:', e);
  }
}

async function syncAllTeamMembersToBackend() {
  const users = getInvitedUsers();
  for (const user of users) {
    await syncTeamMemberToBackend(user);
  }
}

async function deleteTeamMemberFromBackend(email) {
  const companyId = await ensureCompanyContext();
  if (!companyId || !email) return;
  try {
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('company_id', companyId)
      .eq('email', email);
    if (error) console.warn('team_members delete failed:', error.message);
  } catch (e) {
    console.warn('team_members delete unavailable:', e);
  }
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
    addNotification('role', 'Role Updated', 'Role "' + name + '" was updated.', 'role', 'teams');
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
    addNotification('role', 'Role Created', 'Role "' + name + '" was created.', 'role', 'teams');
  }
  
  saveRoles(roles);
  renderRoles();
  renderTeamMembers();
  closeRoleModal();
  void persistSettingsToBackend();
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
  
  const currentUser = getForgeflowUser() || {};
  const newUser = {
    id: 'user_' + Date.now(),
    name: name,
    email: email,
    roleId: roleId,
    roleName: role.name,
    status: 'Active',
    invitedAt: new Date().toISOString(),
    lastActive: null,
    adminEmail: currentUser.email || ''
  };
  
  users.push(newUser);
  saveInvitedUsers(users);
  
  closeInviteModal();
  renderTeamMembers();
  void syncTeamMemberToBackend(newUser);
  void persistSettingsToBackend();
  showToast(name + ' added to your team. They can sign in with ' + email + ' using your password.', 'success');
  addNotification('role', 'Team Member Added', name + ' (' + email + ') was added to your team.', 'role', 'teams');
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
  void syncTeamMemberToBackend(user);
  void persistSettingsToBackend();
  showToast('User role updated', 'success');
  addNotification('role', 'User Role Updated', user.name + "'s role was changed to " + role.name + '.', 'role', 'teams');
}

function removeUser(userId) {
  if (!confirm('Are you sure you want to remove this user?')) return;
  
  const users = getInvitedUsers();
  const userIndex = users.findIndex(u => u.id === userId);
  if (userIndex === -1) return;
  
  const removed = users[userIndex];
  users.splice(userIndex, 1);
  saveInvitedUsers(users);
  renderRoles();
  renderTeamMembers();
  void deleteTeamMemberFromBackend(removed.email);
  void persistSettingsToBackend();
  showToast('User removed successfully', 'success');
  addNotification('role', 'User Removed', removed.name + ' (' + removed.email + ') was removed from the team.', 'trash', 'teams');
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
  
  const deletedRole = roles[roleIndex];
  roles.splice(roleIndex, 1);
  saveRoles(roles);
  renderRoles();
  void persistSettingsToBackend();
  showToast('Role deleted successfully', 'success');
  addNotification('role', 'Role Deleted', 'Role "' + deletedRole.name + '" was deleted.', 'trash', 'teams');
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
    dropdown.classList.remove('active');
  }
}

function toggleUserDropdown(e) {
  e.stopPropagation();
  const dropdown = document.querySelector('.user-dropdown');
  if (dropdown) {
    dropdown.classList.toggle('active');
  }
}

function initUserDropdown() {
  const avatar = document.querySelector('.user-avatar-top');
  if (!avatar || avatar.dataset.dropdownBound) return;
  avatar.dataset.dropdownBound = 'true';

  avatar.addEventListener('click', toggleUserDropdown);

  document.addEventListener('click', function(e) {
    const dropdown = document.querySelector('.user-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });
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

// ============ TABLE SEARCH ============
function initTableSearch() {
  document.querySelectorAll('.table-search input').forEach(input => {
    if (input.dataset.searchBound) return;
    input.dataset.searchBound = 'true';

    input.addEventListener('input', function () {
      const query = this.value.trim().toLowerCase();
      const tableSearch = this.closest('.table-search');
      if (!tableSearch) return;
      const tableCard = tableSearch.closest('.table-card');
      if (!tableCard) return;
      const tbody = tableCard.querySelector('table tbody');
      if (!tbody) return;
      const rows = tbody.querySelectorAll('tr');
      let visibleCount = 0;

      rows.forEach(row => {
        if (row.classList.contains('empty-row')) return;
        const text = row.textContent.toLowerCase();
        const match = !query || text.includes(query);
        row.style.display = match ? '' : 'none';
        if (match) visibleCount++;
      });

      let noResults = tableCard.querySelector('.table-search-no-results');
      if (visibleCount === 0 && rows.length > 0 && query) {
        if (!noResults) {
          noResults = document.createElement('div');
          noResults.className = 'table-search-no-results';
          noResults.style.cssText = 'text-align:center;padding:32px;color:var(--gray-400);font-size:14px;';
          tableCard.appendChild(noResults);
        }
        noResults.textContent = 'No results found for "' + this.value.trim() + '"';
        noResults.style.display = '';
      } else if (noResults) {
        noResults.style.display = 'none';
      }
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        this.value = '';
        this.dispatchEvent(new Event('input'));
        this.blur();
      }
    });
  });
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

    const dataCleared = localStorage.getItem('forgeflow_data_cleared') === 'true';
    
    lineChart = new Chart(lCtx, {
      type: 'line',
      data: {
        labels: ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'],
        datasets: [
          {
            label: 'Sales ($k)',
            data: dataCleared ? [] : [42, 48, 51, 58, 63, 55, 69, 72, 78, 75, 82, 84],
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
            data: dataCleared ? [] : [180, 210, 195, 240, 260, 228, 290, 310, 330, 305, 350, 360],
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
          data: dataCleared ? [] : [35, 22, 18, 12, 13],
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
window.changeStatus = changeStatus;
window.onDashboardRangeChange = onDashboardRangeChange;
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
window.toggleUserDropdown = toggleUserDropdown;
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
window.disconnectIntegration = disconnectIntegration;
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
window.toggleUserDropdown = toggleUserDropdown;
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
window.closeIntegrationModal = closeIntegrationModal;
window.openIntegrationModal = openIntegrationModal;
window.saveProviderSettings = saveProviderSettings;
window.testProviderConnection = testProviderConnection;
window.runIntegrationSync = runIntegrationSync;
window.disconnectIntegrationFromModal = disconnectIntegrationFromModal;
window.saveRecord = saveRecord;
window.importData = importData;
window.loadWebhookConfig = loadWebhookConfig;
window.saveWebhookConfig = saveWebhookConfig;
window.testWebhook = testWebhook;
window.deleteWebhook = deleteWebhook;

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
    if (!sessionStorage.getItem('forgeflow_login_notified')) {
      sessionStorage.setItem('forgeflow_login_notified', '1');
      const loggedInUser = getForgeflowUser() || {};
      addNotification('system', 'Welcome back, ' + (loggedInUser.firstName || loggedInUser.fullName || 'there') + '!', 'You signed in to ForgeFlow successfully.', 'user');
    }
    await hydrateModuleRecords();
    applyClearedDataState();
    await hydrateSettingsFromBackend();

    initSubscription();
    checkAndProcessRenewal();
    initTrialCountdown();
    initSubscriptionRealtime();
    evaluateTrialStatus();
    initLiveClock();
    initPlanAccessControl();
    initDashboardRange();
    loadAppearanceSettings();
    await loadAllSettings();
    loadNotificationSettings();
    renderRoles();
    renderTeamMembers();
    applyUserRolePermissions();
    void syncAllTeamMembersToBackend();

    initFilters();
    initCharts();
    void renderDashboard('this-month');
    initDashboardAutoRefresh();
    initPaneDraftBinding();
    initTableWrappers();
    initTableSearch();
    initStatusDropdowns();
    initNotifications();
    bindRecordActionButtons();
    bindStorageSyncListener();
    restoreAllIntegrationStates();
    void refreshIntegrationStatuses();
    handleIntegrationOAuthCallback();
    void loadWebhookConfig();
    initGlobalSearch();
    initUserDropdown();

    setTimeout(() => {
      initFilters();
      initTableSearch();
      lineChart?.resize();
      pieChart?.resize();
    }, 300);

    void persistSettingsToBackend();

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

// ============ GLOBAL SEARCH ============
function getSearchHistory() {
  try {
    const saved = localStorage.getItem('forgeflow_search_history');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveSearchHistory(history) {
  localStorage.setItem('forgeflow_search_history', JSON.stringify(history));
}

function addSearchToHistory(query) {
  if (!query || query.trim().length < 2) return;
  const history = getSearchHistory().filter(h => h.query !== query.trim());
  history.unshift({ query: query.trim(), timestamp: new Date().toISOString() });
  if (history.length > 10) history.pop();
  saveSearchHistory(history);
}

function searchAllModules(query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.toLowerCase().trim();
  const results = [];
  const overrides = getRecordOverrides();
  const searchSources = {
    mfg: { data: { ...(mockData.mfg || {}), ...((overrides.mfg) || {}) }, label: 'Manufacturing', icon: 'factory', module: 'manufacturing' },
    inventory: { data: { ...(mockData.inventory || {}), ...((overrides.inventory) || {}) }, label: 'Inventory', icon: 'box', module: 'inventory' },
    sales: { data: { ...(mockData.sales || {}), ...((overrides.sales) || {}) }, label: 'Sales Orders', icon: 'file', module: 'sales' },
    pr: { data: { ...(mockData.pr || {}), ...((overrides.pr) || {}) }, label: 'Purchase Requests', icon: 'cart', module: 'purchase' },
    bom: { data: { ...(mockData.bom || {}), ...((overrides.bom) || {}) }, label: 'BOM', icon: 'list', module: 'bom' },
    suppliers: { data: { ...(mockData.suppliers || {}), ...((overrides.suppliers) || {}) }, label: 'Suppliers', icon: 'truck', module: 'suppliers' },
    staff: { data: { ...(mockData.staff || {}), ...((overrides.staff) || {}) }, label: 'Staff', icon: 'users', module: 'staff' },
    maintenance: { data: { ...(mockData.maintenance || {}), ...((overrides.maintenance) || {}) }, label: 'Maintenance', icon: 'wrench', module: 'maintenance' },
    operations: { data: { ...(mockData.operations || {}), ...((overrides.operations) || {}) }, label: 'Operations', icon: 'clipboard', module: 'workops' },
    uom: { data: { ...(mockData.uom || {}), ...((overrides.uom) || {}) }, label: 'UOM', icon: 'ruler', module: 'uom' }
  };

  Object.entries(searchSources).forEach(([dataKey, source]) => {
    Object.entries(source.data).forEach(([id, record]) => {
      const searchableText = Object.values(record).filter(v => typeof v === 'string').join(' ').toLowerCase();
      if (searchableText.includes(q) || id.toLowerCase().includes(q)) {
        const displayField = record.product || record.desc || record.material || record.company || record.name || record.machine || record.code || id;
        results.push({
          id: id,
          title: displayField,
          subtitle: source.label,
          module: source.module,
          dataKey: dataKey,
          icon: source.icon
        });
      }
    });
  });

  return results.slice(0, 12);
}

function renderSearchResults(results, history) {
  let container = document.getElementById('searchResultsDropdown');
  if (!container) {
    container = document.createElement('div');
    container.id = 'searchResultsDropdown';
    container.className = 'search-results-dropdown';
    const searchInput = document.getElementById('topbarSearchInput');
    if (searchInput && searchInput.parentElement) {
      searchInput.parentElement.style.position = 'relative';
      searchInput.parentElement.appendChild(container);
    }
  }

  let html = '';
  if (results && results.length > 0) {
    html += '<div class="search-results-section"><div class="search-results-label">Results</div>';
    results.forEach(r => {
      html += `<div class="search-result-item" data-module="${r.module}" data-id="${r.id}">
        <div class="search-result-icon">${r.icon}</div>
        <div class="search-result-info">
          <div class="search-result-title">${r.id} - ${r.title}</div>
          <div class="search-result-subtitle">${r.subtitle}</div>
        </div>
      </div>`;
    });
    html += '</div>';
  } else if (history && history.length > 0) {
    html += '<div class="search-results-section"><div class="search-results-label">Recent Searches</div>';
    history.slice(0, 5).forEach(h => {
      html += `<div class="search-result-item search-history-item" data-query="${h.query}">
        <div class="search-result-icon">clock</div>
        <div class="search-result-info">
          <div class="search-result-title">${h.query}</div>
          <div class="search-result-subtitle">Recent search</div>
        </div>
      </div>`;
    });
    html += '</div>';
  }

  container.innerHTML = html;
  container.classList.toggle('open', html.length > 0);

  container.querySelectorAll('.search-result-item:not(.search-history-item)').forEach(item => {
    item.addEventListener('click', () => {
      const module = item.dataset.module;
      container.classList.remove('open');
      const searchInput = document.getElementById('topbarSearchInput');
      if (searchInput) searchInput.value = '';
      showModule(module);
    });
  });

  container.querySelectorAll('.search-history-item').forEach(item => {
    item.addEventListener('click', () => {
      const searchInput = document.getElementById('topbarSearchInput');
      if (searchInput) {
        searchInput.value = item.dataset.query;
        searchInput.dispatchEvent(new Event('input'));
      }
    });
  });
}

function initGlobalSearch() {
  const searchInput = document.getElementById('topbarSearchInput');
  if (!searchInput || searchInput.dataset.searchBound) return;
  searchInput.dataset.searchBound = 'true';

  // Clear any value injected by browser autofill (e.g. the logged-in email)
  // so the topbar search never displays the user's email on app load.
  searchInput.value = '';
  searchInput.setAttribute('autocomplete', 'off');
  searchInput.setAttribute('autocorrect', 'off');
  searchInput.setAttribute('spellcheck', 'false');
  // Chrome ignores `autocomplete="off"` for credential autofill on the first
  // text input. Keeping the field readonly until focus prevents autofill from
  // ever injecting the saved email into the search box.
  searchInput.setAttribute('readonly', '');
  searchInput.addEventListener('focus', function() {
    this.removeAttribute('readonly');
  });
  searchInput.addEventListener('blur', function() {
    if (!this.value) this.setAttribute('readonly', '');
  });

  let debounceTimer = null;
  const history = getSearchHistory();

  searchInput.addEventListener('input', function() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const query = this.value.trim();
      if (query.length >= 2) {
        const results = searchAllModules(query);
        renderSearchResults(results, history);
      } else {
        const container = document.getElementById('searchResultsDropdown');
        if (container) container.classList.remove('open');
      }
    }, 200);
  });

  searchInput.addEventListener('focus', function() {
    const query = this.value.trim();
    if (query.length >= 2) {
      const results = searchAllModules(query);
      renderSearchResults(results, history);
    } else if (getSearchHistory().length > 0) {
      renderSearchResults([], getSearchHistory());
    }
  });

  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && this.value.trim().length >= 2) {
      addSearchToHistory(this.value.trim());
    }
    if (e.key === 'Escape') {
      const container = document.getElementById('searchResultsDropdown');
      if (container) container.classList.remove('open');
      this.blur();
    }
  });

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.topbar-search') && !e.target.closest('#searchResultsDropdown')) {
      const container = document.getElementById('searchResultsDropdown');
      if (container) container.classList.remove('open');
    }
  });
}

console.log('App.js fully loaded - end of file reached');

