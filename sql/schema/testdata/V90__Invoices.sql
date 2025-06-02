INSERT INTO accts.invoice (
  member_id, id, invoice_type, description, total_sum, currency, pmt_ref,
  sent_at, due_at, paid_at, created_at, updated_at, created_by, updated_by
)
VALUES
-- Paid invoice
('k1mnimda', 1001, 'ANNUAL_FEE', 'Annual membership fee 2025', 120.00, 'EUR', 'PMT1001',
 '2025-01-01', '2025-01-15', '2025-01-10', '2025-01-01 09:00:00', '2025-01-10 10:00:00', 'k1mnimda', 'k1mnimda'),

-- Unpaid, past due
('simplbks', 1002, 'FLIGHT', 'Flight time Jan', 75.00, 'EUR', 'PMT1002',
 '2025-01-10', '2025-01-25', NULL, '2025-01-10 12:00:00', '2025-01-25 12:00:00', 'simplbks', 'simplbks'),

-- Paid
('Anna1', 1003, 'INSTRUCTION', 'Instruction 2h', 60.00, 'EUR', 'PMT1003',
 '2025-03-01', '2025-03-10', '2025-03-08', '2025-03-01 08:30:00', '2025-03-08 10:00:00', 'Anna1', 'Anna1'),

-- Unpaid, due in future
('Kaisa1', 1004, 'EQUIPMENT_FEE', 'Hangar fee Q2', 150.00, 'EUR', 'PMT1004',
 '2025-05-01', '2025-06-01', NULL, '2025-05-01 10:00:00', '2025-05-01 10:00:00', 'Kaisa1', 'Kaisa1'),

-- Paid
('Juha1', 1005, 'MISC', 'Club BBQ ticket', 20.00, 'EUR', 'PMT1005',
 '2025-04-05', '2025-04-15', '2025-04-10', '2025-04-05 13:00:00', '2025-04-10 13:30:00', 'Juha1', 'Juha1'),

-- Paid
('Marja1', 1006, 'ANNUAL_FEE', 'Membership 2025', 120.00, 'EUR', 'PMT1006',
 '2025-01-01', '2025-01-15', '2025-01-14', '2025-01-01 09:15:00', '2025-01-14 09:00:00', 'Marja1', 'Marja1'),

-- Unpaid, future due
('Matti1', 2788, 'FLIGHT', 'OH-IHQ', 85.00, 'EUR', '252',
 '2020-02-06', '2020-05-06', '2020-03-02', '2025-05-20 09:00:00', '2025-05-20 09:00:00', 'Matti1', 'Matti1'),

-- Paid
('Liisa1', 1008, 'INSTRUCTION', 'Instruction session', 30.00, 'EUR', 'PMT1008',
 '2025-02-15', '2025-02-20', '2025-02-19', '2025-02-15 08:45:00', '2025-02-19 09:00:00', 'Liisa1', 'Liisa1'),

-- Past due, unpaid
('Jukka1', 1009, 'EQUIPMENT_FEE', 'Radio usage Q1', 18.00, 'EUR', 'PMT1009',
 '2025-01-01', '2025-01-15', NULL, '2025-01-01 07:00:00', '2025-01-15 08:00:00', 'Jukka1', 'Jukka1'),

-- Paid
('Pekka1', 1010, 'MISC', 'Towing fee', 25.00, 'EUR', 'PMT1010',
 '2025-03-20', '2025-03-30', '2025-03-25', '2025-03-20 11:00:00', '2025-03-25 11:00:00', 'Pekka1', 'Pekka1'),

-- Unpaid
('Antti1', 1011, 'FLIGHT', 'Flight time Apr', 55.00, 'EUR', 'PMT1011',
 '2025-04-01', '2025-04-15', NULL, '2025-04-01 10:00:00', '2025-04-01 10:00:00', 'Antti1', 'Antti1'),

-- Paid
('Sanna1', 1012, 'INSTRUCTION', 'Soaring techniques', 90.00, 'EUR', 'PMT1012',
 '2025-03-10', '2025-03-20', '2025-03-19', '2025-03-10 10:30:00', '2025-03-19 12:00:00', 'Sanna1', 'Sanna1');
