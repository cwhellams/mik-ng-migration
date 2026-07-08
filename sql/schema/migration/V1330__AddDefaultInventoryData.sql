-- ============================================================
-- V1330__AddDefaultInventoryData
-- ============================================================

INSERT INTO inventory.categories (category_id, name, description, is_active, sort_order, created_by, updated_by)
VALUES
  (
    'INV_CLEAN',
    '{"en": "Cleaning Supplies", "fi": "Siivoustarvikkeet", "sv": "Rengöringsartiklar"}'::JSONB,
    '{"en": "Cleaning supplies, waxes, polishing cloths", "fi": "Puhdistustarvikkeet, vahat, kiillotusliinait", "sv": "Rengöringsmedel, vaxer, poleringsdukar"}'::JSONB,
    TRUE, 10, 'k1mnimda', 'k1mnimda'
  ),
  (
    'INV_TOOLS',
    '{"en": "Tools", "fi": "Työkalut", "sv": "Verktyg"}'::JSONB,
    '{"en": "Hand tools, power tools and workshop equipment", "fi": "Käsityökalut, sähkötyökalut ja verstaslaitteet", "sv": "Handverktyg, elverktyg och verkstadsutrustning"}'::JSONB,
    TRUE, 20, 'k1mnimda', 'k1mnimda'
  ),
  (
    'INV_ELEC',
    '{"en": "Electronic Equipment", "fi": "Elektroniikka", "sv": "Elektronisk utrustning"}'::JSONB,
    '{"en": "iPads, headsets, tablets and other electronic devices", "fi": "iPadit, kuulokkeet, tabletit ja muut elektroniset laitteet", "sv": "iPads, headset, surfplattor och annan elektronisk utrustning"}'::JSONB,
    TRUE, 30, 'k1mnimda', 'k1mnimda'
  ),
  (
    'INV_PARTS',
    '{"en": "Aircraft Parts", "fi": "Lentokonevaraosat", "sv": "Flygplansdelar"}'::JSONB,
    '{"en": "Spare parts and consumables for aircraft maintenance", "fi": "Varaosat ja kulutustarvikkeet lentokoneiden huoltoon", "sv": "Reservdelar och förbrukningsvaror för flygplansunderhåll"}'::JSONB,
    TRUE, 40, 'k1mnimda', 'k1mnimda'
  ),
  (
    'INV_OTHER',
    '{"en": "Other", "fi": "Muut", "sv": "Övrigt"}'::JSONB,
    '{"en": "Miscellaneous inventory items", "fi": "Muut varastotuotteet", "sv": "Övriga lagerartiklar"}'::JSONB,
    TRUE, 50, 'k1mnimda', 'k1mnimda'
  );

INSERT INTO inventory.locations (location_id, name, description, is_active, sort_order, created_by, updated_by)
VALUES
  (
    'LOC_MALMI',
    '{"en": "Malmi Hangar", "fi": "Malmin hangaari", "sv": "Malmis hangaren"}'::JSONB,
    '{"en": "Storage at Helsinki-Malmi Airport hangar", "fi": "Varasto Helsinki-Malmin lentokentän hangaarissa", "sv": "Förvaring i Helsingfors-Malmis flygplatshangar"}'::JSONB,
    TRUE, 10, 'k1mnimda', 'k1mnimda'
  ),
  (
    'LOC_EFNU',
    '{"en": "EFNU", "fi": "EFNU", "sv": "EFNU"}'::JSONB,
    '{"en": "Storage at EFNU (Nummela) aerodrome", "fi": "Varasto EFNU:n (Nummela) lentopaikalla", "sv": "Förvaring vid EFNU (Nummela) flygfält"}'::JSONB,
    TRUE, 20, 'k1mnimda', 'k1mnimda'
  );
