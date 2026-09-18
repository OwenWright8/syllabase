-- Add semester_start field to profiles
ALTER TABLE public.profiles 
ADD COLUMN semester_start date DEFAULT NULL;