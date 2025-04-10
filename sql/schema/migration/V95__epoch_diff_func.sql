-- Create an immutable function to format time difference in HH:MM
CREATE OR REPLACE FUNCTION epoch_diff_to_hhmm(
    start_epoch bigint, end_epoch bigint
)
RETURNS text AS $$
DECLARE
    diff_minutes integer;
BEGIN
    -- Calculate difference in minutes
    diff_minutes := (end_epoch - start_epoch) / 60;
    
    -- Format as HH:MM
    RETURN LPAD(FLOOR(diff_minutes / 60)::text, 2, '0') || ':' || 
           LPAD((diff_minutes % 60)::text, 2, '0');
END;
$$ LANGUAGE plpgsql IMMUTABLE;
