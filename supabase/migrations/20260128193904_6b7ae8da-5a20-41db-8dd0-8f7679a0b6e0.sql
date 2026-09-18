-- Remove flashcard tables and their associated data
-- First drop the tables that have foreign key dependencies

-- Drop the readings foreign key constraint to flashcard_decks
ALTER TABLE public.readings DROP CONSTRAINT IF EXISTS readings_flashcard_deck_id_fkey;

-- Drop flashcard_cards table (depends on flashcard_decks)
DROP TABLE IF EXISTS public.flashcard_cards CASCADE;

-- Drop flashcard_stats table (depends on courses but we're not dropping courses)
DROP TABLE IF EXISTS public.flashcard_stats CASCADE;

-- Drop flashcard_decks table
DROP TABLE IF EXISTS public.flashcard_decks CASCADE;