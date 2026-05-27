-- Follow-up de 2026_05_meetup_last_read_at:
--
-- 1) Backfill: marcamos como leído "hasta ahora" cualquier meetup existente
--    para que la migración no genere counts espurios. Sin esto, todos los
--    meetups viejos quedaban con NULL → epoch (1970) → todos sus mensajes
--    se contaban como sin leer.
--
-- 2) Excluir 'completed' y 'cancelled' del conteo de unread: si el trade ya
--    terminó, los mensajes viejos no deberían seguir generando badge. Los
--    meetups 'pending' siguen contando aunque no tengan mensajes (es el
--    "te están esperando para responder").

UPDATE meetups
SET proposer_last_read_at = COALESCE(proposer_last_read_at, NOW())
WHERE proposer_last_read_at IS NULL;

UPDATE meetups
SET receiver_last_read_at = COALESCE(receiver_last_read_at, NOW())
WHERE receiver_last_read_at IS NULL;

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
      OR (msg.id IS NOT NULL AND m.status NOT IN ('completed', 'cancelled'))
    );
$$;
