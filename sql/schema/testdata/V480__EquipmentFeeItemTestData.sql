-- Equipment fee (KALUSTO) accounting item, mirroring the real accts.items catalog.
-- Unlike the membership fee items seeded in V380__MembershipFeeItemsTestData.sql,
-- this one had no migration at all — it only ever existed locally because
-- apps/backend/test/db/invoicing-queries.test.ts's "getAnnualEquipmentFee" suite
-- deletes and then re-inserts it mid-run as a side effect of testing the "not
-- found" case, so anything that reads it via getEquipmentFee()/getAnnualEquipmentFee()
-- (e.g. GET /v1/prices/public, the equipment-fee dashboard banner) depended on
-- that other suite having already run, or on a stale local database, rather than
-- on committed seed data.
--
-- id 40. Three separate constraints ruled out other candidates:
--   * id 20 (this test file's original hardcoded restore value) is already
--     an aircraft-pricing row (OH-STL), which made that test's "restore"
--     insert a silent no-op via onConflict doNothing; fixed by switching
--     that test's restore insert to id 40 as well.
--   * anything > 76 is swept as test-created data between SimplBooks-flow
--     tests — see the comment on deleteCreatedInvoiceItems() in
--     test/db/__helpers__/simplbooksDbHelpers.ts.
--   * ids 52-56/60/61 are hardcoded article ids returned by the SimplBooks
--     /articles/list mock in test/__mocks__/simplbooksMock.ts; a sync test
--     upserts them by id and would silently overwrite this row's code.
INSERT INTO accts.items (id, code, name, item)
VALUES
  (40, 'KALUSTO', 'Kalustomaksu',
    '{"id": 40, "code": "KALUSTO", "name": "Kalustomaksu", "unit": "kpl", "markup_value": 135, "active": true, "amount": 1, "ean": "", "contents": "Test equipment fee", "price_per_unit": 0, "markup_type": "fixed", "is_inventory": false, "sales_vat_type_id": 0, "purchase_vat_type_id": 0}')
ON CONFLICT (id) DO NOTHING;
