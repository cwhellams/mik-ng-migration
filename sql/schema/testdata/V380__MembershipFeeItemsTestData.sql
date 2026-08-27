-- Membership fee/joining-fee accounting items, mirroring the real accts.items
-- catalog. Local/test environments had none of these, so anything that reads
-- them via getArticleFees() (e.g. GET /auth/joining-fees, the recurring fees
-- invoice creator) saw an empty result instead of real prices.
--
-- markup_type 'fixed' means resolveArticlePrice() reads markup_value for the
-- price, with price_per_unit left at 0 — see apps/backend/src/services/accounting/articlePricing.ts.
--
-- Codes are read by apps/backend/src/services/accounting/config.ts:
--   JASEN = full member annual fee, NJASEN = junior annual fee, KJASEN = supporting member annual fee
--   LIITTYMINEN = full member joining fee, NLIITTYMINEN = junior joining fee
-- UUSJASEN/UUSNUORISO/UUSKJASEN are the combined "welcome" joining+first-year-fee
-- articles used on the new-member invoice.
INSERT INTO accts.items (id, code, name, item)
VALUES
  (45, 'UUSJASEN', 'Tervetuloa Malmin ilmailukerhoon! Liittymis- ja jäsenmaksu',
    '{"code": "UUSJASEN", "unit": "kpl", "markup_type": "fixed", "markup_value": 210.00, "price_per_unit": 0, "amount": 1}'),
  (46, 'UUSNUORISO', 'Nuorisojäsenen liittymis- ja jäsenmaksu',
    '{"code": "UUSNUORISO", "unit": "kpl", "markup_type": "fixed", "markup_value": 75.00, "price_per_unit": 0, "amount": 1}'),
  (47, 'UUSKJASEN', 'Kannatusjäsenen liittymis- ja jäsenmaksu',
    '{"code": "UUSKJASEN", "unit": "kpl", "markup_type": "fixed", "markup_value": 110.00, "price_per_unit": 0, "amount": 1}'),
  (48, 'JASEN', 'Jäsenmaksu',
    '{"code": "JASEN", "unit": "kalenterivuosi", "markup_type": "fixed", "markup_value": 85.00, "price_per_unit": 0, "amount": 1}'),
  (49, 'KJASEN', 'kannatusjäsenmaksu',
    '{"code": "KJASEN", "unit": "kalenterivuosi", "markup_type": "fixed", "markup_value": 85.00, "price_per_unit": 0, "amount": 1}'),
  (50, 'NJASEN', 'Nuorisojäsenmaksu',
    '{"code": "NJASEN", "unit": "kalenterivuosi", "markup_type": "fixed", "markup_value": 50.00, "price_per_unit": 0, "amount": 1}'),
  (51, 'NLIITTYMINEN', 'Nuorisojäsenen liittymismaksu',
    '{"code": "NLIITTYMINEN", "unit": "kpl", "markup_type": "fixed", "markup_value": 25.00, "price_per_unit": 0, "amount": 1}'),
  (76, 'LIITTYMINEN', 'Liittymismaksu',
    '{"code": "LIITTYMINEN", "unit": "kpl", "markup_type": "fixed", "markup_value": 125.00, "price_per_unit": 0, "amount": 1}');
