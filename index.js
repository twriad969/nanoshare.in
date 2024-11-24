const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const sharp = require('sharp');
const path = require('path');
const express = require('express');
const app = express();

// Initialize bot with your token
const BOT_TOKEN = '6701652400:AAHETpJXne_OoLErwK41ENt7Xg_479O9RCM';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// File paths for storing user data
const API_KEYS_FILE = './apis.json';
const CONFIG_FILE = './config.json';
const TEMP_DIR = './temp';
const ADMIN_ID = 6135009699;  // Admin's Telegram ID

// Watermark position options
const WATERMARK_POSITIONS = {
    FOOTER: 'footer',
    HEADER: 'header',
    BOTH: 'both'
};

// Watermark size options
const WATERMARK_SIZES = {
    SMALL: {
        height: 60,
        fontSize: 24
    },
    MEDIUM: {
        height: 90,
        fontSize: 32
    },
    LARGE: {
        height: 120,
        fontSize: 42
    },
    BIG: {
        height: 150,
        fontSize: 52
    },
    EXTRA_LARGE: {
        height: 180,
        fontSize: 64
    }
};

// Watermark text size options
const WATERMARK_TEXT_SIZES = {
    DEFAULT: { fontSize: 32, name: 'Default' },
    SMALL: { fontSize: 24, name: 'Small' },
    MEDIUM: { fontSize: 36, name: 'Medium' },
    LARGE: { fontSize: 48, name: 'Large' },
    EXTRA_LARGE: { fontSize: 64, name: 'Extra Large' },
};

// Statistics tracking
let botStats = {
    totalMessages: 0,
    linksProcessed: 0,
    imagesProcessed: 0,
    activeUsers: new Set(),
    commandUsage: {},
    lastReset: new Date().toISOString()
};

// Admin check helper
function isAdmin(chatId) {
    return chatId === ADMIN_ID;
}

// Format stats helper
function formatStats() {
    const now = new Date();
    const uptime = Math.floor((now - new Date(botStats.lastReset)) / 1000); // in seconds
    
    return `📊 *Bot Statistics*\n\n` +
           `📝 Total Messages: ${botStats.totalMessages}\n` +
           `🔗 Links Processed: ${botStats.linksProcessed}\n` +
           `🖼 Images Processed: ${botStats.imagesProcessed}\n` +
           `👥 Active Users: ${botStats.activeUsers.size}\n` +
           `⌛️ Uptime: ${Math.floor(uptime/86400)}d ${Math.floor((uptime%86400)/3600)}h ${Math.floor((uptime%3600)/60)}m\n\n` +
           `📈 Command Usage:\n${Object.entries(botStats.commandUsage)
               .map(([cmd, count]) => `/${cmd}: ${count} times`)
               .join('\n')}`;
}

// Admin commands
bot.onText(/\/stats/, (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, "⛔️ This command is only available to administrators.");
        return;
    }
    
    bot.sendMessage(chatId, formatStats(), { parse_mode: 'Markdown' });
});

bot.onText(/\/resetstats/, (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, "⛔️ This command is only available to administrators.");
        return;
    }
    
    botStats = {
        totalMessages: 0,
        linksProcessed: 0,
        imagesProcessed: 0,
        activeUsers: new Set(),
        commandUsage: {},
        lastReset: new Date().toISOString()
    };
    
    bot.sendMessage(chatId, "📊 Statistics have been reset!");
});

// Broadcast state tracking
const broadcastStates = {};

// Admin broadcast command handler
bot.onText(/\/broadcast/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, "⛔️ This command is only available to administrators.");
        return;
    }

    broadcastStates[chatId] = {
        waiting: true,
        step: 'content'
    };

    const options = {
        reply_markup: {
            keyboard: [['Cancel Broadcast']],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };

    bot.sendMessage(chatId, 
        "Please send the content you want to broadcast:\n" +
        "- Send a text message for text broadcast\n" +
        "- Send an image (with optional caption) for image broadcast\n" +
        "- Or press 'Cancel Broadcast' to cancel",
        options
    );
});

// Handle broadcast content
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const state = broadcastStates[chatId];

    if (!state?.waiting) {
        return;
    }

    if (msg.text === 'Cancel Broadcast') {
        delete broadcastStates[chatId];
        bot.sendMessage(chatId, "Broadcast cancelled.", {
            reply_markup: {
                remove_keyboard: true
            }
        });
        return;
    }

    try {
        // Load user IDs from apis.json
        const apiData = JSON.parse(fs.readFileSync(API_KEYS_FILE, 'utf-8'));
        const userIds = Array.isArray(apiData.userIds) ? apiData.userIds : [];

        if (userIds.length === 0) {
            throw new Error('No user IDs found in apis.json');
        }

        let sent = 0;
        let failed = 0;

        // Handle different types of content
        if (msg.photo) {
            // Image broadcast
            const photo = msg.photo[msg.photo.length - 1];
            const caption = msg.caption || '';

            for (const userId of userIds) {
                try {
                    await bot.sendPhoto(userId, photo.file_id, {
                        caption: caption
                    });
                    sent++;
                } catch (error) {
                    console.error(`Failed to send photo to ${userId}:`, error.message);
                    failed++;
                }
            }
        } else if (msg.text) {
            // Text broadcast
            for (const userId of userIds) {
                try {
                    await bot.sendMessage(userId, msg.text);
                    sent++;
                } catch (error) {
                    console.error(`Failed to send message to ${userId}:`, error.message);
                    failed++;
                }
            }
        }

        // Send broadcast report
        bot.sendMessage(chatId, 
            `📊 Broadcast Report\n\n` +
            `✅ Successfully sent: ${sent}\n` +
            `❌ Failed: ${failed}\n` +
            `👥 Total recipients: ${userIds.length}`,
            {
                reply_markup: {
                    remove_keyboard: true
                }
            }
        );

    } catch (error) {
        bot.sendMessage(chatId, `❌ Error: ${error.message}`, {
            reply_markup: {
                remove_keyboard: true
            }
        });
    }

    // Clear broadcast state
    delete broadcastStates[chatId];
});

