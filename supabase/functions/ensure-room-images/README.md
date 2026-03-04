# ensure-room-images

Downloads a featured image for each room that doesn't have one, uploads it to Storage, and saves the public URL in `rooms.featured_image_url`.

## Setup

1. **Add column** (if your `rooms` table already existed):
   - Run the migration in `supabase/migrations/20250304000000_add_rooms_featured_image_url.sql`, or
   - In SQL Editor: `alter table public.rooms add column if not exists featured_image_url text;`

2. **Create Storage bucket** (once per project):
   - In Dashboard: Storage → New bucket → name `room-images`, set **Public bucket** to true, Create.
   - Or in SQL Editor:
     ```sql
     insert into storage.buckets (id, name, public) values ('room-images', 'room-images', true)
       on conflict (id) do update set public = true;
     ```

3. **Deploy**: `supabase functions deploy ensure-room-images`

## Flow

- Frontend calls this function when loading Meeting Rooms if any room has no `featured_image_url`.
- Function fetches rooms for the current user's company (or all rooms for sys_admin) where `featured_image_url` is null.
- For each such room it downloads an image from a fixed Unsplash list, uploads to `room-images/room-<id>.jpg`, then updates `rooms.featured_image_url` with the public URL.
- Frontend reloads rooms so cards show the saved image.
