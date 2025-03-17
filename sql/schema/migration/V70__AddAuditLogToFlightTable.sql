CREATE TABLE flight.logs_audit (
    audit_id SERIAL PRIMARY KEY,
    flight_id INT NOT NULL,
    operation_type TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    changed_data JSONB, -- Stores the old data for DELETE and UPDATE
    new_data JSONB, -- Stores the new data for INSERT and UPDATE
    changed_by TEXT NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE OR REPLACE FUNCTION flight.logs_audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO flight.logs_audit (flight_id, operation_type, changed_data, changed_by)
        VALUES (OLD.flight_id, 'DELETE', to_jsonb(OLD), OLD.updated_by);
        
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO flight.logs_audit (flight_id, operation_type, changed_data, new_data, changed_by)
        VALUES (NEW.flight_id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), NEW.updated_by);

    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO flight.logs_audit (flight_id, operation_type, new_data, changed_by)
        VALUES (NEW.flight_id, 'INSERT', to_jsonb(NEW), NEW.created_by);
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER logs_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON flight.logs
FOR EACH ROW EXECUTE FUNCTION flight.logs_audit_trigger_function();
