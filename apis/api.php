<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');

// Configuration
$base_dir = __DIR__;
$apis_dir = $base_dir . '/apis';
$config_file = $apis_dir . '/config.json';
$apis_file = $apis_dir . '/apis.json';
$lock_file = $apis_dir . '/sync.lock';

// Create directory if it doesn't exist
if (!file_exists($apis_dir)) {
    mkdir($apis_dir, 0777, true);
}

// Default data structures
$default_data = [
    'config.json' => ['userConfigs' => []],
    'apis.json' => ['userIds' => [], 'apiKeys' => []]
];

// Function to acquire a lock
function acquireLock($lock_file, $timeout = 10) {
    $start = time();
    while (!mkdir($lock_file, 0777)) {
        if (time() - $start > $timeout) {
            return false;
        }
        usleep(100000); // Sleep for 0.1 seconds
    }
    return true;
}

// Function to release lock
function releaseLock($lock_file) {
    if (is_dir($lock_file)) {
        rmdir($lock_file);
    }
}

// Function to handle file operations with locking
function handleFile($action, $file, $content = null) {
    global $apis_dir, $default_data, $lock_file;
    
    // Ensure directory exists
    if (!file_exists($apis_dir)) {
        mkdir($apis_dir, 0777, true);
    }
    
    $filename = basename($file);
    
    // Acquire lock
    if (!acquireLock($lock_file)) {
        http_response_code(503);
        return json_encode([
            'success' => false,
            'error' => 'Could not acquire lock. Please try again.'
        ]);
    }
    
    try {
        switch($action) {
            case 'read':
                if (file_exists($file)) {
                    $content = file_get_contents($file);
                    if ($content === false) {
                        throw new Exception("Failed to read file");
                    }
                    return $content;
                } else {
                    // Create default file if it doesn't exist
                    $default_content = json_encode($default_data[$filename], JSON_PRETTY_PRINT);
                    if (file_put_contents($file, $default_content) === false) {
                        throw new Exception("Failed to create default file");
                    }
                    return $default_content;
                }
            
            case 'write':
                if ($content) {
                    // Ensure valid JSON
                    $decoded = json_decode($content);
                    if (json_last_error() !== JSON_ERROR_NONE) {
                        throw new Exception("Invalid JSON content");
                    }
                    
                    // Write to temporary file first
                    $temp_file = $file . '.tmp';
                    if (file_put_contents($temp_file, json_encode($decoded, JSON_PRETTY_PRINT)) === false) {
                        throw new Exception("Failed to write temporary file");
                    }
                    
                    // Rename temp file to target (atomic operation)
                    if (!rename($temp_file, $file)) {
                        unlink($temp_file);
                        throw new Exception("Failed to update file");
                    }
                    
                    return json_encode(['success' => true]);
                }
                throw new Exception("No content provided");
                
            default:
                throw new Exception("Invalid action");
        }
    } catch (Exception $e) {
        http_response_code(500);
        return json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    } finally {
        releaseLock($lock_file);
    }
}

// Handle requests
$method = $_SERVER['REQUEST_METHOD'];
$file = isset($_GET['file']) ? $_GET['file'] : '';

// Validate file parameter
if (!$file || !in_array($file, ['config.json', 'apis.json'])) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Invalid file parameter'
    ]);
    exit;
}

$target_file = $apis_dir . '/' . $file;

switch ($method) {
    case 'GET':
        echo handleFile('read', $target_file);
        break;
        
    case 'POST':
        $content = file_get_contents('php://input');
        if (!$content) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'No content provided'
            ]);
            break;
        }
        echo handleFile('write', $target_file, $content);
        break;
        
    default:
        http_response_code(405);
        echo json_encode([
            'success' => false,
            'error' => 'Method not allowed'
        ]);
}
