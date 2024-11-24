# Telegram Watermark Bot

A Telegram bot that processes images with watermarks and handles link shortening.

## Features

- Image watermarking with customizable:
  - Position (footer, header, both)
  - Size (small, medium, large, extra large)
  - Text size
- Link processing and shortening
- Admin broadcast functionality
- User configuration management
- Statistics tracking

## Prerequisites

- Node.js >= 14.0.0
- NPM or Yarn package manager

## Installation

1. Clone the repository:
```bash
git clone [your-repository-url]
cd [repository-name]
```

2. Install dependencies:
```bash
npm install
```

3. Create configuration files:
   - Create `config.json` for user configurations
   - Create `apis.json` for API keys and user IDs

4. Set up your Telegram Bot Token:
   - Get a token from [@BotFather](https://t.me/botfather)
   - Update the `BOT_TOKEN` in `index.js`

## Running the Bot

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### Using PM2 (Recommended for 24/7 operation)
```bash
npm run pm2
```

## Configuration

### apis.json structure:
```json
{
  "userIds": [],
  "apiKeys": {}
}
```

### config.json structure:
```json
{
  "userConfigs": {}
}
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
