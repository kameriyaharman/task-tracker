<?php
use App\Controllers as C;

/** @var App\Core\Router $r */

$r->get('/', [C\HealthController::class, 'index'], 'public');
$r->post('/client-log', [C\ClientLogController::class, 'store'], 'public');

// Auth
$r->post('/auth/request-otp', [C\AuthController::class, 'requestOtp'], 'public');
$r->post('/auth/verify-otp', [C\AuthController::class, 'verifyOtp'], 'public');
$r->post('/auth/admin-login', [C\AuthController::class, 'adminLogin'], 'public');
$r->get('/me', [C\MeController::class, 'show']);
$r->patch('/me', [C\MeController::class, 'update']);
$r->get('/home', [C\MeController::class, 'home']);

// Tasks
$r->get('/tasks', [C\TaskController::class, 'index']);
$r->post('/tasks', [C\TaskController::class, 'store']);
$r->post('/tasks/parse-voice', [C\TaskController::class, 'parseVoice']);
$r->get('/task-approvals', [C\TaskController::class, 'approvals']);
$r->post('/tasks/handover', [C\TaskController::class, 'handover']);
$r->get('/tasks/handovers', [C\TaskController::class, 'handovers']);
$r->post('/tasks/handovers/{id}/return', [C\TaskController::class, 'handBack']);
$r->post('/tasks/{id}/approve', [C\TaskController::class, 'approve']);
$r->post('/tasks/{id}/reject', [C\TaskController::class, 'reject']);
$r->get('/tasks/{id}', [C\TaskController::class, 'show']);
$r->patch('/tasks/{id}', [C\TaskController::class, 'update']);
$r->delete('/tasks/{id}', [C\TaskController::class, 'destroy']);
$r->post('/tasks/{id}/status', [C\TaskController::class, 'status']);
$r->post('/tasks/{id}/complete', [C\TaskController::class, 'complete']);
$r->post('/tasks/{id}/reopen', [C\TaskController::class, 'reopen']);
$r->post('/tasks/{id}/comments', [C\TaskController::class, 'comment']);
$r->post('/tasks/{id}/attachments', [C\TaskController::class, 'attach']);
$r->post('/tasks/{id}/checklist', [C\TaskController::class, 'addChecklist']);
$r->patch('/tasks/{id}/checklist/{itemId}', [C\TaskController::class, 'toggleChecklist']);
$r->get('/task-templates', [C\TaskTemplateController::class, 'index']);
$r->post('/task-templates', [C\TaskTemplateController::class, 'store'], 'manager');
$r->patch('/task-templates/{id}', [C\TaskTemplateController::class, 'update'], 'manager');
$r->delete('/task-templates/{id}', [C\TaskTemplateController::class, 'destroy'], 'manager');
$r->get('/task-defaults', [C\TaskTemplateController::class, 'defaults']);
$r->patch('/task-defaults', [C\TaskTemplateController::class, 'saveDefaults'], 'manager');

// Recurring
$r->get('/recurring', [C\RecurringController::class, 'index'], 'manager');
$r->post('/recurring', [C\RecurringController::class, 'store'], 'manager');
$r->post('/recurring/preview', [C\RecurringController::class, 'preview']);
$r->patch('/recurring/{id}', [C\RecurringController::class, 'update'], 'manager');
$r->delete('/recurring/{id}', [C\RecurringController::class, 'destroy'], 'manager');

// Attendance
$r->get('/attendance/today', [C\AttendanceController::class, 'today']);
$r->post('/attendance/punch-in', [C\AttendanceController::class, 'punchIn']);
$r->post('/attendance/punch-out', [C\AttendanceController::class, 'punchOut']);
$r->get('/attendance/me', [C\AttendanceController::class, 'mine']);
$r->get('/attendance/team-today', [C\AttendanceController::class, 'teamToday'], 'manager');
$r->get('/attendance/register', [C\AttendanceController::class, 'register'], 'manager');
$r->get('/attendance/export', [C\AttendanceController::class, 'export'], 'manager');
$r->get('/attendance/{id}/selfie', [C\SettingsController::class, 'selfie']);

