import { createClient } from '@supabase/supabase-js'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan envs SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(url, key)
const { data: cats, error: e1 } = await sb.from('requisitos_legales_categorias').select('slug, nombre, tipo_identificador').order('orden')
if (e1) { console.log('FAIL cats:', e1.message); process.exit(1) }
console.log('Categorías:', cats.length)
cats.forEach(c => console.log(`  ${c.slug.padEnd(20)} ${c.nombre.padEnd(35)} (${c.tipo_identificador})`))
const { data: cfg } = await sb.from('requisitos_legales_alertas_config').select('email').order('email')
console.log('\nEmails alertas:', cfg?.length, '→', cfg?.map(c => c.email).join(', '))
const { data: bk } = await sb.storage.listBuckets()
console.log('\nBucket "requisitos-legales":', bk?.find(b => b.id === 'requisitos-legales') ? 'OK' : 'FALTA')
