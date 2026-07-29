# Database Setup Guide - IntegrityLens AI Viva Simulator

This application uses a **MySQL** database to store user information and practice session results.

## Local Development (XAMPP / WAMP / MAMP)

1.  **Start MySQL**: Open your XAMPP Control Panel and start the MySQL service.
2.  **Open phpMyAdmin**: Go to `http://localhost/phpmyadmin`.
3.  **Create Database**: Create a new database named `integritylens`.
4.  **Import Schema**:
    -   Select the `integritylens` database.
    -   Go to the **Import** tab.
    -   Choose the `schema.sql` file from the project root.
    -   Click **Go**.
5.  **Configure Environment**:
    -   Create a `.env` file in the project root (copy from `.env.example`).
    -   Set your database credentials:
        ```env
        DB_HOST=localhost
        DB_USER=root
        DB_PASSWORD=
        DB_NAME=integritylens
        JWT_SECRET=your_super_secret_jwt_key_here
        GEMINI_API_KEY=your_gemini_api_key_here
        ```
6.  **Run the App**:
    -   `npm install`
    -   `npm run dev`

## AI Studio Preview (Remote Database)

The AI Studio preview environment does not provide a local MySQL server. To use the database features in the preview, you must connect to a **remote MySQL database** (e.g., using a service like Aiven, PlanetScale, or a self-hosted server).

1.  **Get Remote DB Credentials**: Obtain the Host, User, Password, and Database Name from your provider.
2.  **Add Secrets**:
    -   In AI Studio, go to the **Settings** (⚙️ gear icon) -> **Secrets**.
    -   Add the following secrets:
        -   `DB_HOST`
        -   `DB_USER`
        -   `DB_PASSWORD`
        -   `DB_NAME`
        -   `JWT_SECRET`
        -   `GEMINI_API_KEY`
3.  **Restart App**: The application will automatically use these secrets to connect to your remote database.

## SQL Files

-   `schema.sql`: Contains the database structure (tables, relationships).
-   `queries.sql`: Contains common queries for managing your data in phpMyAdmin.
