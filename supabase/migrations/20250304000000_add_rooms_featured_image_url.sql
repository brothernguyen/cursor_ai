-- Add featured_image_url to rooms (run if your rooms table was created before this column)
alter table public.rooms add column if not exists featured_image_url text;
