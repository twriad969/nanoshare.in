<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');

// Configuration
$base_dir = __DIR__;
$apis_dir = $base_dir . '/apis';
$config_file = $apis_dir . '/config.json';
$apis_file = $apis_dir . '/apis.json';

// Create directory if it doesn't exist
if (!file_exists($apis_dir)) {
    mkdir($apis_dir, 0777, true);
}

// Default data structures
$default_data = [
    'config.json' => ['userConfigs' => []],
    'apis.json' => ['userIds' => [], 'apiKeys' => []]
];

// Function to handle file operations
function handleFile($action, $file, $content = null) {
    global $apis_dir, $default_data;
    
    // Ensure directory exists
    if (!file_exists($apis_dir)) {
        mkdir($apis_dir, 0777, true);
    }
    
    $filename = basename($file);
    
    switch($action) {
        case 'read':
            if (file_exists($file)) {
                return file_get_contents($file);
            } else {
                // Create default file if it doesn't exist
                $default_content = json_encode($default_data[$filename], JSON_PRETTY_PRINT);
                file_put_contents($file, $default_content);
                return $default_content;
            }
        
        case 'write':
            if ($content) {
                // Ensure valid JSON
                $decoded = json_decode($content);
                if (json_last_error() === JSON_ERROR_NONE) {
                    file_put_contents($file, json_encode(json_decode($content), JSON_PRETTY_PRINT));
                    return json_encode(['success' => true]);
                }
                return json_encode(['error' => 'Invalid JSON provided']);
            }
            return json_encode(['error' => 'No content provided']);
    }
}

// Handle requests
$method = $_SERVER['REQUEST_METHOD'];
$file = isset($_GET['file']) ? $_GET['file'] : '';

switch($method) {
    case 'GET':
        if ($file === 'config' || $file === 'apis') {
            $target_file = $file === 'config' ? $config_file : $apis_file;
            echo handleFile('read', $target_file);
        } else {
            echo json_encode(['error' => 'Invalid file specified']);
        }
        break;
        
    case 'POST':
        $content = file_get_contents('php://input');
        if ($file === 'config' || $file === 'apis') {
            $target_file = $file === 'config' ? $config_file : $apis_file;
            echo handleFile('write', $target_file, $content);
        } else {
            echo json_encode(['error' => 'Invalid file specified']);
        }
        break;
        
    default:
        echo json_encode(['error' => 'Invalid method']);
        break;
}
