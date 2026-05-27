-- Habilita la propagación de cambios de `meetups` por Realtime. Sin esto, las
-- subscripciones a `postgres_changes` sobre `meetups` no reciben eventos.
--
-- Por qué: el badge del bottom tab y la lista de Intercambios se suscriben a
-- UPDATE de `meetups` (filtrado por proposer_id/receiver_id) para actualizar
-- en vivo cuando cambia el status o cuando se hace `markAsRead`. Con `messages`
-- ya estaba en la publicación; faltaba `meetups`.

ALTER PUBLICATION supabase_realtime ADD TABLE meetups;