bot.onText(/\/users/, (msg) => {
    const chatId = msg.chat.id;
    if (!isAdmin(chatId)) {
        bot.sendMessage(chatId, "⛔️ This command is only available to administrators.");
        return;
    }
    
    const userList = Array.from(botStats.activeUsers);
    bot.sendMessage(chatId, `👥 Active Users (${userList.length}):\n${userList.join('\n')}`);
});

// Create temp directory if it doesn't exist
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}

// Utility to read/write JSON files
async function readJSON(file) {
    try {
        if (!fs.existsSync(file)) {
            const defaultData = file === API_KEYS_FILE 
                ? { userIds: [], apiKeys: {} } 
                : {};
            await writeJSON(file, defaultData);
            return defaultData;
        }
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (error) {
        console.error(`Error reading ${file}:`, error.message);
        return file === API_KEYS_FILE ? { userIds: [], apiKeys: {} } : {};
    }
};

// Function to write JSON files
async function writeJSON(file, data) {
    try {
        const tempFile = `${file}.tmp`;
        fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
        fs.renameSync(tempFile, file);
    } catch (error) {
        console.error(`Error writing ${file}:`, error.message);
    }
};

// Function to update user config
async function updateUserConfig(userId, updates) {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
        try {
            const config = await readJSON(CONFIG_FILE);
            
            // Initialize user config if it doesn't exist
            if (!config[userId]) {
                config[userId] = {
                    boldEnabled: false,
                    change: "",
                    watermark: "",
                    shorteningEnabled: true,
                    watermarkPosition: "footer",
                    watermarkSize: "medium",
                    boldTextEnabled: false,
                    watermarkTextSize: "MEDIUM"
                };
            }

            // Update only the specified settings
            config[userId] = {
                ...config[userId],
                ...updates
            };

            // Save the updated config
            await writeJSON(CONFIG_FILE, config);
            await syncConfigToServer();
            return config[userId];
        } catch (error) {
            retryCount++;
            if (retryCount === maxRetries) {
                console.error(`Failed to update config for user ${userId} after ${maxRetries} attempts:`, error);
                return false;
            }
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// Function to get user config
async function getUserConfig(userId) {
    const config = await readJSON(CONFIG_FILE);
    return config[userId] || {
        boldEnabled: false,
        change: "",
        watermark: "",
        shorteningEnabled: true,
        watermarkPosition: "footer",
        watermarkSize: "medium",
        boldTextEnabled: false,
        watermarkTextSize: "MEDIUM"
    };
}

// Function to sync config with server
async function syncConfigToServer() {
    try {
        const configs = await readJSON(CONFIG_FILE);
        const response = await axios.post('https://maxboxshare.com/cron.php', {
            action: 'write',
            file: 'config.json',
            content: JSON.stringify(configs)
        });
        
        if (!response.data.success) {
            throw new Error('Server sync failed');
        }
        
        return true;
    } catch (error) {
        console.error('Config sync failed:', error);
        throw error;
    }
}

// Helper to preserve HTML formatting tags
function preserveFormatting(text) {
    const formatTags = {
        bold: ['<b>', '</b>'],
        italic: ['<i>', '</i>'],
        underline: ['<u>', '</u>'],
        strikethrough: ['<s>', '</s>'],
        code: ['<code>', '</code>'],
        pre: ['<pre>', '</pre>']
    };

    let preservedText = text;
    const preservedTags = [];

    // Preserve nested tags by replacing them with placeholders
    Object.entries(formatTags).forEach(([type, [openTag, closeTag]]) => {
        const regex = new RegExp(`${openTag}(.*?)${closeTag}`, 'gs');
        preservedText = preservedText.replace(regex, (match, content) => {
            preservedTags.push({ type, content, match });
            return `__FORMAT_${preservedTags.length - 1}__`;
        });
    });

    return { preservedText, preservedTags };
}

// Helper to restore HTML formatting
function restoreFormatting(text, preservedTags) {
    let restoredText = text;
    preservedTags.forEach((tag, index) => {
        restoredText = restoredText.replace(
            `__FORMAT_${index}__`,
            tag.match
        );
    });
    return restoredText;
}

// Helper to validate and clean channel username/link
function validateChannelInput(input) {
    // Check if it's a telegram link
    if (input.includes('t.me/') || input.includes('telegram.me/')) {
        // Handle private channel links (with + or joinchat)
        if (input.includes('/+') || input.includes('/joinchat/')) {
            return {
                isValid: true,
                username: input, // Store the full link for private channels
                error: null
            };
        }

        // Extract username from public channel link
        const linkMatch = input.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)/);
        if (linkMatch) {
            return {
                isValid: true,
                username: '@' + linkMatch[1],
                error: null
            };
        }
    }

    // Check if it's a username
    if (!input.startsWith('@')) {
        return {
            isValid: false,
            username: null,
            error: '❌ Username must start with @ or be a valid Telegram channel link'
        };
    }

    // Remove @ and validate format
    const username = input.substring(1);
    if (!/^[a-zA-Z0-9_]{5,}$/.test(username)) {
        return {
            isValid: false,
            username: null,
            error: '❌ Invalid username format. Username must:\n• Start with @\n• Be at least 5 characters long\n• Use only letters, numbers, and underscores'
        };
    }

    return {
        isValid: true,
        username: '@' + username,
        error: null
    };
}

// Helper to replace Telegram links and usernames
function replaceChannelLinks(text, replacement) {
    if (!replacement) return text;

    // If replacement is a full private channel link, don't modify it
    if (replacement.includes('t.me/') && (replacement.includes('/+') || replacement.includes('/joinchat/'))) {
        return text
            .replace(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:[a-zA-Z0-9_+\/]+)/g, replacement)
            .replace(/@([a-zA-Z0-9_]+)/g, replacement);
    }

    // For public channels/usernames
    return text
        .replace(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)/g, replacement)
        .replace(/@([a-zA-Z0-9_]+)/g, replacement);
}