// Location & geofences
$r->post('/location/ping', [C\LocationController::class, 'ping']);
$r->get('/location/live', [C\LocationController::class, 'live'], 'manager');
$r->get('/location/timeline/{userId}', [C\LocationController::class, 'timeline'], 'manager');
$r->get('/geofences', [C\LocationController::class, 'geofences']);
$r->post('/geofences', [C\LocationController::class, 'saveGeofence'], 'owner');
$r->patch('/geofences/{id}', [C\LocationController::class, 'saveGeofence'], 'owner');
$r->delete('/geofences/{id}', [C\LocationController::class, 'deleteGeofence'], 'owner');

// Leave & approvals
$r->get('/leave/balance', [C\RequestController::class, 'balance']);
$r->get('/leave/policy', [C\RequestController::class, 'policy']);
$r->post('/leave/policy', [C\RequestController::class, 'savePolicy'], 'owner');
$r->get('/requests', [C\RequestController::class, 'index']);
$r->post('/requests', [C\RequestController::class, 'store']);
$r->post('/requests/{id}/approve', [C\RequestController::class, 'approve'], 'manager');
$r->post('/requests/{id}/reject', [C\RequestController::class, 'reject'], 'manager');
$r->post('/requests/{id}/cancel', [C\RequestController::class, 'cancel']);

// Timesheet & calendar
$r->get('/timesheet', [C\TimesheetController::class, 'day']);
$r->post('/timesheet', [C\TimesheetController::class, 'store']);
$r->post('/timesheet/start', [C\TimesheetController::class, 'start']);
$r->post('/timesheet/stop', [C\TimesheetController::class, 'stop']);
$r->delete('/timesheet/{id}', [C\TimesheetController::class, 'destroy']);
$r->get('/timesheet/summary', [C\TimesheetController::class, 'summary'], 'manager');
$r->get('/calendar', [C\CalendarController::class, 'index']);
$r->post('/calendar', [C\CalendarController::class, 'store']);
$r->delete('/calendar/{id}', [C\CalendarController::class, 'destroy']);

// Chat & notifications
$r->get('/chat/rooms', [C\ChatController::class, 'rooms']);
$r->post('/chat/rooms', [C\ChatController::class, 'createRoom']);
$r->get('/chat/rooms/{id}/messages', [C\ChatController::class, 'messages']);
$r->post('/chat/rooms/{id}/messages', [C\ChatController::class, 'send']);
$r->get('/notifications', [C\NotificationController::class, 'index']);
$r->post('/notifications/read', [C\NotificationController::class, 'read']);
$r->post('/announcements', [C\NotificationController::class, 'announce'], 'manager');

// Goals, campaigns, performance, AI
$r->get('/goals', [C\GoalController::class, 'index']);
$r->post('/goals', [C\GoalController::class, 'store'], 'manager');
$r->patch('/goals/{id}', [C\GoalController::class, 'update'], 'manager');
$r->delete('/goals/{id}', [C\GoalController::class, 'destroy'], 'manager');
$r->get('/kb', [C\KnowledgeController::class, 'index']);
$r->post('/kb', [C\KnowledgeController::class, 'store']);
$r->patch('/kb/{id}', [C\KnowledgeController::class, 'update']);
$r->delete('/kb/{id}', [C\KnowledgeController::class, 'destroy']);
$r->post('/goals/{id}/progress', [C\GoalController::class, 'progress']);
$r->get('/campaigns', [C\CampaignController::class, 'index']);
$r->post('/campaigns', [C\CampaignController::class, 'store'], 'manager');
$r->patch('/campaigns/{id}', [C\CampaignController::class, 'update']);
$r->delete('/campaigns/{id}', [C\CampaignController::class, 'destroy'], 'manager');
$r->get('/performance', [C\PerformanceController::class, 'index'], 'manager');
$r->get('/performance/me', [C\PerformanceController::class, 'me']);
$r->post('/performance/star', [C\PerformanceController::class, 'announceStar'], 'manager');
$r->get('/ai/suggestions', [C\AiController::class, 'index'], 'manager');
$r->post('/ai/suggestions/{id}/add', [C\AiController::class, 'add'], 'manager');
$r->post('/ai/suggestions/{id}/skip', [C\AiController::class, 'skip'], 'manager');

