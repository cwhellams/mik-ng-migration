CREATE OR REPLACE FUNCTION public.format_flight_time(total_minutes bigint)
RETURNS text AS $$
BEGIN
  RETURN floor(total_minutes / 60)::text
         || ':' ||
         lpad((total_minutes % 60)::text, 2, '0');
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;
