-- Cost centre codes used to tag expense line items for reporting / SimplBooks Projects
CREATE TABLE accts.cost_centre (
    code        VARCHAR(50)  PRIMARY KEY,
    description TEXT         NOT NULL
);

INSERT INTO accts.cost_centre (code, description)
VALUES
    ('OH-IHQ', 'OH-IHQ'),
    ('OH-STL', 'OH-STL')
ON CONFLICT (code) DO NOTHING;

-- Tag each line item with an optional cost centre code
ALTER TABLE accts.expense_claim_line_item
    ADD COLUMN cost_centre_code VARCHAR(50) NULL REFERENCES accts
.cost_centre(code) ON DELETE SET NULL;
