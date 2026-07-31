-- ============================================================
-- V250__ShopOrdersTestData
--
-- Test data for exercising PR #1012 (shop UX / VAT removal / order
-- status / order notification email changes): products across both
-- product types, a discount code, and orders covering every
-- shop.order_status value (including the new INVOICE_PAID status).
-- ============================================================

-- ----------------------------------------------------------------
-- Products
-- ----------------------------------------------------------------
INSERT INTO shop.products (
        product_id, category_id, simplbooks_item_id, product_type,
        name, description, price, vat_percent, stock_quantity,
        low_stock_threshold, max_order_quantity, is_active, is_published,
        tags, image_url, created_by, updated_by
    )
VALUES (
        'PRD00001', 'MERCH', 'ITEM-TSHIRT', 'STANDARD',
        '{"en": "Club T-Shirt", "fi": "Kerhopaita", "sv": "Klubbtröja"}'::JSONB,
        '{"en": "Cotton club t-shirt with logo", "fi": "Puuvillainen kerhopaita logolla", "sv": "Bomullströja med klubbmärke"}'::JSONB,
        25.00, 0, 40, 5, 5, TRUE, TRUE,
        '{"clothing"}', NULL, 'k1mnimda', 'k1mnimda'
    ),
    (
        'PRD00002', 'MAPS', 'ITEM-VFRMAP', 'STANDARD',
        '{"en": "VFR Chart - Finland South", "fi": "VFR-kartta - Etelä-Suomi", "sv": "VFR-karta - Södra Finland"}'::JSONB,
        '{"en": "Current edition VFR chart", "fi": "Ajantasainen VFR-kartta", "sv": "Aktuell VFR-karta"}'::JSONB,
        18.50, 0, 15, 3, NULL, TRUE, TRUE,
        '{"charts"}', NULL, 'k1mnimda', 'k1mnimda'
    ),
    (
        'PRD00003', 'MISC', NULL, 'STANDARD',
        '{"en": "Out of Stock Cap", "fi": "Loppunut lippis", "sv": "Slutsåld keps"}'::JSONB,
        '{"en": "Embroidered cap - currently out of stock", "fi": "Kirjailtu lippis - ei varastossa", "sv": "Broderad keps - slut i lager"}'::JSONB,
        15.00, 0, 0, 3, NULL, TRUE, TRUE,
        '{"clothing"}', NULL, 'k1mnimda', 'k1mnimda'
    ),
    (
        'PRDFH0001', 'FLT_PKG', 'ITEM-FH10', 'FLIGHT_HOURS_PACKAGE',
        '{"en": "10 Hour Flight Package - PA28", "fi": "10 tunnin lentopaketti - PA28", "sv": "10 timmars flygpaket - PA28"}'::JSONB,
        '{"en": "Prepaid 10 flight hours on PA28", "fi": "Esimaksettu 10 lentotuntia PA28:lla", "sv": "Förbetald 10 flygtimmar PA28"}'::JSONB,
        1450.00, 0, 999, NULL, 1, TRUE, TRUE,
        '{"flight-hours"}', NULL, 'k1mnimda', 'k1mnimda'
    );

-- ----------------------------------------------------------------
-- Discount code
-- ----------------------------------------------------------------
INSERT INTO shop.discount_codes (
        code, description, discount_type, discount_value,
        min_order_amount, max_uses, uses_count, valid_from, valid_until,
        is_active, created_by, updated_by
    )
VALUES (
        'TEST10', 'Test 10% discount code', 'percent', 10.00,
        NULL, 100, 2, NOW() - INTERVAL '30 days', NOW() + INTERVAL '30 days',
        TRUE, 'k1mnimda', 'k1mnimda'
    );

-- ----------------------------------------------------------------
-- Orders covering every shop.order_status value
-- ----------------------------------------------------------------
INSERT INTO shop.orders (
        order_id, member_id, status, total_amount, discount_code_id,
        discount_amount, invoice_id, notes, created_at, updated_at,
        created_by, updated_by
    )
