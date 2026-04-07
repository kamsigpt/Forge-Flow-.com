# ForgeFlow Testing Guide

A comprehensive testing checklist for the ForgeFlow manufacturing operations platform.

---

## Table of Contents

1. [Authentication & Authorization](#1-authentication--authorization)
2. [Dashboard](#2-dashboard)
3. [Manufacturing Orders](#3-manufacturing-orders)
4. [Inventory Management](#4-inventory-management)
5. [Sales Orders](#5-sales-orders)
6. [Purchase Orders](#6-purchase-orders)
7. [Products & BOM](#7-products--bom)
8. [Warehouse Management](#8-warehouse-management)
9. [Quality Control](#9-quality-control)
10. [Machine & Maintenance](#10-machine--maintenance)
11. [Integrations](#11-integrations)
12. [Settings](#12-settings)
13. [UI/UX & Accessibility](#13-uiuaccessibility)
14. [Performance](#14-performance)
15. [Data Integrity](#15-data-integrity)

---

## 1. Authentication & Authorization

### Login Flow
- [ ] Email/password login with valid credentials
- [ ] Email/password login with invalid credentials
- [ ] "Remember me" checkbox persists session
- [ ] Password visibility toggle works
- [ ] Forgot password flow initiates recovery
- [ ] Session expires after timeout

### Sign Up Flow
- [ ] New user registration with email validation
- [ ] Password strength requirements enforced
- [ ] Email confirmation required
- [ ] Duplicate email detection
- [ ] Terms acceptance checkbox required

### Authorization
- [ ] Unauthenticated users redirected to login
- [ ] Role-based access (admin, manager, operator, viewer)
- [ ] Unauthorized route access denied
- [ ] Session tokens expire correctly

---

## 2. Dashboard

### KPI Cards
- [ ] Active Manufacturing Orders count displays
- [ ] Pending Shipments count displays
- [ ] Low Stock Items count displays
- [ ] In Progress count displays
- [ ] Cards update in real-time when data changes
- [ ] Click on card navigates to relevant module

### Charts & Graphs
- [ ] Production Output chart renders
- [ ] Chart shows last 7 days of data
- [ ] Hover on data points shows tooltip
- [ ] Chart legend is interactive
- [ ] Chart handles empty data gracefully

### Recent Activity Feed
- [ ] Shows last 5-10 activities
- [ ] Activities sorted by timestamp (newest first)
- [ ] Activity icons match action type
- [ ] Timestamps show relative time ("2 hours ago")
- [ ] "View All" link works

### Quick Actions
- [ ] "New Order" button opens order form
- [ ] "Quick Scan" button opens scanner
- [ ] Quick action shortcuts work

---

## 3. Manufacturing Orders

### Order List View
- [ ] Table displays all manufacturing orders
- [ ] Columns: MO#, Product, Quantity, Status, Priority, Dates
- [ ] Sorting works on all columns
- [ ] Filtering by status works
- [ ] Search by MO number or product name works
- [ ] Pagination or infinite scroll works
- [ ] Bulk selection with checkboxes
- [ ] "Select All" selects visible items

### Order Creation
- [ ] "New Order" button opens creation form
- [ ] Required fields: Product, Quantity, Priority
- [ ] BOM selection dropdown populated
- [ ] Date picker for planned start/end
- [ ] Notes field accepts text
- [ ] Submit creates order and shows success toast
- [ ] Cancel returns without creating

### Order Status Transitions
- [ ] Pending → Released (admin only)
- [ ] Released → In Progress
- [ ] In Progress → On Hold
- [ ] In Progress → Quality Check
- [ ] Quality Check → Completed
- [ ] Any → Cancelled (admin only)
- [ ] Invalid transitions are blocked

### Order Operations
- [ ] Start operation marks as in-progress
- [ ] Complete operation with actual time
- [ ] Pause operation saves progress
- [ ] Resume paused operation
- [ ] Skip operation moves to next
- [ ] Add notes to operation

### Material Consumption
- [ ] View required materials for order
- [ ] Record material usage with quantity
- [ ] Track wastage quantities
- [ ] Update bin location selection
- [ ] Partial consumption allowed
- [ ] Over-consumption warning

### Finished Goods Receipt
- [ ] Record quantity produced
- [ ] Record rejected quantity
- [ ] Select destination warehouse
- [ ] Quality inspection status
- [ ] Notes field

---

## 4. Inventory Management

### Inventory Overview
- [ ] List view of all inventory items
- [ ] Columns: SKU, Name, Warehouse, Bin, Quantity, Reserved, Available
- [ ] Stock status indicators (OK, Low, Critical)
- [ ] Filter by warehouse
- [ ] Filter by stock status
- [ ] Search by SKU or product name

### Stock Transactions
- [ ] Record stock received (from PO)
- [ ] Record stock adjustment (manual)
- [ ] Record stock transferred (between warehouses)
- [ ] Record stock reserved (for orders)
- [ ] Record stock consumed (for manufacturing)
- [ ] Transaction creates audit log entry

### Reorder Points
- [ ] Minimum stock level per product
- [ ] Reorder quantity suggestion
- [ ] Auto-generate purchase request when low
- [ ] Low stock alerts trigger notifications

### Lot & Serial Tracking
- [ ] Lot number assignment
- [ ] Expiry date tracking
- [ ] FIFO/FEFO picking suggestion
- [ ] Lot traceability to source

### Cycle Counts
- [ ] Create cycle count task
- [ ] Assign to warehouse/area
- [ ] Record counted quantities
- [ ] Submit count with variances
- [ ] Approval workflow for adjustments

---

## 5. Sales Orders

### Order List
- [ ] Table displays all sales orders
- [ ] Columns: SO#, Customer, Date, Status, Total
- [ ] Filter by status
- [ ] Filter by customer
- [ ] Date range filter
- [ ] Search functionality

### Order Creation
- [ ] Customer selection (existing or new)
- [ ] Add line items (products)
- [ ] Quantity and unit price per line
- [ ] Tax calculation
- [ ] Discount application
- [ ] Order total calculation
- [ ] Shipping address entry
- [ ] Notes/special instructions

### Order Fulfillment
- [ ] Pick list generation
- [ ] Inventory allocation/reservation
- [ ] Pack items
- [ ] Shipment tracking entry
- [ ] Partial shipment support
- [ ] Invoice generation link

### Status Management
- [ ] Draft → Confirmed
- [ ] Confirmed → In Production
- [ ] In Production → Ready to Ship
- [ ] Ready to Ship → Shipped
- [ ] Shipped → Delivered
- [ ] On Hold functionality
- [ ] Cancellation with restocking

---

## 6. Purchase Orders

### PO List
- [ ] Display all purchase orders
- [ ] Columns: PO#, Supplier, Date, Status, Total
- [ ] Filter by supplier
- [ ] Filter by status
- [ ] Date range filter

### PO Creation
- [ ] Supplier selection
- [ ] Add line items (products, quantities)
- [ ] Unit cost entry
- [ ] Expected delivery date
- [ ] Shipping terms
- [ ] Payment terms
- [ ] Auto-calculate totals

### Receiving
- [ ] Record partial deliveries
- [ ] Record full delivery
- [ ] Quantity variance handling
- [ ] Quality inspection before accepting
- [ ] Update inventory on receipt
- [ ] Generate receipt document

### Supplier Management
- [ ] View supplier details
- [ ] Contact information
- [ ] Payment terms
- [ ] Lead time information
- [ ] Performance rating
- [ ] Purchase history

---

## 7. Products & BOM

### Product Catalog
- [ ] List all products
- [ ] Columns: SKU, Name, Type, Unit Price, Stock
- [ ] Filter by type (raw material, component, finished good)
- [ ] Filter by category
- [ ] Search functionality
- [ ] Product image display

### Product Details
- [ ] View full product information
- [ ] Edit product details
- [ ] Upload product image
- [ ] Set pricing (cost and price)
- [ ] Define units of measure
- [ ] Set minimum stock level
- [ ] Product variants management

### Bill of Materials
- [ ] View BOM for product
- [ ] BOM version tracking
- [ ] Add/remove components
- [ ] Set component quantities
- [ ] Set wastage percentage
- [ ] BOM approval workflow
- [ ] BOM activation/deactivation

### Product Costing
- [ ] Calculate material cost from BOM
- [ ] Include labor cost
- [ ] Include overhead
- [ ] Markup percentage
- [ ] Cost rollup to finished goods

---

## 8. Warehouse Management

### Warehouse Configuration
- [ ] View all warehouses
- [ ] Add new warehouse
- [ ] Edit warehouse details
- [ ] Set as default warehouse
- [ ] Warehouse capacity limits

### Bin Locations
- [ ] View bin locations within warehouse
- [ ] Create bin locations
- [ ] Bin naming conventions
- [ ] Bin types (storage, picking, staging)
- [ ] Capacity per bin

### Transfers
- [ ] Create transfer order
- [ ] Select source/destination warehouses
- [ ] Select bins
- [ ] Pick items
- [ ] Confirm transfer
- [ ] Transfer history

### Putaway Rules
- [ ] Define storage rules
- [ ] ABC classification
- [ ] Size-based storage
- [ ] Compatibility rules

---

## 9. Quality Control

### QC Checks
- [ ] Create QC inspection
- [ ] Link to manufacturing order
- [ ] Define inspection criteria
- [ ] Record measurements
- [ ] Pass/fail determination
- [ ] Attach photos/documents

### Sampling
- [ ] AQL-based sampling
- [ ] Random sampling selection
- [ ] Sample tracking

### Non-Conformance
- [ ] Log non-conformance
- [ ] Root cause analysis
- [ ] Corrective action plan
- [ ] CAPA tracking
- [ ] Closure workflow

---

## 10. Machine & Maintenance

### Machine Registry
- [ ] List all machines/equipment
- [ ] Machine details (name, type, location)
- [ ] Status tracking (operational, maintenance, repair, offline)
- [ ] Hourly rate for costing

### Maintenance Requests
- [ ] Create maintenance request
- [ ] Assign to technician
- [ ] Schedule maintenance date
- [ ] Priority levels
- [ ] Description and notes
- [ ] Attach documents/photos

### Preventive Maintenance
- [ ] Define maintenance schedules
- [ ] Meter-based triggers
- [ ] Time-based triggers
- [ ] Auto-generate requests
- [ ] Parts requirements

### Work Orders
- [ ] Create work order from request
- [ ] Track labor hours
- [ ] Record parts used
- [ ] Completion sign-off
- [ ] Cost tracking

---

## 11. Integrations

### Integration Hub
- [ ] View all available integrations
- [ ] Connection status indicators
- [ ] Configure individual integrations

### OAuth Connections
- [ ] Connect to Shopify
- [ ] Connect to Google Sheets
- [ ] Connect to Zoho
- [ ] Connect to QuickBooks
- [ ] Connect to Xero
- [ ] Disconnect integration
- [ ] Token refresh handling

### Webhooks
- [ ] Configure webhook URL
- [ ] Set webhook secret
- [ ] Select events to trigger
- [ ] Test webhook delivery
- [ ] View webhook logs

### Sync Operations
- [ ] Manual sync trigger
- [ ] Auto-sync configuration
- [ ] Sync status display
- [ ] Error handling and retry

### Data Mapping
- [ ] Map product fields
- [ ] Map order fields
- [ ] Map inventory fields
- [ ] Custom field mapping

---

## 12. Settings

### General Settings
- [ ] Update user profile (name, email, phone)
- [ ] Change password
- [ ] Timezone selection
- [ ] Date format selection
- [ ] Currency selection
- [ ] Language selection

### Company Settings
- [ ] Company name and details
- [ ] Industry classification
- [ ] Company size
- [ ] Contact information

### Appearance Settings
- [ ] Theme selection (light/dark/system)
- [ ] Accent color selection
- [ ] Compact mode toggle
- [ ] Fixed sidebar toggle
- [ ] Icons-only mode toggle
- [ ] Settings persist on reload

### Notification Settings
- [ ] Order update notifications
- [ ] Inventory alert notifications
- [ ] Production update notifications
- [ ] Maintenance alert notifications
- [ ] Low stock threshold setting
- [ ] Push notification toggle
- [ ] Sound alerts toggle

### Security Settings
- [ ] Two-factor authentication setup
- [ ] Two-factor authentication disable
- [ ] Active sessions view
- [ ] Session revocation

### Data Management
- [ ] Export all data (JSON/CSV)
- [ ] Import data
- [ ] Clear all data (with confirmation)
- [ ] Delete account

### API Access
- [ ] Generate API key
- [ ] Copy API key
- [ ] Regenerate API key
- [ ] API key visibility toggle

---

## 13. UI/UX & Accessibility

### Responsive Design
- [ ] Desktop view (1920px+)
- [ ] Laptop view (1366px)
- [ ] Tablet view (768px)
- [ ] Mobile view (375px)
- [ ] Sidebar collapses on mobile
- [ ] Touch-friendly targets (44px min)

### Navigation
- [ ] All sidebar links work
- [ ] Breadcrumbs accurate
- [ ] Back button works
- [ ] Deep linking to specific records
- [ ] Keyboard navigation

### Forms
- [ ] All form validations work
- [ ] Error messages display
- [ ] Required field indicators
- [ ] Autocomplete on search fields
- [ ] Date picker functionality
- [ ] Dropdown search/filter

### Tables
- [ ] Column sorting
- [ ] Column resizing (if applicable)
- [ ] Row selection
- [ ] Inline actions
- [ ] Empty state displays
- [ ] Loading state displays

### Modals & Overlays
- [ ] Modal opens correctly
- [ ] Modal closes on X button
- [ ] Modal closes on backdrop click
- [ ] Modal closes on Escape key
- [ ] Focus trapped within modal

### Toasts & Notifications
- [ ] Success toasts display
- [ ] Error toasts display
- [ ] Warning toasts display
- [ ] Info toasts display
- [ ] Toasts auto-dismiss
- [ ] Toasts dismissable manually

### Accessibility
- [ ] ARIA labels present
- [ ] Keyboard navigation works
- [ ] Focus indicators visible
- [ ] Color contrast meets WCAG AA
- [ ] Screen reader compatible
- [ ] Alt text on images

---

## 14. Performance

### Page Load
- [ ] Initial page load < 3 seconds
- [ ] Subsequent navigations < 1 second
- [ ] Lazy loading for off-screen content

### Data Operations
- [ ] Search results < 500ms
- [ ] Filter application < 300ms
- [ ] Form submission < 2 seconds
- [ ] Data export < 10 seconds

### Real-time Updates
- [ ] Dashboard updates without refresh
- [ ] Notifications appear immediately
- [ ] Live counters update

### Resource Usage
- [ ] Memory usage stable over time
- [ ] No memory leaks on navigation
- [ ] API calls optimized (debounced)

---

## 15. Data Integrity

### Validation
- [ ] Required field validation
- [ ] Format validation (email, phone)
- [ ] Range validation (quantities, dates)
- [ ] Duplicate detection

### Calculations
- [ ] Order totals correct
- [ ] Inventory balances correct
- [ ] BOM cost rollup correct
- [ ] Tax calculations correct

### Audit Trail
- [ ] All create operations logged
- [ ] All update operations logged
- [ ] All delete operations logged
- [ ] User attribution correct
- [ ] Timestamp accuracy

### Data Relationships
- [ ] Foreign key integrity maintained
- [ ] Cascade deletes handled
- [ ] Orphaned records prevented

### Error Handling
- [ ] Network errors handled gracefully
- [ ] API errors show meaningful messages
- [ ] Retry mechanisms work
- [ ] Offline mode graceful degradation

---

## Testing Scenarios

### Happy Path Testing
Test complete workflows from start to finish:
1. Create product → Define BOM → Create MO → Start production → Complete → Ship
2. Create customer → Create SO → Allocate inventory → Pick → Pack → Ship → Invoice
3. Create supplier → Create PO → Receive goods → Inspect → Putaway → Update inventory

### Edge Cases
- Zero quantity transactions
- Negative adjustments (returns)
- Over-allocation of inventory
- Concurrent editing of same record
- Session timeout during form entry
- Network interruption mid-transaction
- Invalid date ranges
- Duplicate order numbers
- Maximum field length inputs
- Special characters in text fields
- SQL injection attempts
- XSS attempts in text fields

### Boundary Testing
- Minimum order quantity
- Maximum order quantity
- Inventory at zero
- Inventory at max capacity
- User session at timeout boundary
- Large data exports (1000+ records)

### Regression Testing
After any code change:
- All previously passing tests still pass
- No unintended side effects
- No breaking changes to existing features

---

## Browser Compatibility

Test on:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

---

## Test Data Management

### Test Environments
- Development
- Staging
- Production

### Test Accounts
- Admin account
- Manager account
- Operator account
- Viewer account

### Sample Data Sets
- 10 products with BOMs
- 5 suppliers
- 20 customers
- 50 inventory items
- 25 manufacturing orders (various statuses)
- 15 sales orders (various statuses)
- 10 purchase orders (various statuses)

---

## Reporting Issues

When reporting bugs, include:
1. **Step-by-step reproduction** instructions
2. **Expected behavior** description
3. **Actual behavior** description
4. **Screenshots/recordings** when applicable
5. **Browser and version** information
6. **User role** being tested
7. **Console errors** if any
8. **Network request/response** if relevant

---

*Last Updated: March 2026*
*Version: 1.0*
