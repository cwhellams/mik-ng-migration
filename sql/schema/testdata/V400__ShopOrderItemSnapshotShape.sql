-- Bring the seeded order-item snapshots into the shape the app actually writes.
--
-- V250__ShopOrdersTestData.sql stored `product_snapshot` flat —
-- `{"en": …, "fi": …, "sv": …, "price": …}` — but `createOrderFromCart`
-- (apps/backend/src/db/shop-queries.ts) writes
-- `{"name": {"en": …, "fi": …, "sv": …}, "description": …, "price": …,
--   "simplbooksItemId": …}`, and everything that reads a snapshot looks under
-- `name`: the admin order detail page, and — since #1248 — the shop order
-- notification and the member's order confirmation email.
--
-- So every seeded order rendered as `Product #PRD00001`, which is the very
-- symptom #1248 is about. Rebuilt from the product row rather than hand-typed
-- so the names cannot drift from V250's products.
--
-- V250 itself is untouched: it is deployed, and Flyway checksums it.
UPDATE shop.order_items oi
SET product_snapshot = JSONB_BUILD_OBJECT(
        'name', p.name,
        'description', p.description,
        'price', oi.unit_price,
        'simplbooksItemId', p.simplbooks_item_id
    )
FROM shop.products p
WHERE p.product_id = oi.product_id
    AND NOT (oi.product_snapshot ? 'name');

-- The join above reaches only items whose product still exists. Anything left
-- keeps the names the flat snapshot already had, nested under `name`, rather
-- than staying in the shape that renders as `Product #<id>` — the symptom this
-- file exists to remove. No V250 order references a deleted product today, so
-- this is a no-op now; it is here so that a later testdata file which does
-- delete one cannot quietly reintroduce the bug.
UPDATE shop.order_items oi
SET product_snapshot = JSONB_BUILD_OBJECT(
        'name', oi.product_snapshot - ARRAY['price', 'description', 'simplbooksItemId'],
        'description', oi.product_snapshot -> 'description',
        'price', COALESCE(oi.product_snapshot -> 'price', TO_JSONB(oi.unit_price)),
        'simplbooksItemId', oi.product_snapshot -> 'simplbooksItemId'
    )
WHERE NOT (oi.product_snapshot ? 'name');