// Function to handle interactive commands
function handleInteractiveCommand(chatId, type, text) {
    try {
        // Special handling for channel link replacement
        if (type === 'change') {
            const validation = validateChannelInput(text);
            if (!validation.isValid) {
                bot.sendMessage(chatId, validation.error);
                return;
            }
            updateUserConfig(chatId, { [type]: validation.username });
        } else {
            updateUserConfig(chatId, { [type]: text });
        }

        bot.sendMessage(chatId, `✅ Your ${type} has been saved successfully! 📝`);
        delete state[chatId];
    } catch (error) {
        console.error('Error in handleInteractiveCommand:', error);
        bot.sendMessage(chatId, '❌ An error occurred while saving your settings.');
    }
}

// Update the command handlers to use getUserConfig
bot.onText(/\/settings/, (msg) => {
    const chatId = msg.chat.id;
    const config = getUserConfig(chatId);
    const apiKeys = readJSON(API_KEYS_FILE);
    const apiKey = apiKeys[chatId] || 'Not set';

    const settings = 
        '🔧 Current Settings:\n\n' +
        `API Key: ${apiKey === 'Not set' ? '❌ Not set' : '✅ Set'}\n` +
        `Header: ${config.header ? '✅ Set' : '❌ Not set'}\n` +
        `Footer: ${config.footer ? '✅ Set' : '❌ Not set'}\n` +
        `Channel Replacement: ${config.change ? `✅ Set (@${config.change})` : '❌ Not set'}\n` +
        `Bold Links: ${config.boldEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
        `Bold Text: ${config.boldTextEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
        `Watermark: ${config.watermark ? '✅ Set' : '❌ Not set'}\n` +
        `Watermark Position: ${config.watermarkPosition || 'footer'}\n` +
        `Watermark Size: ${config.watermarkSize || 'medium'}\n` +
        `Watermark Text Size: ${WATERMARK_TEXT_SIZES[config.watermarkTextSize || 'DEFAULT'].name}\n` +
        `Text Mode: ${config.textOff ? '❌ OFF (links only)' : '✅ ON (full text)'}`;

    bot.sendMessage(chatId, settings);
});

// Helper to shorten links using the AdLinkFly API
async function shortenLink(apiKey, url) {
    try {
        const response = await axios.get(`https://maxshare.ronok.workers.dev/?link=${url}&apikey=${encodeURIComponent(apiKey)}`);
        if (response.data.url) {
            botStats.linksProcessed++;
            return response.data.url;
        } else {
            throw new Error('Invalid API response: Missing "url".');
        }
    } catch (err) {
        console.error('Error shortening link:', err.message);
        throw new Error('❌ Failed to shorten the link. Please check your API key or try again later.');
    }
}

// Helper to convert maxboxshare links
async function convertMaxboxshareLink(url) {
    try {
        // Extract alias from the URL
        const alias = url.split('maxboxshare.com/')[1].split('?')[0].split('/')[0].trim();
        
        // Request to converter API
        const converterResponse = await axios.get(`https://maxboxshare.com/converter.php?alias=${alias}`);
        if (converterResponse.data?.url) {
            return converterResponse.data.url;
        } else {
            throw new Error('Invalid converter response');
        }
    } catch (err) {
        console.error('Error converting maxboxshare link:', err.message);
        throw new Error('❌ Failed to convert the maxboxshare link.');
    }
}

// Process URLs in text
async function processUrls(text, apiKey, chatId) {
    if (!text) return text;
    
    const config = await getUserConfig(chatId);
    const shorteningEnabled = config.shorteningEnabled !== false; // Default to true if not set
    
    if (!shorteningEnabled) {
        return text; // Return text as is if shortening is disabled
    }

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    let matches = text.match(urlRegex);
    
    if (!matches) return text;

    let processedText = text;
    for (const url of matches) {
        try {
            if (url.includes('maxboxshare.com')) {
                const convertedUrl = await convertMaxboxshareLink(url);
                if (convertedUrl && convertedUrl !== url) {
                    const shortened = await shortenLink(apiKey, convertedUrl);
                    processedText = processedText.replace(url, shortened);
                }
            } else {
                const shortened = await shortenLink(apiKey, url);
                processedText = processedText.replace(url, shortened);
            }
        } catch (error) {
            console.error('Error processing URL:', error);
        }
    }
    return processedText;
}

// Process captions with Telegram formatting and shorten links
async function processCaption(apiKey, caption, header, footer, channelLink, boldEnabled, boldTextEnabled, chatId) {
    try {
        // First preserve existing formatting
        const { preservedText, preservedTags } = preserveFormatting(caption);

        // Extract and process URLs
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        let processedText = preservedText;
        const config = await getUserConfig(chatId);

        // Process URLs
        const urlMatches = [...preservedText.matchAll(urlRegex)];
        const shortenedUrls = [];

        // Shorten all URLs first
        for (const match of urlMatches) {
            try {
                const originalUrl = match[0];
                const shortenedUrl = await processUrls(originalUrl, apiKey, chatId);
                shortenedUrls.push(shortenedUrl);
            } catch (error) {
                console.error('Error shortening URL:', error);
                throw error;
            }
        }

        // Handle text display based on textMode
        if (config.textOff && urlMatches.length > 0) {
            if (urlMatches.length === 1) {
                // Single link - just show the link
                processedText = shortenedUrls[0];
            } else {
                // Multiple links - show numbered list with extra spacing
                processedText = shortenedUrls.map((url, index) => `${index + 1}.\n\n${url}\n`).join('\n');
            }
        } else {
            // Normal mode - replace URLs in text
            for (let i = 0; i < urlMatches.length; i++) {
                const originalUrl = urlMatches[i][0];
                const shortenedUrl = shortenedUrls[i];
                processedText = processedText.replace(
                    originalUrl,
                    boldEnabled ? `<b>${shortenedUrl}</b>` : shortenedUrl
                );
            }
        }

        // Replace channel links if specified
        if (channelLink) {
            processedText = replaceChannelLinks(processedText, channelLink);
        }

        // Restore HTML formatting
        processedText = restoreFormatting(processedText, preservedTags);

        // Add header and footer
        const formattedHeader = header ? preserveFormatting(header).preservedText : '';
        const formattedFooter = footer ? preserveFormatting(footer).preservedText : '';

        // Make entire text bold if boldTextEnabled is true
        if (boldTextEnabled) {
            processedText = `<b>${processedText}</b>`;
        }

        return `${formattedHeader ? `${formattedHeader}\n\n` : ''}${processedText}${formattedFooter ? `\n\n${formattedFooter}` : ''}`;
    } catch (error) {
        console.error('Error processing caption:', error);
        throw error;
    }
}

// Helper to add watermark to image
async function addWatermark(inputBuffer, watermarkText, chatId) {
    try {
        botStats.imagesProcessed++;
        const image = sharp(inputBuffer);
        const metadata = await image.metadata();

        const config = await getUserConfig(chatId);
        const position = config.watermarkPosition || 'footer';
        const size = config.watermarkSize || 'medium';
        const textSize = config.watermarkTextSize || 'DEFAULT';

        // Get size configuration
        const sizeConfig = WATERMARK_SIZES[size.toUpperCase()] || WATERMARK_SIZES.MEDIUM;
        const bannerHeight = sizeConfig.height;
        const fontSize = WATERMARK_TEXT_SIZES[textSize].fontSize || WATERMARK_TEXT_SIZES.DEFAULT.fontSize;
        const bannerWidth = metadata.width || 720;

        // Function to create SVG text banner
        const createBanner = (text) => `
            <svg width="${bannerWidth}" height="${bannerHeight}">
                <rect width="${bannerWidth}" height="${bannerHeight}" fill="white"/>
                <text 
                    x="${bannerWidth/2}" 
                    y="${bannerHeight/2}" 
                    text-anchor="middle" 
                    dominant-baseline="middle" 
                    font-family="Arial" 
                    font-size="${fontSize}" 
                    font-weight="bold"
                    fill="#000000"
                >${text}</text>
            </svg>`;

        let compositeOperations = [];
        let extendOptions = {};

        switch (position) {
            case 'header':
                extendOptions = {
                    top: bannerHeight,
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                };
                compositeOperations.push({
                    input: Buffer.from(createBanner(watermarkText)),
                    gravity: 'north'
                });
                break;
            case 'both':
                extendOptions = {
                    top: bannerHeight,
                    bottom: bannerHeight,
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                };
                compositeOperations.push(
                    {
                        input: Buffer.from(createBanner(watermarkText)),
                        gravity: 'north'
                    },
                    {
                        input: Buffer.from(createBanner(watermarkText)),
                        gravity: 'south'
                    }
                );
                break;
            case 'footer':
            default:
                extendOptions = {
                    bottom: bannerHeight,
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                };
                compositeOperations.push({
                    input: Buffer.from(createBanner(watermarkText)),
                    gravity: 'south'
                });
                break;
        }

        const watermarkedImage = await image
            .extend(extendOptions)
            .composite(compositeOperations)
            .jpeg()
            .toBuffer();

        return watermarkedImage;
    } catch (error) {
        console.error('Error adding watermark:', error);
        throw error;
    }
}

// Process image with watermark
async function processImage(photoBuffer, chatId) {
    try {
        const config = await getUserConfig(chatId);
        if (!config.watermark) {
            return photoBuffer;
        }
        return await addWatermark(
            photoBuffer,
            config.watermark,
            chatId
        );
    } catch (error) {
        console.error('Error processing image:', error);
        return photoBuffer;
    }
}

// Helper to handle reset confirmation
function handleResetConfirmation(chatId, text) {
    if (state[chatId]?.type === 'reset_confirm') {
        if (text.toLowerCase() === 'yes') {
            // Reset all settings
            delete userConfigs[chatId];
            delete apiKeys[chatId];
            writeJSON(CONFIG_FILE, userConfigs);
            writeJSON(API_KEYS_FILE, apiKeys);
            delete state[chatId];

            bot.sendMessage(chatId, '✅ All your settings have been reset successfully!');
        } else {
            delete state[chatId];
            bot.sendMessage(chatId, '❌ Reset process cancelled.');
        }
        return true;
    }
    return false;
}

// Command handlers
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
        '👋 Welcome to Nanoshare.in Bot!\n\n' +
        '🌟 This bot helps you with:\n' +
        '• Shortening links with nanoshare.in\n' +
        '• Converting MaxboxShare links automatically\n' +
        '• Processing media captions\n' +
        '• Adding watermarks to images\n' +
        '• Customizing message format\n\n' +
        '📝 Main Commands:\n' +
        '/api - Set your API key\n' +
        '/header - Set message header\n' +
        '/footer - Set message footer\n' +
        '/watermark - Set image watermark\n' +
        '/watermark_position - Set watermark position\n' +
        '/watermark_size - Set watermark size\n' +
        '/watermark_text_size - Set watermark text size\n' +
        '/change - Set channel username/link\n' +
        '/bold - Toggle bold formatting for links\n' +
        '/bold_text - Toggle bold formatting for entire caption\n' +
        '/text_on - Show full caption text\n' +
        '/text_off - Show only links in captions\n' +
        '/short_on - Enable link shortening\n' +
        '/short_off - Disable link shortening\n\n' +
        'Remove Commands:\n' +
        '/remove_header - Remove header\n' +
        '/remove_footer - Remove footer\n' +
        '/remove_username - Remove channel username\n' +
        '/remove_watermark - Remove watermark\n' +
        '/reset_settings - Reset ALL settings\n\n' +
        '⚙️ Other Commands:\n' +
        '/settings - View current settings\n' +
        '/export_settings - Export your settings\n\n' +
        '💡 How to use:\n' +
        '1. Set your API key using /api\n' +
        '2. Forward any message or media with links\n' +
        '3. The bot will process and send back with shortened links\n' +
        '4. MaxboxShare links will be automatically converted\n\n' +
        '🔗 Get your API key from nanoshare.in\n' +
        '✨ Powered by Nanoshare.in - Your Link Shortening Solution'
    );
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
        '📚 Detailed Command Help\n\n' +
        'Main Commands:\n' +
        '/api - Set your nanoshare.in API key\n' +
        '/header - Set custom header text\n' +
        '/footer - Set custom footer text\n' +
        '/watermark - Set image watermark text\n' +
        '/watermark_position - Set watermark position (footer/header/both)\n' +
        '/watermark_size - Set watermark size (small/medium/large/big/extra large)\n' +
        '/watermark_text_size - Set watermark text size\n' +
        '/change - Set channel username/link\n' +
        '/bold - Toggle bold formatting for links\n' +
        '/bold_text - Toggle bold formatting for entire caption\n' +
        '/text_on - Show full caption text\n' +
        '/text_off - Show only links in captions\n' +
        '/short_on - Enable link shortening\n' +
        '/short_off - Disable link shortening\n\n' +
        'Remove Commands:\n' +
        '/remove_header - Remove header text\n' +
        '/remove_footer - Remove footer text\n' +
        '/remove_username - Remove channel username\n' +
        '/remove_watermark - Remove watermark\n' +
        '/reset_settings - Reset ALL settings\n\n' +
        'Other Commands:\n' +
        '/settings - View current settings\n' +
        '/export_settings - Export all settings\n\n' +
        'Tips:\n' +
        '• Forward any message with links to shorten them\n' +
        '• Send images to add watermark\n' +
        '• MaxboxShare links are converted automatically\n' +
        '• Use /short_off to process messages without shortening links\n' +
        '• Use /short_on to enable link shortening again\n' +
        '• Use /watermark_position to customize watermark placement\n' +
        '• Use /watermark_size to adjust watermark size\n' +
        '• Use /watermark_text_size to adjust text size\n' +
        '• Use /bold_text to make entire caption bold\n\n' +
        '🔗 Get your API key from nanoshare.in'
    );
});

