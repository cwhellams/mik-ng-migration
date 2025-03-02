CREATE TABLE flight.aircraft
(
    registration VARCHAR(10) UNIQUE NOT NULL PRIMARY KEY,
    display_name VARCHAR(50) NOT NULL,
    model VARCHAR(50) NOT NULL,
    manufacturer VARCHAR(50) NOT NULL,
    year_of_manufacture INT NOT NULL,
    total_hours DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
    equipment VARCHAR(255)
);
