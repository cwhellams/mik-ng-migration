-- Add instant messaging contact fields to member register table
-- Users will provide direct links to their IM profiles
ALTER TABLE member.register
ADD COLUMN im_whatsapp VARCHAR(255),
    ADD COLUMN im_telegram VARCHAR(255),
    ADD COLUMN im_facebook_messenger VARCHAR(255),
    ADD COLUMN im_discord VARCHAR(255),
    ADD COLUMN im_viber VARCHAR(255),
    ADD COLUMN im_signal VARCHAR(255);