// New commands for managing settings
bot.onText(/\/remove_header/, (msg) => {
    resetSetting(msg.chat.id, 'header');
});

bot.onText(/\/remove_footer/, (msg) => {
    resetSetting(msg.chat.id, 'footer');
});

bot.onText(/\/remove_username/, (msg) => {
    resetSetting(msg.chat.id, 'change');
});

bot.onText(/\/remove_watermark/, (msg) => {
    resetSetting(msg.chat.id, 'watermark');
});

bot.onText(/\/reset_settings/, (msg) => {
    const chatId = msg.chat.id;
    state[chatId] = { type: 'reset_confirm' };
    bot.sendMessage(chatId, 
        '⚠️ WARNING: This will reset ALL your settings!\n\n' +
        'The following data will be deleted:\n' +
        '- API Key\n' +
        '- Header Text\n' +
        '- Footer Text\n' +
        '- Channel Username\n' +
        '- Watermark\n' +
        '- Bold Settings\n\n' +
        'Type "yes" to confirm reset or anything else to cancel.'
    );
});

bot.onText(/\/export_settings/, (msg) => {
    const chatId = msg.chat.id;
    const config = getUserConfig(chatId);
    const apiKey = readJSON(API_KEYS_FILE)[chatId] || 'Not set';

    const settingsExport = 
        '🔧 Exported Settings:\n\n' +
        `API Key: ${apiKey === 'Not set' ? '❌ Not set' : '✅ Set'}\n` +
        `Header: ${config.header || '❌ Not set'}\n` +
        `Footer: ${config.footer || '❌ Not set'}\n` +
        `Channel Replacement: ${config.change ? `✅ Set (@${config.change})` : '❌ Not set'}\n` +
        `Bold Links: ${config.boldEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
        `Bold Text: ${config.boldTextEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
        `Watermark: ${config.watermark ? '✅ Set' : '❌ Not set'}\n` +
        `Watermark Position: ${config.watermarkPosition || 'footer'}\n` +
        `Watermark Size: ${config.watermarkSize || 'medium'}\n` +
        `Watermark Text Size: ${WATERMARK_TEXT_SIZES[config.watermarkTextSize || 'DEFAULT'].name}\n` +
        `Text Mode: ${config.textOff ? '❌ OFF (links only)' : '✅ ON (full text)'}\n` +
        '\n💡 Note: API key is masked for security.';

    bot.sendMessage(chatId, settingsExport);
});

bot.onText(/\/settings/, (msg) => {
    const chatId = msg.chat.id;
    const apiKey = readJSON(API_KEYS_FILE)[chatId] || 'Not set';
    const config = getUserConfig(chatId);

    const settings = 
        '🔧 Current Settings:\n\n' +
        `API Key: ${apiKey === 'Not set' ? '❌ Not set' : '✅ Set'}\n` +
        `Header: ${config.header ? '✅ Set' : '❌ Not set'}\n` +
        `Footer: ${config.footer ? '✅ Set' : '❌ Not set'}\n` +
        `Channel Replacement: ${config.change ? `✅ Set (@${config.change})` : '❌ Not set'}\n` +
        `Bold Links: ${config.boldEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
        `Bold Text: ${config.boldTextEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
        `Watermark: ${config.watermark ? '✅ Set' : '❌ Not set'}\n` +
        `Watermark Position: ${config.watermarkPosition || 'footer'}\n` +
        `Watermark Size: ${config.watermarkSize || 'medium'}\n` +
        `Watermark Text Size: ${WATERMARK_TEXT_SIZES[config.watermarkTextSize || 'DEFAULT'].name}\n` +
        `Text Mode: ${config.textOff ? '❌ OFF (links only)' : '✅ ON (full text)'}`;

    bot.sendMessage(chatId, settings);
});

bot.onText(/\/bold$/, (msg) => {
    const chatId = msg.chat.id;
    const isBoldEnabled = getUserConfig(chatId).boldEnabled;
    const newState = !isBoldEnabled;

    updateUserConfig(chatId, { boldEnabled: newState });
    bot.sendMessage(chatId, `✅ Bold formatting for links has been ${newState ? 'enabled' : 'disabled'}! 📝`);
});

bot.onText(/\/bold_text$/, (msg) => {
    const chatId = msg.chat.id;
    const isBoldTextEnabled = getUserConfig(chatId).boldTextEnabled;
    const newState = !isBoldTextEnabled;

    updateUserConfig(chatId, { boldTextEnabled: newState });
    bot.sendMessage(chatId, `✅ Bold formatting for entire caption has been ${newState ? 'enabled' : 'disabled'}! 📝`);
});

bot.onText(/\/watermark$/, (msg) => {
    const chatId = msg.chat.id;
    const instructions = '📝 Please send the text you want to use as a watermark.';
    bot.sendMessage(chatId, instructions).then(() => {
        state[chatId] = { type: 'watermark' };
    });
});

// Add text mode commands
bot.onText(/\/text_off/, (msg) => {
    const chatId = msg.chat.id;
    updateUserConfig(chatId, { textOff: true });
    bot.sendMessage(chatId, '✅ Text mode turned OFF. Only links will be shown in captions.');
});

bot.onText(/\/text_on/, (msg) => {
    const chatId = msg.chat.id;
    updateUserConfig(chatId, { textOff: false });
    bot.sendMessage(chatId, '✅ Text mode turned ON. Full captions will be shown with links.');
});

// Add new commands for link shortening toggle
bot.onText(/\/short_off/, (msg) => {
    const chatId = msg.chat.id;
    
    // Initialize user config if it doesn't exist
    if (!getUserConfig(chatId)) {
        updateUserConfig(chatId, {});
    }
    
    // Update shortening preference
    updateUserConfig(chatId, { shorteningEnabled: false });
    
    // Update command usage stats
    botStats.commandUsage['short_off'] = (botStats.commandUsage['short_off'] || 0) + 1;
    
    bot.sendMessage(chatId, "✅ Link shortening has been disabled. Your links will now be processed without shortening.");
});

bot.onText(/\/short_on/, (msg) => {
    const chatId = msg.chat.id;
    
    // Initialize user config if it doesn't exist
    if (!getUserConfig(chatId)) {
        updateUserConfig(chatId, {});
    }
    
    // Update shortening preference
    updateUserConfig(chatId, { shorteningEnabled: true });
    
    // Update command usage stats
    botStats.commandUsage['short_on'] = (botStats.commandUsage['short_on'] || 0) + 1;
    
    bot.sendMessage(chatId, "✅ Link shortening has been enabled. Your links will now be shortened during processing.");
});

// Handle interactive commands
['api', 'header', 'footer', 'change', 'watermark'].forEach((command) => {
    bot.onText(new RegExp(`\/${command}$`), (msg) => {
        const chatId = msg.chat.id;
        const instructions = {
            api: '📝 Please send your API key.',
            header: '📝 Please send the text you want to use as a header.',
            footer: '📝 Please send the text you want to use as a footer.',
            change: '📝 Please send your username (with or without @) to replace channel links.',
            watermark: '📝 Please send the text you want to use as a watermark.'
        };
        bot.sendMessage(chatId, instructions[command]).then(() => {
            state[chatId] = { type: command };
        });
    });
});

// Handle text input for interactive commands
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Update statistics
    botStats.totalMessages++;
    botStats.activeUsers.add(chatId);
    
    if (text && text.startsWith('/')) {
        const command = text.split(' ')[0].substring(1);
        botStats.commandUsage[command] = (botStats.commandUsage[command] || 0) + 1;
    }

    // Handle reset confirmation first
    if (handleResetConfirmation(chatId, text)) {
        return;
    }

    // Handle command responses
    if (state[chatId]) {
        if (state[chatId].type === 'api') {
            if (/^[a-zA-Z0-9]+$/.test(text)) {
                const apiKeys = await readJSON(API_KEYS_FILE);
                apiKeys[chatId] = text;
                await writeJSON(API_KEYS_FILE, apiKeys);
                bot.sendMessage(chatId, '✅ Your API key has been saved successfully! 🚀');
                delete state[chatId];
            } else {
                bot.sendMessage(chatId, '❌ Invalid API key format. Please try again.');
            }
        } else if (state[chatId].type === 'header' || state[chatId].type === 'footer' || state[chatId].type === 'change' || state[chatId].type === 'watermark') {
            handleInteractiveCommand(chatId, state[chatId].type, text);
            delete state[chatId];
        }
    }

    // Handle media messages with caption
    if ((msg.photo || msg.video) && msg.caption) {
        try {
            const config = await getUserConfig(chatId);
            const apiKey = await readJSON(API_KEYS_FILE)[chatId];
            const { header, footer, change, boldEnabled, boldTextEnabled, watermarkTextSize } = config;

            // Process caption
            const newCaption = await processCaption(apiKey, msg.caption, header, footer, change, boldEnabled, boldTextEnabled, chatId);

            // Handle photo with watermark
            if (msg.photo) {
                try {
                    // Get the highest resolution photo
                    const photo = msg.photo[msg.photo.length - 1];

                    // Download the photo
                    const file = await bot.getFile(photo.file_id);
                    const photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
                    const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
                    const photoBuffer = Buffer.from(response.data);

                    // Process the photo with watermark
                    const processedBuffer = await processImage(photoBuffer, chatId);

                    // Send the processed photo
                    await bot.sendPhoto(chatId, processedBuffer, {
                        caption: newCaption,
                        parse_mode: 'HTML'
                    });
                } catch (error) {
                    console.error('Error processing photo:', error);
                    bot.sendMessage(chatId, '❌ Error processing the photo. Please try again.');
                }
            } else if (msg.video) {
                // For videos, just resend with new caption
                await bot.sendVideo(chatId, msg.video.file_id, {
                    caption: newCaption,
                    parse_mode: 'HTML'
                });
            }
        } catch (err) {
            console.error('Error:', err);
            bot.sendMessage(chatId, `❌ Error: ${err.message}`);
        }
    }
});

