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
- Docker (optional, for containerized deployment)

## Installation

### Standard Installation

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

### Docker Installation

1. Clone the repository:
```bash
git clone [your-repository-url]
cd [repository-name]
```

2. Build and run with Docker Compose:
```bash
docker-compose up -d
```

Or build and run manually:
```bash
docker build -t telegram-watermark-bot .
docker run -d \
  -e BOT_TOKEN=your_token \
  -e ADMIN_ID=your_admin_id \
  telegram-watermark-bot
```

## Running the Bot

### Standard Mode

#### Development
```bash
npm run dev
```

#### Production
```bash
npm start
```

#### Using PM2 (Recommended for 24/7 operation)
```bash
npm run pm2
```

### Docker Mode

#### Using Docker Compose (Recommended)
```bash
# Start the bot
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the bot
docker-compose down
```

#### Using Docker directly
```bash
# Build the image
docker build -t telegram-watermark-bot .

# Run the container
docker run -d \
  -e BOT_TOKEN=your_token \
  -e ADMIN_ID=your_admin_id \
  telegram-watermark-bot
```

## Configuration

### Environment Variables
```env
BOT_TOKEN=your_telegram_bot_token_here
ADMIN_ID=your_admin_telegram_id_here
PORT=3000 (optional)
```

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

## Deployment Platforms

### Back4app
1. Create a new container app
2. Push this repository to Back4app
3. Set the required environment variables
4. Deploy using the provided Dockerfile

### Heroku
Use the provided Procfile for deployment:
```bash
heroku create
git push heroku main
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
