-- IntegrityLens AI Viva Simulator Database Schema
-- Use this file to set up your database in phpMyAdmin or any MySQL client.

-- 1. Create the database (if not already created)
CREATE DATABASE IF NOT EXISTS integritylens;
USE integritylens;

-- 2. Create the Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fullName VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL, -- 'STUDENT', 'FACULTY', 'ADMIN'
  program VARCHAR(100),
  yearLevel VARCHAR(50),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Create the Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  projectTitle VARCHAR(255),
  overallScore INT,
  duration INT, -- in seconds
  questionsAnswered INT,
  date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Optional: Insert an initial Admin user
-- Note: You should hash the password (e.g., using bcrypt) before inserting.
-- This is just an example. The password 'admin123' hashed is usually:
-- $2a$10$YourHashedPasswordHere
-- INSERT INTO users (fullName, email, password, role) 
-- VALUES ('System Admin', 'admin@nu-clark.edu.ph', 'hashed_password_here', 'ADMIN');

-- 5. Useful Queries for phpMyAdmin

-- Get all students
-- SELECT * FROM users WHERE role = 'STUDENT';

-- Get session history for a specific user
-- SELECT s.*, u.fullName FROM sessions s JOIN users u ON s.userId = u.id WHERE u.email = 'student@example.com';

-- Get average score per program
-- SELECT u.program, AVG(s.overallScore) as avg_score FROM sessions s JOIN users u ON s.userId = u.id GROUP BY u.program;
