-- Aircraft pricing test data
-- Insert pricing for OH-STL (Diamond DA40NG)
INSERT INTO accts.aircraft_pricing (
                registration,
                valid_from,
                valid_to,
                price_per_min,
                created_by,
                notes
        )
VALUES (
                'OH-STL',
                '2010-01-01',
                NULL,
                3.60,
                'k1mnimda',
                'Initial pricing for OH-STL'
        );
-- Insert pricing for OH-IHQ (Diamond DV20)
INSERT INTO accts.aircraft_pricing (
                registration,
                valid_from,
                valid_to,
                price_per_min,
                created_by,
                notes
        )
VALUES (
                'OH-IHQ',
                '2010-01-01',
                NULL,
                2.45,
                'k1mnimda',
                'Initial pricing for OH-IHQ'
        );