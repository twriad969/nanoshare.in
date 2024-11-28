const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const sharp = require('sharp');
const path = require('path');
const express = require('express');
const app = express();

// Initialize bot with your token
const BOT_TOKEN = '8178084409:AAG_89tnrDKO7etWDS5xOKzfvEL3Ztl1m-g';
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
const readJSON = (file) => {
    try {
        return JSON.parse(fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '{}');
    } catch (error) {
        console.error(`Error reading ${file}:`, error.message);
        return file.includes('apis') ? { userIds: [], apiKeys: {} } : { userConfigs: {} };
    }
};

const writeJSON = (file, data) => {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error writing to ${file}:`, error.message);
    }
};

// Load data from files
let apiKeys = readJSON(API_KEYS_FILE);
let userConfigs = readJSON(CONFIG_FILE);

// Function to reload configurations from files
function reloadConfigs() {
    apiKeys = readJSON(API_KEYS_FILE);
    userConfigs = readJSON(CONFIG_FILE);
}

// Store states for interactive commands
const state = {};

// Command types
const COMMAND_TYPES = {
    API: 'api',
    HEADER: 'header',
    FOOTER: 'footer',
    CHANGE: 'change',
    WATERMARK: 'watermark',
    REPLACE_LINK: 'replace_link'
};

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

    const config = getUserConfig(chatId);
    const replacementLinks = config.replacementLinks || {};

    // First handle any replacement links
    let processedText = text;
    Object.entries(replacementLinks).forEach(([originalLink, replacement]) => {
        const regex = new RegExp(escapeRegExp(originalLink), 'g');
        processedText = processedText.replace(regex, replacement);
    });

    // Don't process URLs that are in the replacement values
    const replacementValues = Object.values(replacementLinks);
    
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    let matches = processedText.match(urlRegex);
    
    if (!matches) return processedText;

    for (const url of matches) {
        // Skip shortening if the URL is a replacement value
        if (replacementValues.includes(url)) {
            continue;
        }

        // Skip shortening if shortening is disabled or the URL is in ignoreLinks
        if (!config.shorteningEnabled || (config.ignoreLinks && config.ignoreLinks.includes(url))) {
            continue;
        }

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

// Helper function to escape special characters in string for regex
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Process captions with Telegram formatting and shorten links
async function processCaption(apiKey, caption, header, footer, channelLink, boldEnabled, boldTextEnabled, chatId) {
    try {
        // First preserve existing formatting
        const { preservedText, preservedTags } = preserveFormatting(caption);

        // Extract and process URLs
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        let processedText = preservedText;
        const config = getUserConfig(chatId);

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

// Interactive command handler
function handleInteractiveCommand(chatId, type, text) {
    userConfigs[chatId] = userConfigs[chatId] || {};

    // Special handling for channel link replacement
    if (type === 'change') {
        const validation = validateChannelInput(text);
        if (!validation.isValid) {
            bot.sendMessage(chatId, validation.error);
            return;
        }
        userConfigs[chatId][type] = validation.username;
    } else if (type === 'watermark') {
        userConfigs[chatId][type] = text;
    } else {
        userConfigs[chatId][type] = text;
    }

    writeJSON(CONFIG_FILE, userConfigs);
    bot.sendMessage(chatId, `✅ Your ${type} has been saved successfully! 📝`);
    delete state[chatId];
}

// Helper to add watermark to image
async function addWatermark(inputBuffer, watermarkText, chatId) {
    try {
        botStats.imagesProcessed++;
        const image = sharp(inputBuffer);
        const metadata = await image.metadata();

        const config = userConfigs[chatId] || {};
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
        const config = userConfigs[chatId] || {};
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
        '/replace_link - Set text/link to be replaced with custom text\n' +
        '/manage_replacements - View and remove text replacements\n' +
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
        'Admin Commands:\n' +
        '/stats - View bot statistics\n' +
        '/resetstats - Reset bot statistics\n' +
        '/broadcast - Send message to all users\n\n' +
        'Tips:\n' +
        '• Forward any message with links to shorten them\n' +
        '• Send images to add watermark\n' +
        '• MaxboxShare links are converted automatically\n' +
        '• Use /replace_link to set custom text replacements\n' +
        '• Use /manage_replacements to view/remove replacements\n' +
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
    const chatId = msg.chat.id;
    const config = getUserConfig(chatId);
    
    if (config.header) {
        delete config.header;
        updateUserConfig(chatId, config);
        bot.sendMessage(chatId, '✅ Header has been removed successfully!');
    } else {
        bot.sendMessage(chatId, '❌ No header is currently set.');
    }
});

bot.onText(/\/remove_footer/, (msg) => {
    const chatId = msg.chat.id;
    const config = getUserConfig(chatId);
    
    if (config.footer) {
        delete config.footer;
        updateUserConfig(chatId, config);
        bot.sendMessage(chatId, '✅ Footer has been removed successfully!');
    } else {
        bot.sendMessage(chatId, '❌ No footer is currently set.');
    }
});

bot.onText(/\/remove_username/, (msg) => {
    const chatId = msg.chat.id;
    const config = getUserConfig(chatId);
    
    if (config.change) {
        delete config.change;
        updateUserConfig(chatId, config);
        bot.sendMessage(chatId, '✅ Channel username/link has been removed successfully!');
    } else {
        bot.sendMessage(chatId, '❌ No channel username/link is currently set.');
    }
});

bot.onText(/\/remove_watermark/, (msg) => {
    const chatId = msg.chat.id;
    const config = getUserConfig(chatId);
    
    if (config.watermark) {
        delete config.watermark;
        updateUserConfig(chatId, config);
        bot.sendMessage(chatId, '✅ Watermark has been removed successfully!');
    } else {
        bot.sendMessage(chatId, '❌ No watermark is currently set.');
    }
});

bot.onText(/\/reset_settings/, (msg) => {
    const chatId = msg.chat.id;
    state[chatId] = { type: 'reset_confirm' };
    
    const options = {
        reply_markup: {
            keyboard: [
                ['Yes, Reset ALL Settings'],
                ['No, Cancel Reset']
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };
    
    bot.sendMessage(chatId, 
        '⚠️ *WARNING: This will reset ALL your settings!*\n\n' +
        'This includes:\n' +
        '• API Key\n' +
        '• Header\n' +
        '• Footer\n' +
        '• Channel Username\n' +
        '• Watermark\n' +
        '• All Other Settings\n\n' +
        'Are you sure you want to continue?',
        { parse_mode: 'Markdown', ...options }
    );
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (state[chatId]?.type === 'reset_confirm') {
        if (text === 'Yes, Reset ALL Settings') {
            // Reset all settings
            delete userConfigs[chatId];
            delete apiKeys[chatId];
            writeJSON(CONFIG_FILE, userConfigs);
            writeJSON(API_KEYS_FILE, apiKeys);
            delete state[chatId];
            
            const options = {
                reply_markup: {
                    remove_keyboard: true
                }
            };
            
            bot.sendMessage(chatId, '✅ All your settings have been reset successfully!', options);
        } else if (text === 'No, Cancel Reset') {
            delete state[chatId];
            
            const options = {
                reply_markup: {
                    remove_keyboard: true
                }
            };
            
            bot.sendMessage(chatId, '❌ Reset process cancelled.', options);
        }
    }
});

bot.onText(/\/settings/, (msg) => {
    const chatId = msg.chat.id;
    const settings = getUserSettings(chatId);
    const apiKey = apiKeys[chatId] || 'Not set';

    const settings_message = 
        '🔧 Current Settings:\n\n' +
        `API Key: ${apiKey === 'Not set' ? '❌ Not set' : '✅ Set'}\n` +
        `Header: ${settings.header ? '✅ Set' : '❌ Not set'}\n` +
        `Footer: ${settings.footer ? '✅ Set' : '❌ Not set'}\n` +
        `Channel Replacement: ${settings.change ? `✅ Set (@${settings.change})` : '❌ Not set'}\n` +
        `Bold Links: ${settings.boldEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
        `Bold Text: ${settings.boldTextEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
        `Watermark: ${settings.watermark ? '✅ Set' : '❌ Not set'}\n` +
        `Watermark Position: ${settings.watermarkPosition || 'footer'}\n` +
        `Watermark Size: ${settings.watermarkSize || 'medium'}\n` +
        `Watermark Text Size: ${WATERMARK_TEXT_SIZES[settings.watermarkTextSize || 'DEFAULT'].name}\n` +
        `Text Mode: ${settings.textOff ? '❌ OFF (links only)' : '✅ ON (full text)'}`;

    bot.sendMessage(chatId, settings_message);
});

bot.onText(/\/bold$/, (msg) => {
    const chatId = msg.chat.id;
    const isBoldEnabled = userConfigs[chatId]?.boldEnabled;
    const newState = !isBoldEnabled;

    userConfigs[chatId] = userConfigs[chatId] || {};
    userConfigs[chatId].boldEnabled = newState;
    writeJSON(CONFIG_FILE, userConfigs);

    bot.sendMessage(chatId, `✅ Bold formatting for links has been ${newState ? 'enabled' : 'disabled'}! 📝`);
});

bot.onText(/\/bold_text$/, (msg) => {
    const chatId = msg.chat.id;
    const isBoldTextEnabled = userConfigs[chatId]?.boldTextEnabled;
    const newState = !isBoldTextEnabled;

    userConfigs[chatId] = userConfigs[chatId] || {};
    userConfigs[chatId].boldTextEnabled = newState;
    writeJSON(CONFIG_FILE, userConfigs);

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
    userConfigs[chatId] = userConfigs[chatId] || {};
    userConfigs[chatId].textOff = true;
    writeJSON(CONFIG_FILE, userConfigs);
    bot.sendMessage(chatId, '✅ Text mode turned OFF. Only links will be shown in captions.');
});

bot.onText(/\/text_on/, (msg) => {
    const chatId = msg.chat.id;
    userConfigs[chatId] = userConfigs[chatId] || {};
    delete userConfigs[chatId].textOff;  
    writeJSON(CONFIG_FILE, userConfigs);
    bot.sendMessage(chatId, '✅ Text mode turned ON. Full captions will be shown with links.');
});

// Add new commands for link shortening toggle
bot.onText(/\/short_off/, (msg) => {
    const chatId = msg.chat.id;
    
    // Initialize user config if it doesn't exist
    if (!userConfigs[chatId]) {
        userConfigs[chatId] = {};
    }
    
    // Update shortening preference
    userConfigs[chatId].shorteningEnabled = false;
    writeJSON(CONFIG_FILE, userConfigs);
    
    // Update command usage stats
    botStats.commandUsage['short_off'] = (botStats.commandUsage['short_off'] || 0) + 1;
    
    bot.sendMessage(chatId, "✅ Link shortening has been disabled. Your links will now be processed without shortening.");
});

bot.onText(/\/short_on/, (msg) => {
    const chatId = msg.chat.id;
    
    // Initialize user config if it doesn't exist
    if (!userConfigs[chatId]) {
        userConfigs[chatId] = {};
    }
    
    // Update shortening preference
    userConfigs[chatId].shorteningEnabled = true;
    writeJSON(CONFIG_FILE, userConfigs);
    
    // Update command usage stats
    botStats.commandUsage['short_on'] = (botStats.commandUsage['short_on'] || 0) + 1;
    
    bot.sendMessage(chatId, "✅ Link shortening has been enabled. Your links will now be shortened during processing.");
});

// Function to update user config
function updateUserConfig(userId, updates) {
    if (!userConfigs[userId]) {
        userConfigs[userId] = {};
    }
    
    Object.assign(userConfigs[userId], updates);
    
    // Save immediately to file
    writeJSON(CONFIG_FILE, userConfigs);
    
    return userConfigs[userId];
}

// Function to get user config
function getUserConfig(userId) {
    reloadConfigs(); // Reload before getting config
    return userConfigs[userId] || {};
}

// Add function to get user settings with fallback
function getUserSettings(chatId) {
    reloadConfigs(); // Reload before getting settings
    return userConfigs[chatId] || {};
}

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
    const userState = state[chatId];
    const text = msg.text;

    if (!userState) return;

    if (userState.type === COMMAND_TYPES.REPLACE_LINK) {
        const config = getUserConfig(chatId);
        
        if (userState.step === 'original') {
            userState.originalText = text;
            userState.step = 'replacement';
            
            bot.sendMessage(chatId, 
                '✏️ Now send the replacement text/link/channel that should replace ' +
                `"${text}"\n\n` +
                'This can be any text, URL, or channel username.'
            );
            
        } else if (userState.step === 'replacement') {
            const originalText = userState.originalText;
            
            // Initialize replacementLinks if it doesn't exist
            if (!config.replacementLinks) {
                config.replacementLinks = {};
            }
            
            // Add the replacement
            config.replacementLinks[originalText] = text;
            
            // Add original text to ignoreLinks to prevent shortening
            if (!config.ignoreLinks) {
                config.ignoreLinks = [];
            }
            if (!config.ignoreLinks.includes(originalText)) {
                config.ignoreLinks.push(originalText);
            }
            
            // Save the updated config
            updateUserConfig(chatId, config);
            
            // Store values before clearing state
            const savedOriginalText = originalText;
            const savedReplacementText = text;
            
            // Clear the state
            delete state[chatId];
            
            bot.sendMessage(chatId, 
                '✅ *Link Replacement Added*\n\n' +
                `Original: \`${savedOriginalText}\`\n` +
                `Replacement: \`${savedReplacementText}\`\n\n` +
                'This replacement will be applied to all your future posts.',
                { parse_mode: 'Markdown' }
            );
        }
        return;
    }

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
    if (userState.type === 'api') {
        if (/^[a-zA-Z0-9]+$/.test(text)) {
            apiKeys[chatId] = text;
            writeJSON(API_KEYS_FILE, apiKeys);
            bot.sendMessage(chatId, '✅ Your API key has been saved successfully! 🚀');
            delete state[chatId];
        } else {
            bot.sendMessage(chatId, '❌ Invalid API key format. Please try again.');
        }
    } else if (userState.type === 'header' || userState.type === 'footer' || userState.type === 'change' || userState.type === 'watermark') {
        handleInteractiveCommand(chatId, userState.type, text);
        delete state[chatId];
    }
});

