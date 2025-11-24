-- Test data for recurring fees processing
-- Insert test data for 2023 and 2024 annual fee processing runs
INSERT INTO accts.recurring_fees_processing (
        fee_type,
        year,
        status,
        created_at,
        updated_at,
        created_by,
        updated_by
    )
VALUES -- 2024 annual fee - processed
    (
        'annual_fee',
        2024,
        'processed',
        '2024-01-10 09:15:00',
        '2024-01-10 10:30:00',
        'Matti1',
        'Matti1'
    );