// Add watermark position command
bot.onText(/\/watermark_position/, (msg) => {
    const chatId = msg.chat.id;
    const currentPosition = (getUserConfig(chatId).watermarkPosition || 'footer').toLowerCase();
    
    const createPositionButton = (position, label) => {
        const isSelected = position === currentPosition;
        return {
            text: `${label}${isSelected ? ' ✅' : ''}`,
            callback_data: `watermark_pos_${position}`
        };
    };
    
    const options = {
        reply_markup: {
            inline_keyboard: [
                [createPositionButton('footer', '📝 Footer Only')],
                [createPositionButton('header', '📝 Header Only')],
                [createPositionButton('both', '📝 Both Header & Footer')]
            ]
        }
    };
    
    bot.sendMessage(chatId, '🎯 Select watermark position:', options);
});

// Add watermark size command
bot.onText(/\/watermark_size/, (msg) => {
    const chatId = msg.chat.id;
    const currentSize = (getUserConfig(chatId).watermarkSize || 'medium').toLowerCase();
    
    const createSizeButton = (size, label) => {
        const isSelected = size === currentSize;
        return {
            text: `${label}${isSelected ? ' ✅' : ''}`,
            callback_data: `watermark_size_${size}`
        };
    };
    
    const options = {
        reply_markup: {
            inline_keyboard: [
                [createSizeButton('small', '📝 Small')],
                [createSizeButton('medium', '📝 Medium')],
                [createSizeButton('large', '📝 Large')],
                [createSizeButton('big', '📝 Big')],
                [createSizeButton('extra_large', '📝 Extra Large')]
            ]
        }
    };
    
    bot.sendMessage(chatId, '📏 Select watermark size:', options);
});

