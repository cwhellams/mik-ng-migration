-- Add the new PRIVATE value to the booking_type enum
ALTER TYPE public.booking_type ADD VALUE IF NOT EXISTS 'PRIVATE';
