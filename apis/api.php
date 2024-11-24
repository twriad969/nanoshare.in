<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header('Access-Control-Allow-Headers: Content-Type');

// Configuration
$base_dir = __DIR__;
$config_file = $base_dir . '/config.json';
$apis_file = $base_dir . '/apis.json';
$lock_file = $base_dir . '/sync.lock';

// Create directory if it doesn't exist
if (!file_exists($base_dir)) {
    mkdir($base_dir, 0777, true);
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
    global $base_dir, $default_data, $lock_file;
    
    // Get filename without path
    $filename = basename($file);
    
    // Validate filename
    if (!in_array($filename, ['config.json', 'apis.json'])) {
        return json_encode([
            'success' => false,
            'error' => 'Invalid file name'
        ]);
    }
    
    // Ensure directory exists
    if (!file_exists($base_dir)) {
        mkdir($base_dir, 0777, true);
    }
    
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
                    $data = json_decode($content);
                    if (json_last_error() !== JSON_ERROR_NONE) {
                        // If file exists but is invalid JSON, return default
                        return json_encode($default_data[$filename]);
                    }
                    return $content;
                } else {
                    // Return default data if file doesn't exist
                    return json_encode($default_data[$filename]);
                }
            
            case 'write':
                if (!$content) {
                    throw new Exception("No content provided");
                }
                
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

// Handle preflight requests
if ($method === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Get file parameter and validate
$file = isset($_GET['file']) ? $_GET['file'] : '';
if (!$file) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'File parameter is required'
    ]);
    exit;
}

// Remove any .json extension if present
$file = str_replace('.json', '', $file);
$file = $base_dir . '/' . $file . '.json';

switch ($method) {
    case 'GET':
        echo handleFile('read', $file);
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
        echo handleFile('write', $file, $content);
        break;
        
    default:
        http_response_code(405);
        echo json_encode([
            'success' => false,
            'error' => 'Method not allowed'
        ]);
}
