<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

function unauthorized() {
  http_response_code(401);
  echo json_encode(['error' => 'Unauthorized']);
  exit;
}

$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (stripos($auth, 'Basic ') !== 0) {
  unauthorized();
}
$decoded = base64_decode(substr($auth, 6));
if (!$decoded) {
  unauthorized();
}
list($user, $pass) = explode(':', $decoded, 2);
$expectedUser = getenv('API_USER') ?: 'nabeelxd';
$expectedPass = getenv('API_PASS') ?: 'nabeelxd@2009';
if ($user !== $expectedUser || $pass !== $expectedPass) {
  unauthorized();
}

$dsn = 'mysql:host=localhost;dbname=simonsre_smsapi;charset=utf8mb4';
$dbUser = getenv('MYSQL_USER') ?: 'simonsre_smsapi';
$dbPass = getenv('MYSQL_PASS') ?: 'simonsre_smsapi';
$options = [
  PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
  PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
];

try {
  $pdo = new PDO($dsn, $dbUser, $dbPass, $options);
} catch (Exception $e) {
  http_response_code(500);
  echo json_encode(['error' => 'Database connection failed']);
  exit;
}

$action = $_GET['action'] ?? '';

function ensureTables($pdo) {
  $sql = file_get_contents(__DIR__ . '/schema.sql');
  if ($sql) {
    $pdo->exec($sql);
  }
}

ensureTables($pdo);

function fetchAll($pdo, $sql, $params = []) {
  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  $rows = $stmt->fetchAll();
  return array_map(function($row) {
    foreach ($row as $k => $v) {
      if ($v === null) {
        $row[$k] = null;
      } elseif (is_string($v)) {
        $decoded = json_decode($v, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
          $row[$k] = $decoded;
        }
      }
    }
    return $row;
  }, $rows);
}

if ($action === 'read') {
  $data = [
    'users' => fetchAll($pdo, 'SELECT * FROM users'),
    'sessions' => fetchAll($pdo, 'SELECT * FROM sessions'),
    'devices' => fetchAll($pdo, 'SELECT * FROM devices'),
    'api_keys' => fetchAll($pdo, 'SELECT * FROM api_keys'),
    'webhooks' => fetchAll($pdo, 'SELECT * FROM webhooks'),
    'webhook_deliveries' => fetchAll($pdo, 'SELECT * FROM webhook_deliveries'),
    'sms_queue' => fetchAll($pdo, 'SELECT * FROM sms_queue'),
    'sms_history' => fetchAll($pdo, 'SELECT * FROM sms_history'),
    'logs' => fetchAll($pdo, 'SELECT * FROM logs ORDER BY created_at DESC LIMIT 5000'),
    'settings' => fetchAll($pdo, 'SELECT * FROM settings')
  ];
  $gatewayStmt = $pdo->query('SELECT user_id, paused, updated_at FROM gateway_state');
  $gateway_state = [];
  while ($row = $gatewayStmt->fetch()) {
    $gateway_state[$row['user_id']] = ['paused' => (bool)$row['paused'], 'updated_at' => $row['updated_at']];
  }
  $data['gateway_state'] = $gateway_state;
  echo json_encode($data);
  exit;
}

if ($action === 'write') {
  $raw = file_get_contents('php://input');
  $payload = json_decode($raw, true);
  if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid payload']);
    exit;
  }

  $pdo->beginTransaction();
  try {
    $collections = ['users','sessions','devices','api_keys','webhooks','webhook_deliveries','sms_queue','sms_history','logs','settings'];
    foreach ($collections as $col) {
      $rows = $payload[$col] ?? [];
      $pdo->exec('TRUNCATE TABLE `' . str_replace('`', '``', $col) . '`');
      if (!empty($rows)) {
        $first = $rows[0];
        $keys = array_keys($first);
        $placeholders = implode(',', array_fill(0, count($keys), '?'));
        $sql = 'INSERT INTO `' . str_replace('`', '``', $col) . '` (' . implode(',', array_map(function($k){ return '`' . str_replace('`', '``', $k) . '`'; }, $keys)) . ') VALUES (' . $placeholders . ')';
        $stmt = $pdo->prepare($sql);
        foreach ($rows as $row) {
          $values = [];
          foreach ($keys as $k) {
            $v = $row[$k] ?? null;
            if (is_array($v) || is_object($v)) {
              $v = json_encode($v);
            }
            $values[] = $v;
          }
          $stmt->execute($values);
        }
      }
    }
    $pdo->exec('TRUNCATE TABLE `gateway_state`');
    foreach (($payload['gateway_state'] ?? []) as $uid => $state) {
      $stmt = $pdo->prepare('INSERT INTO `gateway_state` (`user_id`, `paused`, `updated_at`) VALUES (?, ?, ?)');
      $stmt->execute([$uid, $state['paused'] ? 1 : 0, $state['updated_at'] ?? null]);
    }
    $pdo->commit();
    echo json_encode(['success' => true]);
    exit;
  } catch (Exception $e) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => 'Write failed: ' . $e->getMessage()]);
    exit;
  }
}

http_response_code(400);
echo json_encode(['error' => 'Invalid action']);
