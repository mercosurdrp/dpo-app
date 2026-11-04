-- mantenimiento_residuos tenía RLS prendido y policies de SELECT, INSERT y
-- DELETE, pero NINGUNA de UPDATE. Con RLS, un UPDATE sin policy no falla: matchea
-- cero filas y devuelve éxito. Por eso el botón "Solicitada" no quedaba marcado y
-- el editor de litros tampoco guardaba — los dos escribían contra la nada y la
-- app no tenía cómo enterarse.
--
-- Mismo criterio que el DELETE: sólo admin y supervisor.

CREATE POLICY "mtto_residuos_update" ON mantenimiento_residuos
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));
