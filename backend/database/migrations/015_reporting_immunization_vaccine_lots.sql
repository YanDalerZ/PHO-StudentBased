-- New lot values are intentionally NULL for historical rows. The legacy shared
-- lot_batch_no cannot be assigned to a specific vaccine without evidence.
ALTER TABLE IMMUNIZATION
    ADD COLUMN IF NOT EXISTS lot_batch_td1 VARCHAR(100),
    ADD COLUMN IF NOT EXISTS lot_batch_mr1 VARCHAR(100),
    ADD COLUMN IF NOT EXISTS lot_batch_hpv1 VARCHAR(100),
    ADD COLUMN IF NOT EXISTS lot_batch_hpv2 VARCHAR(100),
    ADD COLUMN IF NOT EXISTS lot_batch_td2 VARCHAR(100),
    ADD COLUMN IF NOT EXISTS lot_batch_mr2 VARCHAR(100);
