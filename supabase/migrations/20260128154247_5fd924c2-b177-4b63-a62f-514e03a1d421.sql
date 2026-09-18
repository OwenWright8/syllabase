-- Add image_url column to flashcard_cards for image support
ALTER TABLE public.flashcard_cards 
ADD COLUMN image_url text DEFAULT NULL;