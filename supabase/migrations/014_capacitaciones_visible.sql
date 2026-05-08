-- Add visible toggle to capacitaciones (default false = hidden from employees)
ALTER TABLE capacitaciones ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT false;
