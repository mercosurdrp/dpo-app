-- 121: Política de inventario — piso uniforme de 8 días y techo de 1 mes (salvo Marketplace)
-- La 120 sembró piso 3 / techos 21–45, pero corrió con ON CONFLICT DO NOTHING, así que
-- los valores ya existentes en prod no se actualizan solos. Este UPDATE los normaliza:
--   piso 8 para todos · techo 30 (1 mes) salvo 'otro' (Otros/Marketplace) que queda en 45.

UPDATE pronostico_politica
   SET min_dias = 8,
       max_dias = CASE WHEN segmento = 'otro' THEN 45 ELSE 30 END,
       updated_at = now();
