-- ============================================================
-- V830__AddDefaultShopCategories
-- ============================================================

INSERT INTO shop.categories (category_id, name, description, is_active, sort_order, created_by, updated_by)
VALUES
  (
    'FLT_PKG',
    '{"en": "Flight Hours Package", "fi": "Lentotuntipaketti", "sv": "Flygtimmespaket"}'::JSONB,
    '{"en": "Prepaid flight hour packages for aircraft", "fi": "Esimax­setut lentotuntipaketit ilma-aluksille", "sv": "Förbetalda flygtimmespaket för luftfartyg"}'::JSONB,
    TRUE, 10, 'k1mnimda', 'k1mnimda'
  ),
  (
    'MERCH',
    '{"en": "Merch", "fi": "Fanituotteet", "sv": "Merchandise"}'::JSONB,
    '{"en": "Club merchandise and branded items", "fi": "Kerhon fanituotteet ja bränditavarat", "sv": "Klubbmerchandise och märkesartiklar"}'::JSONB,
    TRUE, 20, 'k1mnimda', 'k1mnimda'
  ),
  (
    'THEORY',
    '{"en": "Theory Courses", "fi": "Teoriamateriaalit", "sv": "Teorikurser"}'::JSONB,
    '{"en": "Aviation theory courses and study materials", "fi": "Lentoteoriakurssit ja opiskelumateriaalit", "sv": "Luftfartsteori­kurser och studiematerial"}'::JSONB,
    TRUE, 30, 'k1mnimda', 'k1mnimda'
  ),
  (
    'MAPS',
    '{"en": "Maps", "fi": "Kartat", "sv": "Kartor"}'::JSONB,
    '{"en": "Aviation charts and navigation maps", "fi": "Lentokartaston kartat ja navigointikartat", "sv": "Luftfartskartor och navigeringskartor"}'::JSONB,
    TRUE, 40, 'k1mnimda', 'k1mnimda'
  ),
  (
    'MISC',
    '{"en": "Misc", "fi": "Muut", "sv": "Övrigt"}'::JSONB,
    '{"en": "Miscellaneous items", "fi": "Muut tuotteet", "sv": "Övriga artiklar"}'::JSONB,
    TRUE, 50, 'k1mnimda', 'k1mnimda'
  );
