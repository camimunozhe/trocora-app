-- Tracking de mensajes leídos por participante en cada meetup, para el badge de
-- "Intercambios" en el bottom tab. Cada lado guarda su propio timestamp.

ALTER TABLE meetups
  ADD COLUMN IF NOT EXISTS proposer_last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS receiver_last_read_at timestamptz;

-- Suma de:
--   (a) meetups donde soy receiver y status = 'pending' (esperan mi respuesta)
--   (b) meetups (de cualquier lado) con al menos un mensaje del otro lado
--       posterior a mi last_read_at
-- Cuenta cada meetup una sola vez (DISTINCT) — un meetup pending con mensajes
-- nuevos suma 1, no 2.

CREATE OR REPLACE FUNCTION get_inbox_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT m.id)::int
  FROM meetups m
  LEFT JOIN messages msg
    ON msg.meetup_id = m.id
   AND msg.sender_id <> p_user_id
   AND msg.created_at > COALESCE(
         CASE WHEN m.proposer_id = p_user_id THEN m.proposer_last_read_at
              WHEN m.receiver_id = p_user_id THEN m.receiver_last_read_at
         END,
         'epoch'::timestamptz
       )
  WHERE (m.proposer_id = p_user_id OR m.receiver_id = p_user_id)
    AND (
      (m.receiver_id = p_user_id AND m.status = 'pending')
      OR msg.id IS NOT NULL
    );
$$;

GRANT EXECUTE ON FUNCTION get_inbox_count(uuid) TO authenticated;