// Admin
$r->get('/dashboard', [C\DashboardController::class, 'index'], 'manager');
$r->get('/reports/summary', [C\ReportController::class, 'summary'], 'manager');
$r->get('/reports/export', [C\ReportController::class, 'export'], 'manager');
$r->get('/employees', [C\EmployeeController::class, 'index']);
$r->post('/employees', [C\EmployeeController::class, 'store'], 'manager');
$r->patch('/employees/{id}', [C\EmployeeController::class, 'update'], 'manager');
$r->get('/departments', [C\EmployeeController::class, 'departments']);
$r->post('/departments', [C\EmployeeController::class, 'saveDepartment'], 'owner');
$r->patch('/departments/{id}', [C\EmployeeController::class, 'saveDepartment'], 'owner');
$r->delete('/departments/{id}', [C\EmployeeController::class, 'deleteDepartment'], 'owner');
$r->get('/settings', [C\SettingsController::class, 'show'], 'manager');
$r->patch('/settings', [C\SettingsController::class, 'update'], 'owner');
$r->get('/files/{id}', [C\SettingsController::class, 'file']);

// Webhooks
$r->get('/webhooks/whatsapp', [C\WebhookController::class, 'verify'], 'public');
$r->post('/webhooks/whatsapp', [C\WebhookController::class, 'receive'], 'public');

// ───────── ERP: hardware showroom ─────────
use App\Controllers\Erp as E;
$r->get('/erp/meta', [E\ReportController::class, 'meta']);
$r->get('/erp/dashboard', [E\ReportController::class, 'dashboard']);
$r->get('/erp/reports/{type}', [E\ReportController::class, 'report']);

$r->post('/erp/masters/products/import', [E\MasterController::class, 'importProducts']);
$r->get('/erp/masters/{entity}', [E\MasterController::class, 'index']);
$r->post('/erp/masters/{entity}', [E\MasterController::class, 'store']);
$r->get('/erp/masters/{entity}/{id}', [E\MasterController::class, 'show']);
$r->patch('/erp/masters/{entity}/{id}', [E\MasterController::class, 'update']);

$r->get('/erp/purchase-orders', [E\PurchaseController::class, 'index']);
$r->post('/erp/purchase-orders', [E\PurchaseController::class, 'store']);
$r->get('/erp/purchase-orders/{id}', [E\PurchaseController::class, 'show']);
$r->patch('/erp/purchase-orders/{id}', [E\PurchaseController::class, 'update']);
$r->post('/erp/purchase-orders/{id}/submit', [E\PurchaseController::class, 'submit']);
$r->post('/erp/purchase-orders/{id}/status', [E\PurchaseController::class, 'status']);
$r->get('/erp/grns', [E\PurchaseController::class, 'grnIndex']);
$r->post('/erp/grns', [E\PurchaseController::class, 'grnStore']);
$r->get('/erp/grns/{id}', [E\PurchaseController::class, 'grnShow']);

$r->get('/erp/stock', [E\InventoryController::class, 'index']);
$r->get('/erp/stock/ledger', [E\InventoryController::class, 'ledger']);
$r->post('/erp/stock/adjust', [E\InventoryController::class, 'adjust']);
$r->post('/erp/stock/transfer', [E\InventoryController::class, 'transfer']);

$r->get('/erp/price', [E\SalesController::class, 'price']);
$r->get('/erp/sales', [E\SalesController::class, 'index']);
$r->post('/erp/sales', [E\SalesController::class, 'store']);
$r->get('/erp/sales/{id}', [E\SalesController::class, 'show']);
$r->patch('/erp/sales/{id}', [E\SalesController::class, 'update']);
$r->post('/erp/sales/{id}/submit', [E\SalesController::class, 'submit']);
$r->post('/erp/sales/{id}/convert', [E\SalesController::class, 'convert']);
$r->post('/erp/sales/{id}/cancel', [E\SalesController::class, 'cancel']);