VALUES (
        'ORD000001', 'Matti1', 'PENDING', 43.50, NULL, NULL, NULL,
        NULL, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days',
        'Matti1', 'Matti1'
    ),
    (
        'ORD000002', 'Matti1', 'PROCESSING', 18.50, NULL, NULL, NULL,
        NULL, NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days',
        'Matti1', 'k1mnimda'
    ),
    (
        'ORD000003', 'Liisa1', 'INVOICED', 25.00, NULL, NULL, NULL,
        NULL, NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days',
        'Liisa1', 'k1mnimda'
    ),
    (
        'ORD000004', 'Liisa1', 'INVOICE_PAID', 1450.00, NULL, NULL, NULL,
        'Paid via bank transfer', NOW() - INTERVAL '20 days', NOW() - INTERVAL '18 days',
        'Liisa1', 'k1mnimda'
    ),
    (
        'ORD000005', 'Jukka1', 'CANCELLED', 15.00, NULL, NULL, NULL,
        'Customer requested cancellation', NOW() - INTERVAL '15 days', NOW() - INTERVAL '14 days',
        'Jukka1', 'k1mnimda'
    ),
    (
        'ORD000006', 'Anna1', 'REFUNDED', 39.15, 1, 4.35, NULL,
        'Refunded - wrong size', NOW() - INTERVAL '25 days', NOW() - INTERVAL '23 days',
        'Anna1', 'k1mnimda'
    );

-- ----------------------------------------------------------------
-- Order items
-- ----------------------------------------------------------------
INSERT INTO shop.order_items (
        order_id, product_id, quantity, unit_price, total_price,
        selected_options, product_snapshot
    )
VALUES (
        'ORD000001', 'PRD00001', 1, 25.00, 25.00, NULL,
        '{"en": "Club T-Shirt", "fi": "Kerhopaita", "sv": "Klubbtröja", "price": 25.00}'::JSONB
    ),
    (
        'ORD000001', 'PRD00002', 1, 18.50, 18.50, NULL,
        '{"en": "VFR Chart - Finland South", "fi": "VFR-kartta - Etelä-Suomi", "sv": "VFR-karta - Södra Finland", "price": 18.50}'::JSONB
    ),
    (
        'ORD000002', 'PRD00002', 1, 18.50, 18.50, NULL,
        '{"en": "VFR Chart - Finland South", "fi": "VFR-kartta - Etelä-Suomi", "sv": "VFR-karta - Södra Finland", "price": 18.50}'::JSONB
    ),
    (
        'ORD000003', 'PRD00001', 1, 25.00, 25.00, NULL,
        '{"en": "Club T-Shirt", "fi": "Kerhopaita", "sv": "Klubbtröja", "price": 25.00}'::JSONB
    ),
    (
        'ORD000004', 'PRDFH0001', 1, 1450.00, 1450.00, NULL,
        '{"en": "10 Hour Flight Package - PA28", "fi": "10 tunnin lentopaketti - PA28", "sv": "10 timmars flygpaket - PA28", "price": 1450.00}'::JSONB
    ),
    (
        'ORD000005', 'PRD00003', 1, 15.00, 15.00, NULL,
        '{"en": "Out of Stock Cap", "fi": "Loppunut lippis", "sv": "Slutsåld keps", "price": 15.00}'::JSONB
    ),
    (
        'ORD000006', 'PRD00001', 1, 25.00, 25.00, NULL,
        '{"en": "Club T-Shirt", "fi": "Kerhopaita", "sv": "Klubbtröja", "price": 25.00}'::JSONB
    ),
    (
        'ORD000006', 'PRD00002', 1, 18.50, 18.50, NULL,
        '{"en": "VFR Chart - Finland South", "fi": "VFR-kartta - Etelä-Suomi", "sv": "VFR-karta - Södra Finland", "price": 18.50}'::JSONB
    );

-- ----------------------------------------------------------------
-- A cart with an item for Matti1, to exercise the cart badge / "View Cart" flows
-- ----------------------------------------------------------------
INSERT INTO shop.carts (cart_id, member_id, discount_code_id)
VALUES ('CART00001', 'Matti1', NULL);

INSERT INTO shop.cart_items (cart_id, product_id, quantity, selected_options)
VALUES ('CART00001', 'PRD00002', 2, NULL);
