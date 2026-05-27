-- RPC para mostrar badge de mensajes no leídos por fila en la lista de Intercambios.
-- Devuelve solo meetups activos del usuario que tienen al menos un mensaje del
-- otro lado posterior a su last_read_at.

CREATE OR REPLACE FUNCTION get_my_meetup_unread_counts(p_user_id uuid)
RETURNS TABLE (meetup_id uuid, unread_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, COUNT(msg.id)::int
  FROM meetups m
  JOIN messages msg
    ON msg.meetup_id = m.id
   AND msg.sender_id <> p_user_id
   AND msg.created_at > COALESCE(
         CASE WHEN m.proposer_id = p_user_id THEN m.proposer_last_read_at
              WHEN m.receiver_id = p_user_id THEN m.receiver_last_read_at
         END,
         'epoch'::timestamptz
       )
  WHERE (m.proposer_id = p_user_id OR m.receiver_id = p_user_id)
    AND m.status NOT IN ('completed', 'cancelled')
  GROUP BY m.id;
$$;

GRANT EXECUTE ON FUNCTION get_my_meetup_unread_counts(uuid) TO authenticated;