$r->get('/erp/deliveries', [E\DeliveryController::class, 'index']);
$r->post('/erp/deliveries', [E\DeliveryController::class, 'store']);
$r->get('/erp/deliveries/{id}', [E\DeliveryController::class, 'show']);
$r->patch('/erp/deliveries/{id}', [E\DeliveryController::class, 'update']);
$r->post('/erp/deliveries/{id}/status', [E\DeliveryController::class, 'status']);

$r->get('/erp/payments', [E\AccountsController::class, 'payments']);
$r->post('/erp/payments', [E\AccountsController::class, 'store']);
$r->get('/erp/books', [E\AccountsController::class, 'book']);
$r->get('/erp/outstanding', [E\AccountsController::class, 'outstanding']);
$r->get('/erp/statement', [E\AccountsController::class, 'statement']);

$r->get('/erp/recovery', [E\RecoveryController::class, 'index']);
$r->get('/erp/recovery/my', [E\RecoveryController::class, 'mine']);
$r->post('/erp/recovery', [E\RecoveryController::class, 'store']);

$r->get('/erp/returns', [E\ReturnController::class, 'index']);
$r->post('/erp/returns', [E\ReturnController::class, 'store']);
$r->get('/erp/returns/{id}', [E\ReturnController::class, 'show']);

$r->get('/erp/expenses', [E\ExpenseController::class, 'index']);
$r->post('/erp/expenses', [E\ExpenseController::class, 'store']);

$r->get('/erp/complaints', [E\ComplaintController::class, 'index']);
$r->get('/erp/complaints/analysis', [E\ComplaintController::class, 'analysis']);
$r->post('/erp/complaints', [E\ComplaintController::class, 'store']);
$r->patch('/erp/complaints/{id}', [E\ComplaintController::class, 'update']);
$r->post('/erp/complaints/{id}', [E\ComplaintController::class, 'update']);

$r->get('/erp/approvals', [E\ApprovalController::class, 'index']);
$r->post('/erp/approvals/{id}', [E\ApprovalController::class, 'act']);
$r->get('/erp/approval-rules', [E\ApprovalController::class, 'rules'], 'manager');
$r->post('/erp/approval-rules', [E\ApprovalController::class, 'saveRules'], 'owner');

$r->get('/erp/workflows', [E\WorkflowController::class, 'index'], 'manager');
$r->post('/erp/workflows', [E\WorkflowController::class, 'store'], 'owner');
$r->patch('/erp/workflows/{id}', [E\WorkflowController::class, 'update'], 'owner');
$r->delete('/erp/workflows/{id}', [E\WorkflowController::class, 'destroy'], 'owner');
$r->post('/erp/workflows/{id}/start', [E\WorkflowController::class, 'start'], 'manager');
$r->get('/erp/workflow-runs', [E\WorkflowController::class, 'runs'], 'manager');
$r->post('/erp/workflow-runs/{id}', [E\WorkflowController::class, 'runAction'], 'manager');

$r->get('/erp/roles', [E\RoleController::class, 'index']);
$r->post('/erp/roles', [E\RoleController::class, 'store'], 'owner');
$r->patch('/erp/roles/{id}', [E\RoleController::class, 'update'], 'owner');
$r->delete('/erp/roles/{id}', [E\RoleController::class, 'destroy'], 'owner');
$r->post('/erp/roles/assign', [E\RoleController::class, 'assign'], 'manager');

$r->get('/erp/tally/settings', [E\TallyController::class, 'settings'], 'owner');
$r->post('/erp/tally/settings', [E\TallyController::class, 'saveSettings'], 'owner');
$r->get('/erp/tally/queue', [E\TallyController::class, 'queue'], 'owner');
$r->post('/erp/tally/retry', [E\TallyController::class, 'retry'], 'owner');
$r->post('/erp/tally/resync-all', [E\TallyController::class, 'resyncAll'], 'owner');
$r->get('/erp/tally/connector', [E\TallyController::class, 'connector'], 'owner');
$r->get('/tally/pending', [E\TallyController::class, 'pending'], 'public');
$r->post('/tally/result', [E\TallyController::class, 'result'], 'public');