// Add watermark text size command
bot.onText(/\/watermark_text_size/, (msg) => {
    const chatId = msg.chat.id;
    const config = getUserConfig(chatId);
    const currentTextSize = config.watermarkTextSize || 'DEFAULT';

    const keyboard = Object.entries(WATERMARK_TEXT_SIZES).map(([size, details]) => [{
        text: `${size === currentTextSize ? '✅ ' : ''}${details.name}`,
        callback_data: `watermark_text_size:${size}`
    }]);

    const options = {
        reply_markup: {
            inline_keyboard: keyboard
        }
    };

    bot.sendMessage(
        chatId,
        '📏 Select Watermark Text Size:\n\n' +
        'Current size: ' + WATERMARK_TEXT_SIZES[currentTextSize].name,
        options
    );
});

// Handle watermark position callback
bot.on('callback_query', async (callbackQuery) => {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    if (data.startsWith('watermark_pos_')) {
        const position = data.replace('watermark_pos_', '');
        
        // Update user config
        updateUserConfig(chatId, { watermarkPosition: position });

        // Update keyboard to show selection
        const createPositionButton = (btnPosition, label) => {
            const isSelected = btnPosition === position;
            return {
                text: `${label}${isSelected ? ' ✅' : ''}`,
                callback_data: `watermark_pos_${btnPosition}`
            };
        };

        const options = {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [createPositionButton('footer', '📝 Footer Only')],
                    [createPositionButton('header', '📝 Header Only')],
                    [createPositionButton('both', '📝 Both Header & Footer')]
                ]
            }
        };

        // Update message with new keyboard
        await bot.editMessageText(
            '🎯 Select watermark position:',
            options
        );

        // Send confirmation message
        bot.answerCallbackQuery(callbackQuery.id, {
            text: `Watermark position set to: ${
                position === 'both' ? 'Both Header & Footer' :
                position === 'header' ? 'Header Only' :
                'Footer Only'
            }`,
            show_alert: false
        });
    } else if (data.startsWith('watermark_size_')) {
        const size = data.replace('watermark_size_', '');
        updateUserConfig(chatId, { watermarkSize: size });

        // Update the keyboard to show the new selection
        const createSizeButton = (btnSize, label) => {
            const isSelected = btnSize === size;
            return {
                text: `${label}${isSelected ? ' ✅' : ''}`,
                callback_data: `watermark_size_${btnSize}`
            };
        };

        const options = {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [createSizeButton('small', '📝 Small')],
                    [createSizeButton('medium', '📝 Medium')],
                    [createSizeButton('large', '📝 Large')],
                    [createSizeButton('big', '📝 Big')],
                    [createSizeButton('extra_large', '📝 Extra Large')]
                ]
            }
        };

        let responseText = '📏 Select watermark size:';
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: `✅ Watermark size set to: ${size.replace('_', ' ').toUpperCase()}`
        });
        await bot.editMessageText(responseText, options);
    } else if (data.startsWith('watermark_text_size:')) {
        const textSize = data.replace('watermark_text_size:', '');
        
        // Update user config
        updateUserConfig(chatId, { watermarkTextSize: textSize });

        // Update keyboard to show selection
        const createTextSizeButton = (btnTextSize, label) => {
            const isSelected = btnTextSize === textSize;
            return {
                text: `${label}${isSelected ? ' ✅' : ''}`,
                callback_data: `watermark_text_size:${btnTextSize}`
            };
        };

        const options = {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: Object.entries(WATERMARK_TEXT_SIZES).map(([size, details]) => [
                    createTextSizeButton(size, details.name)
                ])
            }
        };

        // Update message with new keyboard
        await bot.editMessageText(
            '📏 Select Watermark Text Size:\n\n' +
            'Current size: ' + WATERMARK_TEXT_SIZES[textSize].name,
            options
        );

        // Send confirmation message
        bot.answerCallbackQuery(callbackQuery.id, {
            text: `Watermark text size set to: ${WATERMARK_TEXT_SIZES[textSize].name}`,
            show_alert: false
        });
    }
});