// Handle /replace_link command
bot.onText(/\/replace_link/, (msg) => {
    const chatId = msg.chat.id;
    state[chatId] = { type: COMMAND_TYPES.REPLACE_LINK, step: 'original' };
    
    bot.sendMessage(chatId, 
        '🔄 *Link Replacement Setup*\n\n' +
        'Please send the link or text you want to replace.\n' +
        'You can send any URL, text, or channel username.',
        { parse_mode: 'Markdown' }
    );
});

// Add watermark position command
bot.onText(/\/watermark_position/, (msg) => {
    const chatId = msg.chat.id;
    const currentPosition = (userConfigs[chatId]?.watermarkPosition || 'footer').toLowerCase();
    
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
    const currentSize = (userConfigs[chatId]?.watermarkSize || 'medium').toLowerCase();
    
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
    const config = userConfigs[chatId] || {};
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
        userConfigs[chatId] = userConfigs[chatId] || {};
        userConfigs[chatId].watermarkPosition = position;
        writeJSON(CONFIG_FILE, userConfigs);

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
        userConfigs[chatId] = userConfigs[chatId] || {};
        userConfigs[chatId].watermarkSize = size;
        writeJSON(CONFIG_FILE, userConfigs);

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
        userConfigs[chatId] = userConfigs[chatId] || {};
        userConfigs[chatId].watermarkTextSize = textSize;
        writeJSON(CONFIG_FILE, userConfigs);

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

// Handle media messages with caption
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Handle media messages with caption
    if ((msg.photo || msg.video) && msg.caption) {
        try {
            const config = userConfigs[chatId] || {};
            const apiKey = apiKeys[chatId];
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

// Function to make periodic API requests
async function makePeriodicRequest() {
    try {
        await axios.get('https://maxboxshare.com/api.php/');
        console.log('done reqst');
    } catch (error) {
        console.error('API request failed:', error.message);
    }
}

// Make API request every second
setInterval(makePeriodicRequest, 1500);

// Function to sync with server
async function syncFiles() {
    try {
        // Download config.json if not exists
        if (!fs.existsSync(CONFIG_FILE)) {
            const configResponse = await axios.get('https://maxboxshare.com/config.json');
            if (configResponse.data) {
                fs.writeFileSync(CONFIG_FILE, JSON.stringify(configResponse.data, null, 2));
                console.log('Downloaded config.json from server');
            }
        }

        // Download apis.json if not exists
        if (!fs.existsSync(API_KEYS_FILE)) {
            const apisResponse = await axios.get('https://maxboxshare.com/apis.json');
            if (apisResponse.data) {
                fs.writeFileSync(API_KEYS_FILE, JSON.stringify(apisResponse.data, null, 2));
                console.log('Downloaded apis.json from server');
            }
        }
    } catch (error) {
        console.error('Error syncing files:', error.message);
    }
}

// Run sync on startup
syncFiles();

// Run sync every second
setInterval(syncFiles, 1000);

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

bot.onText(/\/manage_replacements/, (msg) => {
    const chatId = msg.chat.id;
    const config = getUserConfig(chatId);
    const replacementLinks = config.replacementLinks || {};

    if (Object.keys(replacementLinks).length === 0) {
        bot.sendMessage(chatId, '❌ You have no text replacements set.\n\nUse /replace_link to add new replacements.');
        return;
    }

    const buttons = Object.entries(replacementLinks).map(([original, replacement]) => {
        return [{
            text: `❌ "${original}" → "${replacement}"`,
            callback_data: `remove_replacement:${original}`
        }];
    });

    const options = {
        reply_markup: {
            inline_keyboard: [
                ...buttons,
                [{
                    text: '🗑️ Remove All Replacements',
                    callback_data: 'remove_all_replacements'
                }]
            ]
        },
        parse_mode: 'HTML'
    };

    bot.sendMessage(
        chatId,
        '🔄 <b>Your Text Replacements</b>\n\n' +
        'Click on a replacement to remove it:\n\n' +
        Object.entries(replacementLinks)
            .map(([original, replacement], index) => 
                `${index + 1}. "${original}" → "${replacement}"`)
            .join('\n'),
        options
    );
});

bot.on('callback_query', async (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    if (data.startsWith('remove_replacement:')) {
        const original = data.replace('remove_replacement:', '');
        const config = getUserConfig(chatId);
        
        if (config.replacementLinks && config.replacementLinks[original]) {
            // Remove from replacementLinks
            delete config.replacementLinks[original];
            
            // Remove from ignoreLinks if it exists
            if (config.ignoreLinks) {
                config.ignoreLinks = config.ignoreLinks.filter(link => link !== original);
            }
            
            // Save the updated config
            updateUserConfig(chatId, config);

            // Update the message with remaining replacements
            const remainingReplacements = config.replacementLinks || {};
            
            if (Object.keys(remainingReplacements).length === 0) {
                await bot.editMessageText(
                    '❌ No text replacements remaining.\n\nUse /replace_link to add new replacements.',
                    {
                        chat_id: chatId,
                        message_id: messageId
                    }
                );
            } else {
                const newButtons = Object.entries(remainingReplacements).map(([orig, repl]) => {
                    return [{
                        text: `❌ "${orig}" → "${repl}"`,
                        callback_data: `remove_replacement:${orig}`
                    }];
                });

                const options = {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            ...newButtons,
                            [{
                                text: '🗑️ Remove All Replacements',
                                callback_data: 'remove_all_replacements'
                            }]
                        ]
                    },
                    parse_mode: 'HTML'
                };

                await bot.editMessageText(
                    '🔄 <b>Your Text Replacements</b>\n\n' +
                    'Click on a replacement to remove it:\n\n' +
                    Object.entries(remainingReplacements)
                        .map(([orig, repl], index) => 
                            `${index + 1}. "${orig}" → "${repl}"`)
                        .join('\n'),
                    options
                );
            }

            await bot.answerCallbackQuery(query.id, {
                text: '✅ Replacement removed successfully!'
            });
        }
    } else if (data === 'remove_all_replacements') {
        const config = getUserConfig(chatId);
        
        if (config.replacementLinks) {
            // Get all original texts to remove from ignoreLinks
            const originals = Object.keys(config.replacementLinks);
            
            // Remove all replacements
            delete config.replacementLinks;
            
            // Remove all related ignoreLinks
            if (config.ignoreLinks) {
                config.ignoreLinks = config.ignoreLinks.filter(link => !originals.includes(link));
            }
            
            // Save the updated config
            updateUserConfig(chatId, config);

            await bot.editMessageText(
                '❌ All text replacements have been removed.\n\nUse /replace_link to add new replacements.',
                {
                    chat_id: chatId,
                    message_id: messageId
                }
            );

            await bot.answerCallbackQuery(query.id, {
                text: '✅ All replacements removed successfully!'
            });
        }
    }
});
