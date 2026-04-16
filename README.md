> **Archived**
>
> Moved to https://gitlab.com/team-paissa/paissa-house

<img align="left" width="70" height="70" src="https://zhu.codes/assets/PaissaLogo.c38c9420.png" alt="PaissaDB Logo">

# PaissaHouse

An unofficial Discord bot for housing in Final Fantasy XIV (FFXIV, FF14) to
display data from [PaissaDB](https://zhu.codes/paissa).

<img height="600" src="https://filedn.eu/l1k9l7NzagvkkVpPyvEflCm/PaissaHouse/Results_Paginated.png" alt="PaissaDB Logo">

## Add the bot to your server

[Click here](https://discord.com/oauth2/authorize?client_id=1425410120568803400&permissions=281600&integration_type=0&scope=bot+applications.commands)
to add the bot to your server.

## Commands

- `/help` - Get information about this bot and how to use it.
- `/paissa` - Get detailed housing information.
- `/announcement` - Configure a text channel to receive housing phase
  announcements.

## Transparency

All code is open source, and the Docker images are built directly from the
GitHub repository. Every image is tagged with its commit SHA, allowing for
complete transparency between the published code and deployed bot.

## For developers

### Initial Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Tancred423/FFXIV_PaissaHouseDiscordBot.git
   cd FFXIV_PaissaHouseDiscordBot
   ```

2. **Create a Discord application**:
   - Go to https://discord.com/developers/applications
   - Create a new application
   - Go to the "Bot" section and create a bot
   - Reset & copy the bot token
   - Copy the application ID (Client ID)

3. **Set up application emojis**:
   - Still on https://discord.com/developers/applications with your app selected
   - Go to the "Emojis" section
   - Upload the emojis from the `/emotes` directory, or create your own ones
   - Copy the markdown of the emojis

4. **Set up environment variables**:
   - Copy the skeleton file and fill in your values:
   ```bash
   cp .env.skel .env
   ```
   - Fill in your Discord bot token, application ID, and emoji markdowns you've
     copied above.
   - The MySQL credentials should match what you set in your MySQL server.

### MySQL Database Setup

This bot requires a MySQL database. You can set up a standalone MySQL server
that can be shared across multiple applications:

1. **Create MySQL server directory**:
   ```bash
   mkdir -p ~/mysql-server && cd ~/mysql-server
   ```

2. **Create docker-compose.yml**:
   ```bash
   cat > docker-compose.yml << 'EOF'
   services:
     mysql:
       image: mysql:8.0
       container_name: mysql-server
       restart: unless-stopped
       environment:
         MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
         MYSQL_DATABASE: paissa_bot
         MYSQL_USER: ${MYSQL_USER}
         MYSQL_PASSWORD: ${MYSQL_PASSWORD}
       ports:
         - "127.0.0.1:3306:3306"
       volumes:
         - mysql_data:/var/lib/mysql
       networks:
         - mysql-network
       command: --default-authentication-plugin=mysql_native_password

     phpmyadmin:
       image: phpmyadmin:latest
       container_name: phpmyadmin
       restart: unless-stopped
       environment:
         PMA_HOST: mysql
         PMA_PORT: 3306
         PMA_ARBITRARY: 1
       ports:
         - "127.0.0.1:8082:80" # Might wanna change the port depending on your setup
       networks:
         - mysql-network
       depends_on:
         - mysql

   volumes:
     mysql_data:
       name: mysql_data

   networks:
     mysql-network:
       name: mysql-network
       driver: bridge
   EOF
   ```

3. **Create .env file for MySQL**:
   ```bash
   cat > .env << 'EOF'
   MYSQL_ROOT_PASSWORD=CHANGE_ME_STRONG_ROOT_PASSWORD
   MYSQL_USER=paissa_user
   MYSQL_PASSWORD=CHANGE_ME_STRONG_USER_PASSWORD
   EOF
   ```

4. Edit with strong passwords
   ```bash
   nano .env
   ```

5. **Start MySQL server**:
   ```bash
   docker compose up -d
   ```

6. **Access phpMyAdmin via SSH Tunnel**:

   phpMyAdmin is only accessible through an SSH tunnel, keeping it completely
   isolated from the internet for maximum security. On your local machine
   (adjust port if needed):
   ```bash
   ssh -L 8082:localhost:8082 user@your-server
   ```
   While the tunnel is active, open in your browser: `http://localhost:8082`
   (adjust port if needed) Login with your MySQL credentials (username:
   `paissa_user`, password from `.env`)

The bot will automatically connect to the MySQL server via the `mysql-network`
Docker network. phpMyAdmin provides a user-friendly interface to browse tables,
run queries, export data, and manage your databases without using the command
line.

### Development Setup

For development, use the `docker-compose.dev.yml` file which includes a local
MySQL container and enables hot reloading. This keeps your development
environment isolated from production.

1. **Start development environment** (bot + MySQL):
   ```bash
   docker compose up -d --build
   ```

2. **Register development commands** (guild-specific):
   ```bash
   docker run --rm --env-file .env -e REGISTER_COMMANDS=true -e ENVIRONMENT=development paissa-house-discord-bot-dev
   ```

3. **View logs**:

   Bot logs
   ```bash
   docker logs -f paissa-house-bot-dev
   ```

   MySQL logs
   ```bash
   docker logs -f mysql-dev
   ```

4. **Hot reloading**:
   - Changes to files in the `src` directory are automatically available
   - The bot will restart automatically on file changes
   - Database schema changes require restart:
     `docker compose -f docker-compose.dev.yml restart bot`

5. **Access development database**:
   - **Via CLI**: `docker exec -it mysql-dev mysql -u paissa_user -p` (use
     password from your `.env`)
   - **Via phpMyAdmin**: Access `http://localhost:8080` in your browser and
     login with the credentials from your `.env`

6. **Clean up**:

   Stop containers
   ```bash
   docker compose down
   ```

   Stop and remove volumes (wipes dev database)
   ```bash
   docker compose down -v
   ```

### Production Setup

For production, use the default `docker-compose.yml` file which uses the
pre-built image from GitHub Container Registry:

1. **Update the GitHub registry link** (important for forked repositories):
   - Open `docker-compose.yml` and modify the image path to point to your own
     registry:
   ```yaml
   image: ghcr.io/your-username/paissa-house-discord-bot:latest
   ```
   - The default image path
     (`ghcr.io/tancred423/paissa-house-discord-bot:latest`) is bound to the
     original repository owner's account.
   - If you're using the original repository without publishing your own images,
     you can skip this step.

2. **Set up GitHub repository variables and secrets** (for CI/CD workflow):
   - If you've forked this repository and want to use the GitHub Actions
     workflow, you need to set up:

     **Repository Variables:**
     - Go to your repository on GitHub → Settings → Secrets and variables →
       Actions → Variables
     - Create a new variable named `USERNAME_LOWERCASE` with your GitHub
       username in lowercase

     **Repository Secrets:**
     - Go to your repository on GitHub → Settings → Secrets and variables →
       Actions → Secrets
     - Set up the following secrets for deployment:
       - `SERVER_HOST`: The hostname or IP of your deployment server
       - `SERVER_USERNAME`: The SSH username for your deployment server
       - `DEPLOY_SSH_KEY`: The private SSH key for authentication with your
         server

   - These variables and secrets are used in the `.github/workflows/deploy.yml`
     file for building, pushing, and deploying the bot

3. **Start the production bot**:
   ```bash
   DEPLOYMENT_HASH=$(git rev-parse HEAD) docker compose up -f docker-compose.prod.yml -d
   ```

4. **Register global application commands**:
   ```bash
   docker run --rm --env-file .env -e REGISTER_COMMANDS=true -e ENVIRONMENT=production ghcr.io/tancred423/paissa-house-discord-bot:latest
   ```
