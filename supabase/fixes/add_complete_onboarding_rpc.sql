-- RPC to mark onboarding as completed for the calling user.
-- SECURITY DEFINER bypasses RLS so it always works even without an UPDATE policy.
CREATE OR REPLACE FUNCTION public.complete_onboarding()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET onboarding_completed = true,
      updated_at = NOW()
  WHERE id = auth.uid();
END;
$$;
