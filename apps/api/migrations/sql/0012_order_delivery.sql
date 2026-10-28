ALTER TABLE orders ADD COLUMN recipient_phone varchar(30) NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN delivery_note varchar(300) NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN courier varchar(100) NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN tracking_number varchar(100) NOT NULL DEFAULT '';
