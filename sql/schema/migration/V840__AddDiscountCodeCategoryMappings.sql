-- Allow discount codes to be restricted to one or more product categories.
CREATE TABLE IF NOT EXISTS shop.discount_code_categories (
    code_id      INTEGER    NOT NULL REFERENCES shop.discount_codes(code_id) ON DELETE CASCADE,
    category_id  VARCHAR(9) NOT NULL REFERENCES shop.categories(category_id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (code_id, category_id)
);
