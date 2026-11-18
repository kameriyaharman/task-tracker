<?php
use App\Controllers as C;

/** @var App\Core\Router $r */

$r->get('/', [C\HealthController::class, 'index'], 'public');

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
