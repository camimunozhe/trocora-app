-- Elimina el concepto de carpetas default por juego en `collection_folders`.
-- Las carpetas default existentes se convierten en carpetas normales (preservan
-- las cartas que tienen adentro). Las columnas `is_default` y `game` se eliminan.

UPDATE collection_folders SET is_default = false, game = NULL;
ALTER TABLE collection_folders DROP COLUMN is_default;
ALTER TABLE collection_folders DROP COLUMN game;
