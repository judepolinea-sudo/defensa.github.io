-- Common SQL Queries for IntegrityLens AI Viva Simulator
-- Use these in phpMyAdmin to manage your data.

-- 1. View All Users
SELECT * FROM users;

-- 2. View All Students
SELECT * FROM users WHERE role = 'STUDENT';

-- 3. View All Faculty
SELECT * FROM users WHERE role = 'FACULTY';

-- 4. View All Admins
SELECT * FROM users WHERE role = 'ADMIN';

-- 5. View Session History with Student Names
SELECT 
    s.id, 
    u.fullName, 
    u.email, 
    s.projectTitle, 
    s.overallScore, 
    s.duration, 
    s.questionsAnswered, 
    s.date 
FROM sessions s 
JOIN users u ON s.userId = u.id 
ORDER BY s.date DESC;

-- 6. Get Average Score per Student
SELECT 
    u.fullName, 
    AVG(s.overallScore) as average_score, 
    COUNT(s.id) as total_sessions 
FROM sessions s 
JOIN users u ON s.userId = u.id 
GROUP BY u.id;

-- 7. Update a User's Role (e.g., promote to Admin)
-- UPDATE users SET role = 'ADMIN' WHERE email = 'example@nu-clark.edu.ph';

-- 8. Delete a User and their Sessions (Cascade delete handled by schema)
-- DELETE FROM users WHERE id = 123;

-- 9. Search for a specific project session
-- SELECT * FROM sessions WHERE projectTitle LIKE '%AI%';

-- 10. Get top performing students
-- SELECT u.fullName, MAX(s.overallScore) as top_score FROM sessions s JOIN users u ON s.userId = u.id GROUP BY u.id ORDER BY top_score DESC LIMIT 10;