// Function to download JSON files if missing
async function downloadJSONFiles() {
    const API_ENDPOINT = 'https://maxboxshare.com/cron.php';
    
    try {
        // Check and create apis directory if it doesn't exist
        if (!fs.existsSync('./apis')) {
            fs.mkdirSync('./apis', { recursive: true });
        }

        // Function to handle file synchronization
        async function syncFile(fileName, localPath) {
            try {
                const fileType = fileName.replace('.json', '');
                
                // If local file exists, upload it to server
                if (fs.existsSync(localPath)) {
                    const localData = JSON.parse(fs.readFileSync(localPath, 'utf8'));
                    await axios.post(`${API_ENDPOINT}?file=${fileType}`, localData);
                    console.log(`Uploaded ${fileName} to server`);
                } else {
                    // If local file doesn't exist, download from server
                    const response = await axios.get(`${API_ENDPOINT}?file=${fileType}`);
                    if (response.data && !response.data.error) {
                        fs.writeFileSync(localPath, JSON.stringify(response.data, null, 2));
                        console.log(`Downloaded ${fileName} from server`);
                    }
                }
            } catch (error) {
                console.error(`Error syncing ${fileName}:`, error.message);
            }
        }

        // Sync both files
        await Promise.all([
            syncFile('config.json', CONFIG_FILE),
            syncFile('apis.json', API_KEYS_FILE)
        ]);

        // Set up interval for continuous sync (every second)
        setInterval(async () => {
            try {
                // Read current local files
                const configData = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : null;
                const apisData = fs.existsSync(API_KEYS_FILE) ? JSON.parse(fs.readFileSync(API_KEYS_FILE, 'utf8')) : null;

                // Upload to server if local files exist
                if (configData) {
                    await axios.post(`${API_ENDPOINT}?file=config`, configData);
                }
                if (apisData) {
                    await axios.post(`${API_ENDPOINT}?file=apis`, apisData);
                }
            } catch (error) {
                console.error('Error in sync interval:', error.message);
            }
        }, 1000);

    } catch (error) {
        console.error('Error in downloadJSONFiles:', error.message);
    }
}

// Initialize files on startup
downloadJSONFiles();

// Express server setup
const PORT = process.env.PORT || 3000;
app.use(express.json());

// Serve JSON files with proper headers
app.get('/apis.json', (req, res) => {
    if (fs.existsSync(API_KEYS_FILE)) {
        res.setHeader('Content-Type', 'application/json');
        res.sendFile(path.resolve(API_KEYS_FILE));
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

app.get('/config.json', (req, res) => {
    if (fs.existsSync(CONFIG_FILE)) {
        res.setHeader('Content-Type', 'application/json');
        res.sendFile(path.resolve(CONFIG_FILE));
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Start Express server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Access APIs at http://localhost:${PORT}/apis.json`);
    console.log(`Access Config at http://localhost:${PORT}/config.json`);
});